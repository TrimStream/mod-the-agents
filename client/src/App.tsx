import { useState, useEffect, useRef, useCallback } from 'react'
import './styles.css'
import { Phase, InjectionType, DEFAULT_AGENT_META, AGENT_COLORS, AgentMeta, RoundData, PositionShift } from './types'
import { InputPanel } from './components/InputPanel'
import { AgentPanel } from './components/AgentPanel'
import { InjectionBar } from './components/InjectionBar'
import { SynthesisPanel } from './components/SynthesisPanel'

const API = 'http://localhost:3001'
const AGENT_COUNT = 4

const PHASE_LABELS: Record<Phase, string> = {
  idle: '',
  debating: 'Debating',
  awaiting_injection: 'Inject to continue',
  synthesizing: 'Synthesizing',
  complete: 'Complete',
}

export default function App() {
  // Theme
  const [darkMode, setDarkMode] = useState(() =>
      window.matchMedia('(prefers-color-scheme: dark)').matches
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  // Debate identity
  const [debateId, setDebateId] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [currentRound, setCurrentRound] = useState(1)

  // Agent definitions (overridable by custom agents)
  const [agentMeta, setAgentMeta] = useState<AgentMeta[]>(DEFAULT_AGENT_META)

  // Input
  const [inputText, setInputText] = useState('')
  const [inputImage, setInputImage] = useState<string | null>(null)
  const [imageFilename, setImageFilename] = useState<string | null>(null)

  // Round texts: roundTexts[roundIndex][agentIndex]
  const [roundTexts, setRoundTexts] = useState<string[][]>([])
  const roundBuffers = useRef<Map<number, string[]>>(new Map())

  // Streaming: which agents are currently streaming
  const [streamingAgents, setStreamingAgents] = useState<boolean[]>(Array(AGENT_COUNT).fill(false))

  // Position shifts: key = `${roundNumber}-${agentIndex}`
  const [positionShifts, setPositionShifts] = useState<Record<string, PositionShift>>({})

  // Injections per round (stored for display in agent panels)
  const [roundInjections, setRoundInjections] = useState<{ text: string; type: string; targetAgent?: number }[]>([])

  // Synthesis
  const [synthesis, setSynthesis] = useState('')
  const synthBuffer = useRef('')

  // Injection state
  const [injection, setInjection] = useState('')
  const [injectionType, setInjectionType] = useState<InjectionType>('constraint')
  const [targetAgent, setTargetAgent] = useState<number | null>(null)
  const [suggestionsByType, setSuggestionsByType] = useState<Record<string, string[]>>({})

  // SSE
  const esRef = useRef<EventSource | null>(null)

  // Flush token buffers into state every 30ms
  useEffect(() => {
    const id = setInterval(() => {
      let hasUpdates = false
      const updates: { roundNum: number; texts: string[] }[] = []

      roundBuffers.current.forEach((buf, roundNum) => {
        if (buf.some((b) => b)) {
          updates.push({ roundNum, texts: [...buf] })
          roundBuffers.current.set(roundNum, Array(AGENT_COUNT).fill(''))
          hasUpdates = true
        }
      })

      if (hasUpdates) {
        setRoundTexts((prev) => {
          const next = [...prev]
          for (const { roundNum, texts } of updates) {
            const idx = roundNum - 1
            while (next.length <= idx) next.push(Array(AGENT_COUNT).fill(''))
            next[idx] = (next[idx] ?? Array(AGENT_COUNT).fill('')).map((t, i) => t + texts[i])
          }
          return next
        })
      }

      const s = synthBuffer.current
      if (s) {
        setSynthesis((prev) => prev + s)
        synthBuffer.current = ''
      }
    }, 30)

    return () => clearInterval(id)
  }, [])

  const handleEvent = useCallback((raw: string) => {
    let data: Record<string, unknown>
    try { data = JSON.parse(raw) } catch { return }

    switch (data.type) {
      case 'agent_token': {
        const idx = data.agentIndex as number
        const roundNum = data.roundNumber as number
        const buf = roundBuffers.current.get(roundNum) ?? Array(AGENT_COUNT).fill('')
        buf[idx] += data.token as string
        roundBuffers.current.set(roundNum, buf)
        break
      }

      case 'agent_done': {
        const idx = data.agentIndex as number
        setStreamingAgents((prev) => prev.map((v, i) => (i === idx ? false : v)))
        break
      }

      case 'round_complete':
        setStreamingAgents(Array(AGENT_COUNT).fill(false))
        setPhase('awaiting_injection')
        break

      case 'position_analysis': {
        const key = `${data.roundNumber}-${data.agentIndex}`
        setPositionShifts((prev) => ({
          ...prev,
          [key]: { shifted: data.shifted as boolean, summary: data.summary as string },
        }))
        break
      }

      case 'suggestions':
        setSuggestionsByType(data.suggestionsByType as Record<string, string[]>)
        break

      case 'synthesis_token':
        synthBuffer.current += data.token as string
        break

      case 'synthesis_done':
        setPhase('complete')
        break

      case 'agent_error':
        console.error('Agent error:', data.agentIndex, data.message)
        break

      case 'error':
        setError(data.message as string)
        break
    }
  }, [])

  const connectSSE = useCallback((id: string) => {
    if (esRef.current) esRef.current.close()
    const es = new EventSource(`${API}/api/debate/${id}/stream`)
    es.onmessage = (e) => handleEvent(e.data)
    esRef.current = es
  }, [handleEvent])

  useEffect(() => () => esRef.current?.close(), [])

  const startDebate = async (customAgents?: { name: string; description: string }[]) => {
    setError(null)
    setRoundTexts([])
    setSynthesis('')
    setSuggestionsByType({})
    setInjection('')
    setTargetAgent(null)
    setPositionShifts({})
    setRoundInjections([])
    setCurrentRound(1)
    roundBuffers.current = new Map()
    synthBuffer.current = ''

    try {
      const res = await fetch(`${API}/api/debate/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText, image: inputImage ?? undefined, customAgents }),
      })
      if (!res.ok) { setError(await res.text()); return }

      const { debateId: id, agentDefs } = await res.json()

      // Update agent meta if custom agents were returned
      if (agentDefs) {
        setAgentMeta(agentDefs.map((a: { index: number; name: string; label: string; description: string }, i: number) => ({
          index: a.index,
          name: a.name,
          label: a.label,
          description: a.description,
          color: AGENT_COLORS[i]?.color ?? '#888',
          bgColor: AGENT_COLORS[i]?.bgColor ?? '#F8F8F8',
        })))
      }

      setDebateId(id)
      setPhase('debating')
      setStreamingAgents(Array(AGENT_COUNT).fill(true))
      connectSSE(id)
    } catch (err: any) {
      setError(err.message)
    }
  }

  const submitInjection = async () => {
    if (!debateId) return
    setError(null)

    const injData = { text: injection, type: injectionType, targetAgent: targetAgent ?? undefined }
    setRoundInjections((prev) => [...prev, injData])
    setStreamingAgents(Array(AGENT_COUNT).fill(true))
    setCurrentRound((prev) => prev + 1)
    setPhase('debating')
    setSuggestionsByType({})
    setInjection('')
    setTargetAgent(null)

    try {
      const res = await fetch(`${API}/api/debate/${debateId}/inject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ injection, injectionType, targetAgent: targetAgent ?? undefined }),
      })
      if (!res.ok) { setError(await res.text()); return }
    } catch (err: any) {
      setError(err.message)
    }
  }

  const synthesize = async () => {
    if (!debateId) return
    setPhase('synthesizing')
    try {
      const res = await fetch(`${API}/api/debate/${debateId}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) { setError(await res.text()); return }
    } catch (err: any) {
      setError(err.message)
    }
  }

  const reset = () => {
    esRef.current?.close()
    setDebateId(null)
    setPhase('idle')
    setInputText('')
    setInputImage(null)
    setImageFilename(null)
    setRoundTexts([])
    setSynthesis('')
    setSuggestionsByType({})
    setInjection('')
    setTargetAgent(null)
    setPositionShifts({})
    setRoundInjections([])
    setCurrentRound(1)
    setAgentMeta(DEFAULT_AGENT_META)
    setError(null)
  }

  // Build round data per agent for display
  const getAgentRounds = (agentIndex: number): RoundData[] => {
    return roundTexts.map((roundAgentTexts, roundIdx) => {
      const roundNum = roundIdx + 1
      const isCurrentRound = roundNum === currentRound
      const isStreaming = isCurrentRound && streamingAgents[agentIndex]
      const injectionForRound = roundInjections[roundIdx - 1] // injection that triggered this round
      const shiftKey = `${roundNum}-${agentIndex}`

      return {
        roundNumber: roundNum,
        text: roundAgentTexts[agentIndex] ?? '',
        isStreaming,
        injection: injectionForRound,
        positionShift: roundNum > 1 ? positionShifts[shiftKey] : undefined,
      }
    })
  }

  const isDebating = phase === 'debating' || phase === 'synthesizing'
  const showDebateArea = phase !== 'idle'
  const showInjection = phase === 'awaiting_injection'
  const showSynthesis = phase === 'synthesizing' || phase === 'complete'

  return (
      <div className="app">
        <header className="header">
          <div className="header-left">
          <span className="header-logo">
            Mod the Agents <span>by TrimStream</span>
          </span>
            {phase !== 'idle' && (
                <span className={`phase-pill ${isDebating ? 'active' : ''}`}>
              {phase === 'debating' ? `Round ${currentRound} — ${PHASE_LABELS[phase]}` : PHASE_LABELS[phase]}
            </span>
            )}
          </div>
          <div className="header-right">
            <button
                className="theme-toggle"
                onClick={() => setDarkMode((d) => !d)}
                title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="8" cy="8" r="3.5" />
                    <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
                  </svg>
              ) : (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 3a5 5 0 1 0 5 5 3.5 3.5 0 0 1-5-5z" />
                  </svg>
              )}
            </button>
            {phase !== 'idle' && (
                <button className="new-debate-btn" onClick={reset}>New debate</button>
            )}
          </div>
        </header>

        {error && <div className="error-bar">{error}</div>}

        {phase === 'idle' && (
            <InputPanel
                value={inputText}
                onChange={setInputText}
                imageFilename={imageFilename}
                onImageChange={(b64, name) => { setInputImage(b64); setImageFilename(name) }}
                onImageClear={() => { setInputImage(null); setImageFilename(null) }}
                onSubmit={startDebate}
                disabled={isDebating}
            />
        )}

        {showDebateArea && (
            <div className="debate-area">
              <div className="topic-bar">
                <span className="topic-label">Topic</span>
                <span className="topic-text">{inputText}</span>
                {inputImage && <span className="topic-image-badge">+ image</span>}
              </div>

              <div className="debate-grid">
                {agentMeta.map((agent) => (
                    <AgentPanel
                        key={agent.index}
                        agent={agent}
                        rounds={getAgentRounds(agent.index)}
                    />
                ))}
              </div>

              {showInjection && (
                  <InjectionBar
                      injection={injection}
                      onInjectionChange={setInjection}
                      injectionType={injectionType}
                      onTypeChange={setInjectionType}
                      targetAgent={targetAgent}
                      onTargetAgentChange={setTargetAgent}
                      suggestions={suggestionsByType[injectionType] ?? []}
                      onSubmit={submitInjection}
                      onSynthesize={synthesize}
                      disabled={isDebating}
                      agentMeta={agentMeta}
                      roundNumber={currentRound}
                  />
              )}

              {showSynthesis && (
                  <SynthesisPanel text={synthesis} isStreaming={phase === 'synthesizing'} />
              )}
            </div>
        )}
      </div>
  )
}
