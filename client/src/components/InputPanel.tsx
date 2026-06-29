import { useRef, useState } from 'react'

const DEFAULT_AGENT_PLACEHOLDERS = [
    { label: 'Agent 1', placeholder: 'e.g. Skeptical VC' },
    { label: 'Agent 2', placeholder: 'e.g. First-time founder' },
    { label: 'Agent 3', placeholder: 'e.g. Enterprise customer' },
    { label: 'Agent 4', placeholder: 'e.g. Competitor PM' },
]

interface CustomAgent {
    name: string
    description: string
}

interface InputPanelProps {
    value: string
    onChange: (v: string) => void
    imageFilename: string | null
    onImageChange: (base64: string, filename: string) => void
    onImageClear: () => void
    onSubmit: (customAgents?: CustomAgent[]) => void
    disabled: boolean
}

export function InputPanel({
                               value, onChange, imageFilename, onImageChange, onImageClear, onSubmit, disabled,
                           }: InputPanelProps) {
    const fileRef = useRef<HTMLInputElement>(null)
    const [showCustom, setShowCustom] = useState(false)
    const [customAgents, setCustomAgents] = useState<CustomAgent[]>(
        DEFAULT_AGENT_PLACEHOLDERS.map(() => ({ name: '', description: '' }))
    )

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1]
            onImageChange(base64, file.name)
        }
        reader.readAsDataURL(file)
        e.target.value = ''
    }

    const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            if (!disabled && value.trim()) handleSubmit()
        }
    }

    const updateCustomAgent = (i: number, field: 'name' | 'description', val: string) => {
        setCustomAgents((prev) => prev.map((a, idx) => idx === i ? { ...a, [field]: val } : a))
    }

    const customAgentsValid = customAgents.every((a) => a.name.trim() && a.description.trim())

    const handleSubmit = () => {
        if (showCustom && customAgentsValid) {
            onSubmit(customAgents.map((a) => ({ name: a.name.trim(), description: a.description.trim() })))
        } else {
            onSubmit()
        }
    }

    const canSubmit = value.trim() && (!showCustom || customAgentsValid)

    return (
        <section className="input-section">
            <p className="input-eyebrow">Cerebras × Gemma 4</p>
            <h1 className="input-headline">Mod the Agents</h1>
            <p className="input-subline">
                Any claim or image is simultaneously contested by four agents with opposing epistemic
                identities. You intervene mid-debate. They adapt.
            </p>

            <textarea
                className="input-textarea"
                placeholder="Enter any text, question, or scenario. Attach an image for multimodal debate."
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKey}
                disabled={disabled}
                rows={4}
            />

            {/* Custom agents toggle */}
            <div className="custom-agents-toggle-row">
                <button
                    className="custom-agents-toggle"
                    onClick={() => setShowCustom((s) => !s)}
                    type="button"
                >
                    <svg
                        width="12" height="12" viewBox="0 0 12 12" fill="none"
                        style={{ transform: showCustom ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
                    >
                        <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {showCustom ? 'Use default agents' : 'Customize agents'}
                </button>
            </div>

            {showCustom && (
                <div className="custom-agents-grid">
                    {DEFAULT_AGENT_PLACEHOLDERS.map((ph, i) => (
                        <div key={i} className="custom-agent-row">
                            <input
                                className="custom-agent-name"
                                placeholder={ph.placeholder}
                                value={customAgents[i].name}
                                onChange={(e) => updateCustomAgent(i, 'name', e.target.value)}
                                disabled={disabled}
                            />
                            <input
                                className="custom-agent-desc"
                                placeholder="Their perspective or role in this debate…"
                                value={customAgents[i].description}
                                onChange={(e) => updateCustomAgent(i, 'description', e.target.value)}
                                disabled={disabled}
                            />
                        </div>
                    ))}
                </div>
            )}

            <div className="input-row">
                <div className="image-upload-row">
                    <label className="image-upload-label">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="1" y="3" width="14" height="10" rx="1.5" />
                            <circle cx="5.5" cy="7" r="1" />
                            <path d="M1 11l4-3 3 2.5 2.5-3 4.5 4" />
                        </svg>
                        Add image
                        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} disabled={disabled} />
                    </label>
                    {imageFilename && (
                        <>
                            <span className="image-filename" title={imageFilename}>{imageFilename}</span>
                            <button className="image-clear" onClick={onImageClear} type="button">×</button>
                        </>
                    )}
                </div>
                <button className="debate-btn" onClick={handleSubmit} disabled={disabled || !canSubmit}>
                    Start debate
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M3 8h10M9 4l4 4-4 4" />
                    </svg>
                </button>
            </div>
        </section>
    )
}
