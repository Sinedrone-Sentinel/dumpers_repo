import React from 'react'

interface SettingsToggleProps {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  saving?: boolean
}

export default function SettingsToggle({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  saving = false,
}: SettingsToggleProps) {
  const handleClick = () => {
    if (!disabled && !saving) {
      onChange(!checked)
    }
  }

  return (
    <div
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled || saving}
      tabIndex={disabled || saving ? -1 : 0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
      className={`flex items-start gap-3 select-none ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      <div
        className="site-toggle mt-0.5"
        data-on={checked ? 'true' : 'false'}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white">{label}</span>
          {saving && <span className="text-xs text-slate-500">Saving...</span>}
        </div>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</p>
      </div>
    </div>
  )
}
