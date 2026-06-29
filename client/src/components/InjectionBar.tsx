import { InjectionType, AgentMeta } from '../types'

interface InjectionBarProps {
  injection: string
  onInjectionChange: (v: string) => void
  injectionType: InjectionType
  onTypeChange: (t: InjectionType) => void
  targetAgent: number | null
  onTargetAgentChange: (i: number | null) => void
  suggestions: string[]
  onSubmit: () => void
  onSynthesize: () => void
  disabled: boolean
  agentMeta: AgentMeta[]
  roundNumber: number
}

const TYPE_OPTIONS: { value: InjectionType; label: string; placeholder: string }[] = [
  { value: 'constraint', label: 'Constraint', placeholder: 'Add a constraint that changes the rules of the debate…' },
  { value: 'evidence',   label: 'Evidence',   placeholder: 'Introduce new evidence or information all agents must account for…' },
  { value: 'flip',       label: 'Flip Agent', placeholder: 'Instruction for the selected agent to argue the opposite position…' },
]

export function InjectionBar({
                               injection, onInjectionChange,
                               injectionType, onTypeChange,
                               targetAgent, onTargetAgentChange,
                               suggestions, onSubmit, onSynthesize,
                               disabled, agentMeta, roundNumber,
                             }: InjectionBarProps) {
  const currentType = TYPE_OPTIONS.find((t) => t.value === injectionType)!
  const canInject = !disabled && injection.trim() && (injectionType !== 'flip' || targetAgent !== null)

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (canInject) onSubmit()
    }
  }

  return (
      <div className="injection-bar">
        <div className="injection-top">
          <span className="injection-title">Inject into debate</span>
          <span className="injection-round-count">After Round {roundNumber}</span>
        </div>

        <div className="injection-type-row">
          {TYPE_OPTIONS.map((opt) => (
              <button
                  key={opt.value}
                  className={`type-pill ${injectionType === opt.value ? 'active' : ''}`}
                  onClick={() => { onTypeChange(opt.value); if (opt.value !== 'flip') onTargetAgentChange(null) }}
                  disabled={disabled}
              >
                {opt.label}
              </button>
          ))}
        </div>

        {injectionType === 'flip' && (
            <div className="flip-agent-row">
              {agentMeta.map((agent) => (
                  <button
                      key={agent.index}
                      className={`flip-agent-btn ${targetAgent === agent.index ? 'selected' : ''}`}
                      style={{ '--agent-color': agent.color } as React.CSSProperties}
                      onClick={() => onTargetAgentChange(targetAgent === agent.index ? null : agent.index)}
                      disabled={disabled}
                  >
                    {agent.label}
                  </button>
              ))}
            </div>
        )}

        <textarea
            className="injection-textarea"
            placeholder={currentType.placeholder}
            value={injection}
            onChange={(e) => onInjectionChange(e.target.value)}
            onKeyDown={handleKey}
            disabled={disabled}
            rows={3}
        />

        {suggestions.length > 0 && (
            <div className="suggestions-row">
              <span className="suggestions-label">Suggested:</span>
              {suggestions.map((s, i) => (
                  <button key={i} className="suggestion-chip" onClick={() => onInjectionChange(s)} disabled={disabled}>
                    {s}
                  </button>
              ))}
            </div>
        )}

        {injectionType === 'flip' && targetAgent === null && (
            <p className="flip-hint">Select an agent to flip above</p>
        )}

        <div className="injection-actions">
          <button className="synthesize-btn" onClick={onSynthesize} disabled={disabled}>
            Synthesize now
          </button>
          <button className="inject-btn" onClick={onSubmit} disabled={!canInject}>
            Continue debate
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          </button>
        </div>
      </div>
  )
}
