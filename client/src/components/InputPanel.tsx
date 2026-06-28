import { useRef } from 'react'

interface InputPanelProps {
  value: string
  onChange: (v: string) => void
  imageFilename: string | null
  onImageChange: (base64: string, filename: string) => void
  onImageClear: () => void
  onSubmit: () => void
  disabled: boolean
}

export function InputPanel({
  value,
  onChange,
  imageFilename,
  onImageChange,
  onImageClear,
  onSubmit,
  disabled,
}: InputPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      onImageChange(base64, file.name)
    }
    reader.readAsDataURL(file)
    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (!disabled && value.trim()) onSubmit()
    }
  }

  return (
    <section className="input-section">
      <p className="input-label">Topic, claim, or scenario</p>
      <textarea
        className="input-textarea"
        placeholder="Enter any text, question, or scenario. Four agents will debate it simultaneously."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        disabled={disabled}
        rows={4}
      />
      <div className="input-row">
        <div className="image-upload-row">
          <label className="image-upload-label">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="1" y="3" width="14" height="10" rx="1.5" />
              <circle cx="5.5" cy="7" r="1" />
              <path d="M1 11l4-3 3 2.5 2.5-3 4.5 4" />
            </svg>
            Add image
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleFile}
              disabled={disabled}
            />
          </label>
          {imageFilename && (
            <>
              <span className="image-filename" title={imageFilename}>
                {imageFilename}
              </span>
              <button className="image-clear" onClick={onImageClear} type="button">
                ×
              </button>
            </>
          )}
        </div>
        <button
          className="debate-btn"
          onClick={onSubmit}
          disabled={disabled || !value.trim()}
        >
          Start debate
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 8h10M9 4l4 4-4 4" />
          </svg>
        </button>
      </div>
    </section>
  )
}
