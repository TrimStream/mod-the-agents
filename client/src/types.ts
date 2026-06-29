export type Phase =
    | 'idle'
    | 'debating'
    | 'awaiting_injection'
    | 'synthesizing'
    | 'complete'

export type InjectionType = 'constraint' | 'evidence' | 'flip'

export interface AgentMeta {
  index: number
  name: string
  label: string
  color: string
  bgColor: string
  description: string
}

export const DEFAULT_AGENT_META: AgentMeta[] = [
  { index: 0, name: 'Pragmatist',       label: 'PRAGMATIST',       color: '#1C4A9F', bgColor: '#E8EEF9', description: 'What actually works in practice' },
  { index: 1, name: 'Skeptic',          label: 'SKEPTIC',          color: '#9F1C1C', bgColor: '#F9E8E8', description: "What's being ignored or assumed" },
  { index: 2, name: 'Optimist',         label: 'OPTIMIST',         color: '#1C6B38', bgColor: '#E8F4ED', description: 'What opportunity is being missed' },
  { index: 3, name: "Devil's Advocate", label: "DEVIL'S ADVOCATE",  color: '#7A5000', bgColor: '#F4EEE0', description: 'Attacks the dominant position' },
]

// Colors and backgrounds stay constant even for custom agents
export const AGENT_COLORS = DEFAULT_AGENT_META.map(a => ({ color: a.color, bgColor: a.bgColor }))

export interface PositionShift {
  shifted: boolean
  summary: string
}

export interface RoundData {
  roundNumber: number
  text: string
  isStreaming: boolean
  injection?: { text: string; type: string; targetAgent?: number }
  positionShift?: PositionShift
}
