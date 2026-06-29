interface Section {
  title: string
  body: string
}

const SECTION_HEADERS = ['CONSENSUS', 'UNRESOLVED', 'INJECTION IMPACT', 'VERDICT']

function parseSections(text: string): Section[] | null {
  const sections: Section[] = []

  for (let i = 0; i < SECTION_HEADERS.length; i++) {
    const header = SECTION_HEADERS[i]
    const nextHeader = SECTION_HEADERS[i + 1]
    const start = text.indexOf(header)
    if (start === -1) continue
    const bodyStart = start + header.length
    const end = nextHeader ? text.indexOf(nextHeader, bodyStart) : text.length
    const body = text.slice(bodyStart, end === -1 ? text.length : end).trim()
    if (body) sections.push({ title: header, body })
  }

  return sections.length >= 2 ? sections : null
}

interface SynthesisPanelProps {
  text: string
  isStreaming: boolean
}

export function SynthesisPanel({ text, isStreaming }: SynthesisPanelProps) {
  const sections = !isStreaming ? parseSections(text) : null

  return (
      <div className="synthesis-panel">
        <p className="synthesis-header">Synthesis</p>
        {!text ? (
            <p className="synthesis-empty">Synthesizing…</p>
        ) : sections ? (
            <div className="synthesis-body">
              {sections.map((section) => (
                  <div key={section.title} className="synthesis-section">
                    <p className="synthesis-section-title">{section.title}</p>
                    <p className="synthesis-section-text">{section.body}</p>
                  </div>
              ))}
            </div>
        ) : (
            <p className={`synthesis-raw ${isStreaming ? 'streaming' : ''}`}>{text}</p>
        )}
      </div>
  )
}