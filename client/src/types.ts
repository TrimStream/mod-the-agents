export type Phase =
  | 'idle'
  | 'round1'
  | 'awaiting_injection'
  | 'round2'
  | 'synthesizing'
  | 'complete'

export type InjectionType = 'constraint' | 'evidence' | 'flip'

export interface AgentMeta {
  index: number
  name: string
  label: string
  color: string
  bgColor: string
}

export const AGENT_META: AgentMeta[] = [
  { index: 0, name: 'Pragmatist',       label: 'PRAGMATIST',      color: '#1C4A9F', bgColor: '#EEF2FA' },
  { index: 1, name: 'Skeptic',          label: 'SKEPTIC',         color: '#9F1C1C', bgColor: '#FAEEEE' },
  { index: 2, name: 'Optimist',         label: 'OPTIMIST',        color: '#1C6B38', bgColor: '#EEF5F1' },
  { index: 3, name: "Devil's Advocate", label: "DEVIL'S ADVOCATE", color: '#7A5000', bgColor: '#F5F0E8' },
]
