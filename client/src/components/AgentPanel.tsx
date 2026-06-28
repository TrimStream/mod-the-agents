import { AgentMeta } from '../types'

interface AgentPanelProps {
  agent: AgentMeta
  round1Text: string
  round2Text: string
  isStreamingRound1: boolean
  isStreamingRound2: boolean
  hasRound2: boolean
}

export function AgentPanel({
  agent,
  round1Text,
  round2Text,
  isStreamingRound1,
  isStreamingRound2,
  hasRound2,
}: AgentPanelProps) {
  return (
    <div
      className="agent-panel"
      style={{ '--agent-color': agent.color } as React.CSSProperties}
    >
      <div className="agent-header">
        <span className="agent-name">{agent.label}</span>
        <span
          className={`agent-status ${
            isStreamingRound1 || isStreamingRound2 ? 'streaming' : ''
          }`}
        />
      </div>

      {round1Text ? (
        <p className={`agent-text ${isStreamingRound1 ? 'streaming' : ''}`}>
          {round1Text}
        </p>
      ) : (
        <p className="agent-empty">Waiting…</p>
      )}

      {hasRound2 && (
        <div className="agent-round2">
          <p className="round-label">Round 2</p>
          {round2Text ? (
            <p className={`agent-text ${isStreamingRound2 ? 'streaming' : ''}`}>
              {round2Text}
            </p>
          ) : (
            <p className="agent-empty">Waiting…</p>
          )}
        </div>
      )}
    </div>
  )
}
