import React from 'react'

interface FeaturePageLayoutProps {
  title: string
  subtitle?: string
  /** Crawlable intro under the header (search intent; keep short). */
  seoIntro?: string
  badge?: string
  meta?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}

export default function FeaturePageLayout({
  title,
  subtitle,
  seoIntro,
  badge,
  meta,
  actions,
  children,
}: FeaturePageLayoutProps) {
  return (
    <main className="site-shell py-6 min-w-0 w-full overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-4 pb-5 border-b border-slate-800/80">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="site-page-title">{title}</h1>
            {badge && (
              <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded bg-orange-950/50 text-orange-300 border border-orange-500/30">
                {badge}
              </span>
            )}
          </div>
          {subtitle && <p className="site-page-subtitle">{subtitle}</p>}
          {meta && <div className="text-slate-500 text-xs sm:text-sm mt-1">{meta}</div>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
      </div>
      {seoIntro ? (
        <p
          data-seo="tool-intro"
          className="mb-6 max-w-3xl text-sm leading-relaxed text-slate-400"
        >
          {seoIntro}
        </p>
      ) : null}
      {children}
    </main>
  )
}
