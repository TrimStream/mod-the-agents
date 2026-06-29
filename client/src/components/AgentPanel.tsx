import React from 'react'
import { AgentMeta, RoundData } from '../types'
import { renderMarkdown } from '../utils/markdown'

interface AgentPanelProps {
    agent: AgentMeta
    rounds: RoundData[]
}

const INJECTION_TYPE_LABELS: Record<string, string> = {
    constraint: 'Constraint',
    evidence: 'Evidence',
    flip: 'Flip',
}

export function AgentPanel({ agent, rounds }: AgentPanelProps) {
    const isStreaming = rounds.some((r) => r.isStreaming)

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
                <span className={`agent-status ${isStreaming ? 'streaming' : ''}`} />
            </div>

            <div className="agent-content">
                {rounds.length === 0 ? (
                    <p className="agent-empty">Waiting…</p>
                ) : (
                    rounds.map((round, i) => (
                        <div key={round.roundNumber}>
                            {/* Injection banner between rounds */}
                            {round.injection && (
                                <div className="injection-banner">
                  <span className="injection-banner-label">
                    {INJECTION_TYPE_LABELS[round.injection.type] ?? 'Injection'}
                  </span>
                                    <span className="injection-banner-text">{round.injection.text}</span>
                                </div>
                            )}

                            {/* Round header (only for round 2+) */}
                            {round.roundNumber > 1 && (
                                <div className="round-header">
                                    <span className="round2-label">Round {round.roundNumber}</span>
                                    {round.positionShift && (
                                        <span className={`position-badge ${round.positionShift.shifted ? 'shifted' : 'holding'}`}
                                              title={round.positionShift.summary}>
                      {round.positionShift.shifted ? 'Position shifted' : 'Holding position'}
                    </span>
                                    )}
                                </div>
                            )}

                            {/* Round content */}
                            {round.text ? (
                                round.isStreaming ? (
                                    <p className="agent-text streaming">{round.text}</p>
                                ) : (
                                    <div className="agent-markdown">{renderMarkdown(round.text)}</div>
                                )
                            ) : (
                                <p className="agent-empty">Waiting…</p>
                            )}

                            {/* Divider between rounds (not after last) */}
                            {i < rounds.length - 1 && <div className="round-divider" />}
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
