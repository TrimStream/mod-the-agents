import React from 'react'
import { AgentMeta } from '../types'

// Parse inline markdown: **bold** and *italic*
function parseInline(text: string): React.ReactNode[] {
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

// Convert full markdown text to React elements
function renderMarkdown(text: string): React.ReactNode {
    const lines = text.split('\n')
    const elements: React.ReactNode[] = []
    let i = 0
    let key = 0

    while (i < lines.length) {
        const line = lines[i]

        // Numbered list — collect consecutive numbered lines
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

        // Bullet list — collect consecutive bullet lines
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

        // Empty line — skip
        if (line.trim() === '') {
            i++
            continue
        }

        // Paragraph — collect until empty line or list
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
    const isStreaming = isStreamingRound1 || isStreamingRound2

    return (
        <div
            className="agent-panel"
            style={{
                '--agent-color': agent.color,
                '--agent-bg': agent.bgColor,
            } as React.CSSProperties}
        >
            <div className="agent-panel-header">
                <span className="agent-name">{agent.label}</span>
                <span className={`agent-status ${isStreaming ? 'streaming' : ''}`} />
            </div>

            <div className="agent-content">
                {round1Text ? (
                    isStreamingRound1 ? (
                        <p className="agent-text streaming">{round1Text}</p>
                    ) : (
                        <div className="agent-markdown">{renderMarkdown(round1Text)}</div>
                    )
                ) : (
                    <p className="agent-empty">Waiting…</p>
                )}

                {hasRound2 && (
                    <div className="agent-round2">
                        <p className="round2-label">Round 2</p>
                        {round2Text ? (
                            isStreamingRound2 ? (
                                <p className="agent-text streaming">{round2Text}</p>
                            ) : (
                                <div className="agent-markdown">{renderMarkdown(round2Text)}</div>
                            )
                        ) : (
                            <p className="agent-empty">Waiting…</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}