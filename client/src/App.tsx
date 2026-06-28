import { useState, useEffect, useRef, useCallback } from 'react'
import './styles.css'
import { Phase, InjectionType, AGENT_META } from './types'
import { InputPanel } from './components/InputPanel'
import { AgentPanel } from './components/AgentPanel'
import { InjectionBar } from './components/InjectionBar'
import { SynthesisPanel } from './components/SynthesisPanel'

const API = 'http://localhost:3001'
const AGENT_COUNT = 4

const PHASE_LABELS: Record<Phase, string> = {
  idle: '',
  round1: 'Round 1 — Debating',
  awaiting_injection: 'Round 1 complete — Inject to continue',
  round2: 'Round 2 — Debating',
  synthesizing: 'Synthesizing',
  complete: 'Complete',
}

export default function App() {
  // ─── Debate identity ──────────────────────────────────────────────────────
  const [debateId, setDebateId] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)

  // ─── Input ────────────────────────────────────────────────────────────────
  const [inputText, setInputText] = useState('')
  const [inputImage, setInputImage] = useState<string | null>(null)
  const [imageFilename, setImageFilename] = useState<string | null>(null)

  // ─── Agent text (buffered for high-TPS streaming) ─────────────────────────
  const [round1Texts, setRound1Texts] = useState<string[]>(Array(AGENT_COUNT).fill(''))
  const [round2Texts, setRound2Texts] = useState<string[]>(Array(AGENT_COUNT).fill(''))
  const round1Buffer = useRef<string[]>(Array(AGENT_COUNT).fill(''))
  const round2Buffer = useRef<string[]>(Array(AGENT_COUNT).fill(''))

  // ─── Streaming state per agent ────────────────────────────────────────────
  const [streamingR1, setStreamingR1] = useState<boolean[]>(Array(AGENT_COUNT).fill(false))
  const [streamingR2, setStreamingR2] = useState<boolean[]>(Array(AGENT_COUNT).fill(false))

  // ─── Synthesis ────────────────────────────────────────────────────────────
  const [synthesis, setSynthesis] = useState('')
  const synthBuffer = useRef('')

  // ─── Injection ────────────────────────────────────────────────────────────
  const [injection, setInjection] = useState('')
  const [injectionType, setInjectionType] = useState<InjectionType>('constraint')
  const [targetAgent, setTargetAgent] = useState<number | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])

  // ─── SSE ──────────────────────────────────────────────────────────────────
  const esRef = useRef<EventSource | null>(null)

  // ─── Token flush — batch buffer into state every 30ms ─────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const r1 = round1Buffer.current
      const r2 = round2Buffer.current
      const s = synthBuffer.current

      if (r1.some((b) => b)) {
        setRound1Texts((prev) => prev.map((t, i) => t + r1[i]))
        round1Buffer.current = Array(AGENT_COUNT).fill('')
      }
      if (r2.some((b) => b)) {
        setRound2Texts((prev) => prev.map((t, i) => t + r2[i]))
        round2Buffer.current = Array(AGENT_COUNT).fill('')
      }
      if (s) {
        setSynthesis((prev) => prev + s)
        synthBuffer.current = ''
      }
    }, 30)

    return () => clearInterval(id)
  }, [])

  // ─── SSE event handler ────────────────────────────────────────────────────
  const handleEvent = useCallback((raw: string) => {
    let data: Record<string, unknown>
    try {
      data = JSON.parse(raw)
    } catch {
      return
    }

    switch (data.type) {
      case 'agent_token': {
        const idx = data.agentIndex as number
        const token = data.token as string
        const round = data.roundNumber as number
        if (round === 1) round1Buffer.current[idx] += token
        else round2Buffer.current[idx] += token
        break
      }

      case 'agent_done': {
        const idx = data.agentIndex as number
        const round = data.roundNumber as number
        if (round === 1) setStreamingR1((prev) => prev.map((v, i) => (i === idx ? false : v)))
        else setStreamingR2((prev) => prev.map((v, i) => (i === idx ? false : v)))
        break
      }

      case 'round_complete': {
        const round = data.roundNumber as number
        if (round === 1) {
          setStreamingR1(Array(AGENT_COUNT).fill(false))
        } else {
          setStreamingR2(Array(AGENT_COUNT).fill(false))
        }
        break
      }

      case 'suggestions':
        setSuggestions(data.suggestions as string[])
        setPhase('awaiting_injection')
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

  const connectSSE = useCallback(
    (id: string) => {
      if (esRef.current) esRef.current.close()

      const es = new EventSource(`${API}/api/debate/${id}/stream`)
      es.onmessage = (e) => handleEvent(e.data)
      es.onerror = () => {
        // Connection will retry automatically; only surface if debate not complete
        if (phase !== 'complete') console.warn('SSE connection interrupted')
      }
      esRef.current = es
    },
    [handleEvent, phase]
  )

  useEffect(() => () => esRef.current?.close(), [])

  // ─── Start debate ─────────────────────────────────────────────────────────
  const startDebate = async () => {
    setError(null)
    setRound1Texts(Array(AGENT_COUNT).fill(''))
    setRound2Texts(Array(AGENT_COUNT).fill(''))
    setSynthesis('')
    setSuggestions([])
    setInjection('')
    setTargetAgent(null)
    round1Buffer.current = Array(AGENT_COUNT).fill('')
    round2Buffer.current = Array(AGENT_COUNT).fill('')
    synthBuffer.current = ''

    try {
      const res = await fetch(`${API}/api/debate/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText, image: inputImage ?? undefined }),
      })
      if (!res.ok) throw new Error(await res.text())
      const { debateId: id } = await res.json()

      setDebateId(id)
      setPhase('round1')
      setStreamingR1(Array(AGENT_COUNT).fill(true))
      connectSSE(id)
    } catch (err: any) {
      setError(err.message)
    }
  }

  // ─── Inject ───────────────────────────────────────────────────────────────
  const submitInjection = async () => {
    if (!debateId) return
    setError(null)
    setStreamingR2(Array(AGENT_COUNT).fill(true))
    setPhase('round2')

    try {
      const res = await fetch(`${API}/api/debate/${debateId}/inject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          injection,
          injectionType,
          targetAgent: targetAgent ?? undefined,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      // SSE handles the rest
    } catch (err: any) {
      setError(err.message)
    }
  }

  // ─── Reset ────────────────────────────────────────────────────────────────
  const reset = () => {
    esRef.current?.close()
    setDebateId(null)
    setPhase('idle')
    setInputText('')
    setInputImage(null)
    setImageFilename(null)
    setRound1Texts(Array(AGENT_COUNT).fill(''))
    setRound2Texts(Array(AGENT_COUNT).fill(''))
    setSynthesis('')
    setSuggestions([])
    setInjection('')
    setTargetAgent(null)
    setError(null)
  }

  // ─── Derived ──────────────────────────────────────────────────────────────
  const isDebating = phase === 'round1' || phase === 'round2' || phase === 'synthesizing'
  const showDebateArea = phase !== 'idle'
  const showInjection = phase === 'awaiting_injection'
  const showSynthesis = phase === 'synthesizing' || phase === 'complete'
  const hasRound2 = phase === 'round2' || phase === 'synthesizing' || phase === 'complete'

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <span className="header-logo">
          Mod the Agents <span>by TrimStream</span>
        </span>
        <div className="header-meta">
          {phase !== 'idle' && (
            <span className={`phase-badge ${isDebating ? 'active' : ''}`}>
              {PHASE_LABELS[phase]}
            </span>
          )}
          {phase !== 'idle' && (
            <button className="new-debate-btn" onClick={reset}>
              New debate
            </button>
          )}
        </div>
      </header>

      {/* Error */}
      {error && <div className="error-bar">{error}</div>}

      {/* Input — only visible before debate starts */}
      {phase === 'idle' && (
        <InputPanel
          value={inputText}
          onChange={setInputText}
          imageFilename={imageFilename}
          onImageChange={(b64, name) => {
            setInputImage(b64)
            setImageFilename(name)
          }}
          onImageClear={() => {
            setInputImage(null)
            setImageFilename(null)
          }}
          onSubmit={startDebate}
          disabled={isDebating}
        />
      )}

      {/* Debate area */}
      {showDebateArea && (
        <div className="debate-area">
          {/* Topic recap */}
          <div style={{
            padding: '10px 24px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', flexShrink: 0, paddingTop: 2 }}>
              Topic
            </span>
            <span style={{ fontSize: 13, color: 'var(--sub)', lineHeight: 1.5 }}>
              {inputText}
              {inputImage && (
                <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--dim)' }}>+ image</span>
              )}
            </span>
          </div>

          {/* Agent panels */}
          <div className="debate-grid">
            {AGENT_META.map((agent) => (
              <AgentPanel
                key={agent.index}
                agent={agent}
                round1Text={round1Texts[agent.index]}
                round2Text={round2Texts[agent.index]}
                isStreamingRound1={streamingR1[agent.index]}
                isStreamingRound2={streamingR2[agent.index]}
                hasRound2={hasRound2}
              />
            ))}
          </div>

          {/* Injection bar */}
          {showInjection && (
            <InjectionBar
              injection={injection}
              onInjectionChange={setInjection}
              injectionType={injectionType}
              onTypeChange={setInjectionType}
              targetAgent={targetAgent}
              onTargetAgentChange={setTargetAgent}
              suggestions={suggestions}
              onSubmit={submitInjection}
              disabled={isDebating}
            />
          )}

          {/* Synthesis */}
          {showSynthesis && (
            <SynthesisPanel
              text={synthesis}
              isStreaming={phase === 'synthesizing'}
            />
          )}
        </div>
      )}
    </div>
  )
}
