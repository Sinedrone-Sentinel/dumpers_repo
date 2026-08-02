import React from 'react'

interface SettingsSectionProps {
  title: string
  description?: string
  children: React.ReactNode
  variant?: 'default' | 'danger'
}

export default function SettingsSection({
  title,
  description,
  children,
  variant = 'default',
}: SettingsSectionProps) {
  return (
    <section className="site-section">
      <div className={`site-section-header ${variant === 'danger' ? 'from-red-950/40' : ''}`}>
        <h3 className={`text-sm font-semibold ${
          variant === 'danger' ? 'text-red-400' : 'text-slate-200'
        }`}>
          {title}
        </h3>
        {description && (
          <p className="site-hint mt-0.5">{description}</p>
        )}
      </div>
      <div className="site-section-body">{children}</div>
    </section>
  )
}
