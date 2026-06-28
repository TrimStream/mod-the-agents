interface SynthesisPanelProps {
  text: string
  isStreaming: boolean
}

export function SynthesisPanel({ text, isStreaming }: SynthesisPanelProps) {
  return (
    <div className="synthesis-panel">
      <p className="synthesis-header">Synthesis</p>
      {text ? (
        <p className={`synthesis-text ${isStreaming ? 'streaming' : ''}`}>{text}</p>
      ) : (
        <p className="synthesis-empty">Synthesizing debate…</p>
      )}
    </div>
  )
}
