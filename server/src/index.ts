import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { v4 as uuidv4 } from 'uuid'
import OpenAI from 'openai'
import { AGENTS, SYNTHESIS_SYSTEM_PROMPT, buildSuggestionsPrompt } from './agents.js'

// ─── Cerebras client (OpenAI-compatible) ─────────────────────────────────────

const cerebras = new OpenAI({
  apiKey: process.env.CEREBRAS_API_KEY!,
  baseURL: 'https://api.cerebras.ai/v1',
})

const MODEL = 'gemma-4-31b'

// ─── Types ────────────────────────────────────────────────────────────────────

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
  phase: 'round1' | 'awaiting_injection' | 'round2' | 'synthesizing' | 'complete'
  sseClients: Set<express.Response>
}

const sessions = new Map<string, DebateSession>()

// ─── SSE helpers ─────────────────────────────────────────────────────────────

function broadcast(sessionId: string, data: Record<string, unknown>) {
  const session = sessions.get(sessionId)
  if (!session) return
  const payload = `data: ${JSON.stringify(data)}\n\n`
  session.sseClients.forEach((client) => {
    try {
      client.write(payload)
    } catch {
      // client disconnected
    }
  })
}

// ─── Message builders ─────────────────────────────────────────────────────────

type MessageContent = string | Array<{ type: string; text?: string; image_url?: { url: string } }>

function buildContent(text: string, image?: string): MessageContent {
  if (!image) return text
  return [
    { type: 'text', text },
    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } },
  ]
}

// ─── Core debate logic ────────────────────────────────────────────────────────

async function runRound(sessionId: string, roundIndex: number) {
  const session = sessions.get(sessionId)
  if (!session) return

  const round = session.rounds[roundIndex]
  const isRound2 = roundIndex === 1

  const agentPromises = AGENTS.map(async (agent) => {
    try {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = []

      if (!isRound2) {
        // Round 1: agent sees only the original input
        messages.push({ role: 'system', content: agent.systemPrompt })
        messages.push({
          role: 'user',
          content: buildContent(session.input.text, session.input.image) as any,
        })
      } else {
        // Round 2: agent sees round 1 responses + injection
        const round1 = session.rounds[0]
        const round1Context = AGENTS.map(
          (a) => `${a.label}:\n${round1.responses[a.index] ?? '(no response)'}`
        ).join('\n\n')

        const injectionNote = round.injection
          ? `\n\nHuman injection [${(round.injectionType ?? 'constraint').toUpperCase()}]${
              round.targetAgent !== undefined
                ? ` targeting ${AGENTS[round.targetAgent]?.name}`
                : ''
            }: "${round.injection}"`
          : ''

        const userText =
          `Original topic: ${session.input.text}\n\n` +
          `Round 1 responses from all agents:\n${round1Context}` +
          injectionNote +
          `\n\nNow give your Round 2 response as the ${agent.name}.`

        messages.push({
          role: 'system',
          content: agent.systemPrompt + '\n\n' + agent.round2Instruction,
        })
        messages.push({
          role: 'user',
          // Use injection image if provided, otherwise original
          content: buildContent(userText, session.input.image) as any,
        })
      }

      const stream = await cerebras.chat.completions.create({
        model: MODEL,
        messages,
        stream: true,
        max_tokens: 400,
      })

      for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta?.content ?? ''
        if (token) {
          round.responses[agent.index] = (round.responses[agent.index] ?? '') + token
          broadcast(sessionId, {
            type: 'agent_token',
            agentIndex: agent.index,
            roundNumber: round.number,
            token,
          })
        }
      }

      broadcast(sessionId, {
        type: 'agent_done',
        agentIndex: agent.index,
        roundNumber: round.number,
      })
    } catch (err: any) {
      console.error(`Agent ${agent.name} error:`, err.message)
      broadcast(sessionId, {
        type: 'agent_error',
        agentIndex: agent.index,
        message: err.message,
      })
    }
  })

  await Promise.all(agentPromises)

  broadcast(sessionId, { type: 'round_complete', roundNumber: round.number })

  // After Round 1: move to injection phase and generate suggestions
  if (!isRound2) {
    session.phase = 'awaiting_injection'
    generateSuggestions(sessionId)
  } else {
    // After Round 2: ready for synthesis
    session.phase = 'synthesizing'
    runSynthesis(sessionId)
  }
}

async function generateSuggestions(sessionId: string) {
  const session = sessions.get(sessionId)
  if (!session) return

  const round1 = session.rounds[0]
  const context = AGENTS.map(
    (a) => `${a.label}: ${round1.responses[a.index] ?? ''}`
  ).join('\n\n')

  try {
    const response = await cerebras.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: buildSuggestionsPrompt(context) }],
      max_tokens: 200,
    })

    const raw = response.choices[0]?.message?.content ?? '[]'
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const suggestions = JSON.parse(cleaned)
    broadcast(sessionId, { type: 'suggestions', suggestions })
  } catch {
    // Fallback suggestions if Cerebras call fails
    broadcast(sessionId, {
      type: 'suggestions',
      suggestions: [
        'Assume the budget is $0',
        'The deadline moved to 48 hours from now',
        'A competitor just shipped a similar product',
      ],
    })
  }
}

async function runSynthesis(sessionId: string) {
  const session = sessions.get(sessionId)
  if (!session) return

  const round1 = session.rounds[0]
  const round2 = session.rounds[1]

  let context = `Topic: ${session.input.text}\n\nROUND 1:\n`
  context += AGENTS.map((a) => `${a.label}:\n${round1.responses[a.index] ?? ''}`).join('\n\n')

  if (round2) {
    context += `\n\nHuman Injection [${(round2.injectionType ?? 'constraint').toUpperCase()}]`
    if (round2.targetAgent !== undefined) {
      context += ` (targeting ${AGENTS[round2.targetAgent]?.name})`
    }
    context += `: "${round2.injection}"\n\nROUND 2:\n`
    context += AGENTS.map((a) => `${a.label}:\n${round2.responses[a.index] ?? ''}`).join('\n\n')
  }

  try {
    const stream = await cerebras.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYNTHESIS_SYSTEM_PROMPT },
        { role: 'user', content: context },
      ],
      stream: true,
      max_tokens: 600,
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

// ─── Express app ──────────────────────────────────────────────────────────────

const app = express()
app.use(cors())
app.use(express.json({ limit: '15mb' })) // allow base64 images

// SSE — connect to debate stream
app.get('/api/debate/:id/stream', (req, res) => {
  const session = sessions.get(req.params.id)
  if (!session) {
    res.status(404).json({ error: 'Session not found' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.flushHeaders()

  session.sseClients.add(res)
  req.on('close', () => session.sseClients.delete(res))
})

// Start a new debate (Round 1)
app.post('/api/debate/start', async (req, res) => {
  const { text, image } = req.body as { text: string; image?: string }
  if (!text?.trim()) {
    res.status(400).json({ error: 'text is required' })
    return
  }

  const id = uuidv4()
  const session: DebateSession = {
    id,
    input: { text: text.trim(), image },
    rounds: [{ number: 1, responses: {} }],
    synthesis: '',
    phase: 'round1',
    sseClients: new Set(),
  }

  sessions.set(id, session)
  res.json({ debateId: id })

  // Fire round 1 asynchronously (SSE client connects independently)
  runRound(id, 0)
})

// Inject and trigger Round 2
app.post('/api/debate/:id/inject', (req, res) => {
  const session = sessions.get(req.params.id)
  if (!session) {
    res.status(404).json({ error: 'Session not found' })
    return
  }

  const { injection, injectionType, targetAgent } = req.body as {
    injection: string
    injectionType: 'constraint' | 'evidence' | 'flip'
    targetAgent?: number
  }

  if (!injection?.trim()) {
    res.status(400).json({ error: 'injection text is required' })
    return
  }

  const round2: Round = {
    number: 2,
    injection: injection.trim(),
    injectionType,
    targetAgent,
    responses: {},
  }

  session.rounds.push(round2)
  session.phase = 'round2'

  res.json({ success: true })
  runRound(session.id, 1)
})

// Get current session state (for reconnect / debug)
app.get('/api/debate/:id', (req, res) => {
  const session = sessions.get(req.params.id)
  if (!session) {
    res.status(404).json({ error: 'Session not found' })
    return
  }

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
