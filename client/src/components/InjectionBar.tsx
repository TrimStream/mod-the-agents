import { InjectionType, AGENT_META } from '../types'

interface InjectionBarProps {
  injection: string
  onInjectionChange: (v: string) => void
  injectionType: InjectionType
  onTypeChange: (t: InjectionType) => void
  targetAgent: number | null
  onTargetAgentChange: (i: number | null) => void
  suggestions: string[]
  onSubmit: () => void
  disabled: boolean
}

const TYPE_OPTIONS: { value: InjectionType; label: string; placeholder: string }[] = [
  {
    value: 'constraint',
    label: 'Constraint',
    placeholder: 'Add a constraint that changes the rules of the debate…',
  },
  {
    value: 'evidence',
    label: 'Evidence',
    placeholder: 'Introduce new evidence or information all agents must account for…',
  },
  {
    value: 'flip',
    label: 'Flip Agent',
    placeholder: 'Instruction for the selected agent to argue the opposite position…',
  },
]

export function InjectionBar({
  injection,
  onInjectionChange,
  injectionType,
  onTypeChange,
  targetAgent,
  onTargetAgentChange,
  suggestions,
  onSubmit,
  disabled,
}: InjectionBarProps) {
  const currentType = TYPE_OPTIONS.find((t) => t.value === injectionType)!

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (!disabled && injection.trim()) onSubmit()
    }
  }

  return (
    <div className="injection-bar">
      <div className="injection-header">
        <span className="injection-title">Inject into debate</span>
      </div>

      {/* Type selector */}
      <div className="injection-type-row">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={`type-pill ${injectionType === opt.value ? 'active' : ''}`}
            onClick={() => {
              onTypeChange(opt.value)
              if (opt.value !== 'flip') onTargetAgentChange(null)
            }}
            disabled={disabled}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Flip Agent: agent selector */}
      {injectionType === 'flip' && (
        <div className="flip-agent-row">
          {AGENT_META.map((agent) => (
            <button
              key={agent.index}
              className={`flip-agent-btn ${targetAgent === agent.index ? 'selected' : ''}`}
              style={{ '--agent-color': agent.color } as React.CSSProperties}
              onClick={() =>
                onTargetAgentChange(targetAgent === agent.index ? null : agent.index)
              }
              disabled={disabled}
            >
              {agent.label}
            </button>
          ))}
        </div>
      )}

      {/* Injection textarea */}
      <textarea
        className="injection-textarea"
        placeholder={currentType.placeholder}
        value={injection}
        onChange={(e) => onInjectionChange(e.target.value)}
        onKeyDown={handleKey}
        disabled={disabled}
        rows={3}
      />

      {/* Cerebras-generated suggestions */}
      {suggestions.length > 0 && (
        <div className="suggestions-row">
          <span className="suggestions-label">Suggested:</span>
          {suggestions.map((s, i) => (
            <button
              key={i}
              className="suggestion-chip"
              onClick={() => onInjectionChange(s)}
              disabled={disabled}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="injection-actions">
        <button
          className="inject-btn"
          onClick={onSubmit}
          disabled={disabled || !injection.trim() || (injectionType === 'flip' && targetAgent === null)}
        >
          Continue debate
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 8h10M9 4l4 4-4 4" />
          </svg>
        </button>
      </div>

      {injectionType === 'flip' && targetAgent === null && (
        <p style={{ fontSize: 11, color: 'var(--dim)', marginTop: 6, textAlign: 'right' }}>
          Select an agent to flip above
        </p>
      )}
    </div>
  )
}
