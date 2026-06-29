import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { v4 as uuidv4 } from 'uuid'
import OpenAI from 'openai'
import { AGENTS, SYNTHESIS_SYSTEM_PROMPT, buildSuggestionsPrompt } from './agents.js'

const cerebras = new OpenAI({
  apiKey: process.env.CEREBRAS_API_KEY!,
  baseURL: 'https://api.cerebras.ai/v1',
})

const MODEL = 'gemma-4-31b'

interface AgentDefinition {
  index: number
  name: string
  label: string
  description: string
  systemPrompt: string
  round2Instruction: string
}

interface Round {
  number: number
  injection?: string
  injectionType?: 'constraint' | 'evidence' | 'flip'
  targetAgent?: number
  responses: Record<number, string>
}

interface DebateSession {
  id: string
  input: { text: string; image?: string }
  rounds: Round[]
  synthesis: string
  phase: 'debating' | 'awaiting_injection' | 'synthesizing' | 'complete'
  sseClients: Set<express.Response>
  agentDefs: AgentDefinition[]
}

const sessions = new Map<string, DebateSession>()

function broadcast(sessionId: string, data: Record<string, unknown>) {
  const session = sessions.get(sessionId)
  if (!session) return
  const payload = `data: ${JSON.stringify(data)}\n\n`
  session.sseClients.forEach((client) => {
    try { client.write(payload) } catch {}
  })
}

type MessageContent = string | Array<{ type: string; text?: string; image_url?: { url: string } }>

function buildContent(text: string, image?: string): MessageContent {
  if (!image) return text
  return [
    { type: 'text', text },
    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } },
  ]
}

function buildCustomSystemPrompt(name: string, description: string): string {
  return `You are "${name}" in a structured multi-agent debate. Your perspective: ${description}. Argue from this viewpoint as forcefully as possible. Address other agents by name when responding to their points. End with your strongest argument from this perspective.`
}

function buildCustomRound2Instruction(name: string): string {
  return `This is a subsequent debate round. You are still "${name}". You have read all previous rounds. Address other agents by name where they are wrong. Change your position only if genuinely convinced — say why. Respond directly to the injection.`
}

async function runRound(sessionId: string, roundIndex: number) {
  const session = sessions.get(sessionId)
  if (!session) return

  const round = session.rounds[roundIndex]
  const agentDefs = session.agentDefs

  const agentPromises = agentDefs.map(async (agentDef) => {
    try {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = []

      if (roundIndex === 0) {
        messages.push({ role: 'system', content: agentDef.systemPrompt })
        messages.push({ role: 'user', content: buildContent(session.input.text, session.input.image) as any })
      } else {
        let historyText = `Original topic: ${session.input.text}\n\n`

        session.rounds.slice(0, roundIndex).forEach((r) => {
          historyText += `ROUND ${r.number}:\n`
          agentDefs.forEach((a) => {
            historyText += `${a.label}:\n${r.responses[a.index] ?? '(no response)'}\n\n`
          })
          if (r.injection) {
            historyText += `Human injection [${r.injectionType?.toUpperCase()}]${
                r.targetAgent !== undefined ? ` targeting ${agentDefs[r.targetAgent]?.name}` : ''
            }: "${r.injection}"\n\n`
          }
          historyText += '---\n\n'
        })

        historyText += `Now give your Round ${round.number} response as ${agentDef.name}. Address what has changed since the previous round. Reference specific agents by name. Respond directly to the injection.`

        messages.push({ role: 'system', content: agentDef.systemPrompt + '\n\n' + agentDef.round2Instruction })
        messages.push({ role: 'user', content: buildContent(historyText, session.input.image) as any })
      }

      const stream = await cerebras.chat.completions.create({
        model: MODEL,
        messages,
        stream: true,
      })

      for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta?.content ?? ''
        if (token) {
          round.responses[agentDef.index] = (round.responses[agentDef.index] ?? '') + token
          broadcast(sessionId, { type: 'agent_token', agentIndex: agentDef.index, roundNumber: round.number, token })
        }
      }

      broadcast(sessionId, { type: 'agent_done', agentIndex: agentDef.index, roundNumber: round.number })
    } catch (err: any) {
      console.error(`Agent ${agentDef.name} error:`, err.message)
      broadcast(sessionId, { type: 'agent_error', agentIndex: agentDef.index, message: err.message })
    }
  })

  await Promise.all(agentPromises)

  broadcast(sessionId, { type: 'round_complete', roundNumber: round.number })

  session.phase = 'awaiting_injection'

  if (roundIndex > 0) runPositionAnalysis(sessionId, roundIndex)
  generateSuggestions(sessionId)
}

async function runPositionAnalysis(sessionId: string, roundIndex: number) {
  const session = sessions.get(sessionId)
  if (!session || roundIndex < 1) return

  const prevRound = session.rounds[roundIndex - 1]
  const currentRound = session.rounds[roundIndex]

  await Promise.allSettled(
      session.agentDefs.map(async (agentDef) => {
        const prev = prevRound.responses[agentDef.index] ?? ''
        const current = currentRound.responses[agentDef.index] ?? ''
        if (!prev || !current) return

        try {
          const response = await cerebras.chat.completions.create({
            model: MODEL,
            messages: [{
              role: 'user',
              content: `Analyze whether this debate agent changed their position between rounds.

Agent: ${agentDef.name}
Round ${prevRound.number} (first 350 chars): "${prev.slice(0, 350)}"
Round ${currentRound.number} (first 350 chars): "${current.slice(0, 350)}"

Did this agent meaningfully shift, soften, or reverse their core argument?
Reply with ONLY one of these exact formats:
SHIFTED: [one short sentence describing the change]
HOLDING: [one short sentence confirming they held their position]`,
            }],
            max_tokens: 80,
          })

          const raw = response.choices[0]?.message?.content?.trim() ?? ''
          const shifted = raw.startsWith('SHIFTED')
          const summary = raw.replace(/^(SHIFTED|HOLDING):\s*/, '').trim()

          broadcast(sessionId, {
            type: 'position_analysis',
            agentIndex: agentDef.index,
            roundNumber: currentRound.number,
            shifted,
            summary,
          })
        } catch {
          // Non-critical — silently skip
        }
      })
  )
}

async function generateSuggestions(sessionId: string) {
  const session = sessions.get(sessionId)
  if (!session) return

  const latestRound = session.rounds[session.rounds.length - 1]
  const context = session.agentDefs
      .map((a) => `${a.label}: ${latestRound.responses[a.index] ?? ''}`)
      .join('\n\n')

  const INJECTION_TYPES = ['constraint', 'evidence', 'flip'] as const

  const fallbacks: Record<string, string[]> = {
    constraint: ['Assume a hard budget cap of $50M total', 'All decisions must be made in under 24 hours', 'No external expertise or consultants allowed'],
    evidence: ['New data shows the opposite has been true for the past decade', 'A major industry player just proved this wrong publicly', 'Independent research contradicts the most popular position here'],
    flip: ["The Pragmatist must now argue the opposite position", "The Skeptic must defend the most optimistic view", "The Devil's Advocate must now support the consensus"],
  }

  const results = await Promise.allSettled(
      INJECTION_TYPES.map(async (injType) => {
        const response = await cerebras.chat.completions.create({
          model: MODEL,
          messages: [{ role: 'user', content: buildSuggestionsPrompt(context, injType) }],
          max_tokens: 200,
        })
        const raw = response.choices[0]?.message?.content ?? '[]'
        const cleaned = raw.replace(/```json|```/g, '').trim()
        return { injType, suggestions: JSON.parse(cleaned) as string[] }
      })
  )

  const suggestionsByType: Record<string, string[]> = { ...fallbacks }
  for (const result of results) {
    if (result.status === 'fulfilled') {
      suggestionsByType[result.value.injType] = result.value.suggestions
    }
  }

  broadcast(sessionId, { type: 'suggestions', suggestionsByType })
}

async function runSynthesis(sessionId: string) {
  const session = sessions.get(sessionId)
  if (!session) return

  let context = `Topic: ${session.input.text}\n\n`

  session.rounds.forEach((r) => {
    context += `ROUND ${r.number}:\n`
    session.agentDefs.forEach((a) => {
      context += `${a.label}:\n${r.responses[a.index] ?? ''}\n\n`
    })
    if (r.injection) {
      context += `Human Injection [${r.injectionType?.toUpperCase()}]${
          r.targetAgent !== undefined ? ` (targeting ${session.agentDefs[r.targetAgent]?.name})` : ''
      }: "${r.injection}"\n\n`
    }
    context += '---\n\n'
  })

  try {
    const stream = await cerebras.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYNTHESIS_SYSTEM_PROMPT },
        { role: 'user', content: context },
      ],
      stream: true,
    })

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content ?? ''
      if (token) {
        session.synthesis += token
        broadcast(sessionId, { type: 'synthesis_token', token })
      }
    }

    session.phase = 'complete'
    broadcast(sessionId, { type: 'synthesis_done' })
  } catch (err: any) {
    broadcast(sessionId, { type: 'error', message: err.message })
  }
}

const app = express()
app.use(cors())
app.use(express.json({ limit: '15mb' }))

app.get('/api/debate/:id/stream', (req, res) => {
  const session = sessions.get(req.params.id)
  if (!session) { res.status(404).json({ error: 'Session not found' }); return }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.flushHeaders()

  session.sseClients.add(res)
  req.on('close', () => session.sseClients.delete(res))
})

app.post('/api/debate/start', async (req, res) => {
  const { text, image, customAgents } = req.body as {
    text: string
    image?: string
    customAgents?: { name: string; description: string }[]
  }

  if (!text?.trim()) { res.status(400).json({ error: 'text is required' }); return }

  const agentDefs: AgentDefinition[] = customAgents?.length === 4
      ? customAgents.map((ca, i) => ({
        index: i,
        name: ca.name,
        label: ca.name.toUpperCase(),
        description: ca.description,
        systemPrompt: buildCustomSystemPrompt(ca.name, ca.description),
        round2Instruction: buildCustomRound2Instruction(ca.name),
      }))
      : AGENTS.map((a) => ({
        index: a.index,
        name: a.name,
        label: a.label,
        description: '',
        systemPrompt: a.systemPrompt,
        round2Instruction: a.round2Instruction,
      }))

  const id = uuidv4()
  const session: DebateSession = {
    id,
    input: { text: text.trim(), image },
    rounds: [{ number: 1, responses: {} }],
    synthesis: '',
    phase: 'debating',
    sseClients: new Set(),
    agentDefs,
  }

  sessions.set(id, session)
  res.json({
    debateId: id,
    agentDefs: agentDefs.map((a) => ({ index: a.index, name: a.name, label: a.label, description: a.description })),
  })

  runRound(id, 0)
})

app.post('/api/debate/:id/inject', (req, res) => {
  const session = sessions.get(req.params.id)
  if (!session) { res.status(404).json({ error: 'Session not found' }); return }

  const { injection, injectionType, targetAgent } = req.body as {
    injection: string
    injectionType: 'constraint' | 'evidence' | 'flip'
    targetAgent?: number
  }

  if (!injection?.trim()) { res.status(400).json({ error: 'injection text is required' }); return }

  const nextRoundNumber = session.rounds.length + 1
  const newRound: Round = {
    number: nextRoundNumber,
    injection: injection.trim(),
    injectionType,
    targetAgent,
    responses: {},
  }

  session.rounds.push(newRound)
  session.phase = 'debating'

  res.json({ success: true, roundNumber: nextRoundNumber })
  runRound(session.id, session.rounds.length - 1)
})

app.post('/api/debate/:id/synthesize', (req, res) => {
  const session = sessions.get(req.params.id)
  if (!session) { res.status(404).json({ error: 'Session not found' }); return }

  session.phase = 'synthesizing'
  res.json({ success: true })
  runSynthesis(session.id)
})

app.get('/api/debate/:id', (req, res) => {
  const session = sessions.get(req.params.id)
  if (!session) { res.status(404).json({ error: 'Session not found' }); return }

  res.json({
    id: session.id,
    phase: session.phase,
    rounds: session.rounds.map((r) => ({
      number: r.number,
      injection: r.injection,
      injectionType: r.injectionType,
      targetAgent: r.targetAgent,
      responses: r.responses,
    })),
    synthesis: session.synthesis,
  })
})

const PORT = Number(process.env.PORT ?? 3001)
app.listen(PORT, () => console.log(`mod-the-agents server on :${PORT}`))