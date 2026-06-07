import React from 'react'

interface FeaturePageLayoutProps {
  title: string
  subtitle?: string
  badge?: string
  actions?: React.ReactNode
  children: React.ReactNode
}

export default function FeaturePageLayout({
  title,
  subtitle,
  badge,
  actions,
  children,
}: FeaturePageLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-slate-900/80 border-b border-slate-700 shadow-lg">
        <div className="max-w-screen-xl mx-auto px-4 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1
                  className="text-2xl sm:text-3xl font-bold text-transparent bg-clip-text"
                  style={{
                    fontFamily: 'Orbitron, sans-serif',
                    backgroundImage: 'linear-gradient(to right, #f87171, #c084fc)',
                    WebkitBackgroundClip: 'text',
                  }}
                >
                  {title}
                </h1>
                {badge && (
                  <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded bg-purple-900/50 text-purple-300 border border-purple-500/30">
                    {badge}
                  </span>
                )}
              </div>
              {subtitle && <p className="text-slate-400 text-sm mt-1">{subtitle}</p>}
            </div>
            {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
