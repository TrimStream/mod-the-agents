import React from 'react'
import { AgentMeta } from '../types'
import { renderMarkdown } from '../utils/markdown'

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