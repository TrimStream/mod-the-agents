import React from 'react'
import { AgentMeta, PositionShift } from '../types'
import { renderMarkdown } from '../utils/markdown'

interface AgentPanelProps {
    agent: AgentMeta
    text: string
    isStreaming: boolean
    positionShift?: PositionShift
}

export function AgentPanel({ agent, text, isStreaming, positionShift }: AgentPanelProps) {
    return (
        <div
            className="agent-panel"
            style={{ '--agent-color': agent.color, '--agent-bg': agent.bgColor } as React.CSSProperties}
        >
            <div className="agent-panel-header">
                <div className="agent-header-text">
                    <span className="agent-name">{agent.label}</span>
                    {agent.description && (
                        <span className="agent-description">{agent.description}</span>
                    )}
                </div>
                <div className="agent-header-right">
                    {positionShift && (
                        <span
                            className={`position-badge ${positionShift.shifted ? 'shifted' : 'holding'}`}
                            title={positionShift.summary}
                        >
              {positionShift.shifted ? 'Shifted' : 'Holding'}
            </span>
                    )}
                    <span className={`agent-status ${isStreaming ? 'streaming' : ''}`} />
                </div>
            </div>

            <div className="agent-content">
                {text ? (
                    isStreaming ? (
                        <p className="agent-text streaming">{text}</p>
                    ) : (
                        <div className="agent-markdown">{renderMarkdown(text)}</div>
                    )
                ) : (
                    <p className="agent-empty">Waiting…</p>
                )}
            </div>
        </div>
    )
}