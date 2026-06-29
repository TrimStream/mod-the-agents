import React from 'react'

export function parseInline(text: string): React.ReactNode[] {
    const parts: React.ReactNode[] = []
    const regex = /\*\*(.+?)\*\*|\*(.+?)\*/g
    let lastIndex = 0
    let match

    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index))
        }
        if (match[1] !== undefined) {
            parts.push(<strong key={match.index}>{match[1]}</strong>)
        } else {
            parts.push(<em key={match.index}>{match[2]}</em>)
        }
        lastIndex = regex.lastIndex
    }

    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex))
    }

    return parts
}

export function renderMarkdown(text: string): React.ReactNode {
    const lines = text.split('\n')
    const elements: React.ReactNode[] = []
    let i = 0
    let key = 0

    while (i < lines.length) {
        const line = lines[i]

        if (/^\d+\.\s+/.test(line)) {
            const items: string[] = []
            while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
                items.push(lines[i].replace(/^\d+\.\s+/, ''))
                i++
            }
            elements.push(
                <ol key={key++} className="agent-md-list">
                    {items.map((item, j) => <li key={j}>{parseInline(item)}</li>)}
                </ol>
            )
            continue
        }

        if (/^[-*]\s+/.test(line)) {
            const items: string[] = []
            while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
                items.push(lines[i].replace(/^[-*]\s+/, ''))
                i++
            }
            elements.push(
                <ul key={key++} className="agent-md-list">
                    {items.map((item, j) => <li key={j}>{parseInline(item)}</li>)}
                </ul>
            )
            continue
        }

        if (line.trim() === '') {
            i++
            continue
        }

        const paraLines: string[] = []
        while (
            i < lines.length &&
            lines[i].trim() !== '' &&
            !/^\d+\.\s+/.test(lines[i]) &&
            !/^[-*]\s+/.test(lines[i])
            ) {
            paraLines.push(lines[i])
            i++
        }

        if (paraLines.length > 0) {
            elements.push(
                <p key={key++} className="agent-md-p">
                    {paraLines.map((pl, j) => (
                        <React.Fragment key={j}>
                            {parseInline(pl)}
                            {j < paraLines.length - 1 && <br />}
                        </React.Fragment>
                    ))}
                </p>
            )
        }
    }

    return <>{elements}</>
}