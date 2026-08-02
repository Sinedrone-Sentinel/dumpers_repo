import React, { useState } from 'react'
import AppModal from '../components/layout/AppModal'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import SiteTooltip from '../components/SiteTooltip'

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="site-section">
      <div className="site-section-header">
        <h2 className="text-sm font-semibold text-amber-100/90 uppercase tracking-wider">{title}</h2>
      </div>
      <div className="site-section-body">{children}</div>
    </section>
  )
}

export default function ThemePreviewRoute() {
  const [modalOpen, setModalOpen] = useState(false)
  const [tab, setTab] = useState<'a' | 'b' | 'c'>('a')
  const [chip, setChip] = useState<string | null>('arc')
  const [toggleOn, setToggleOn] = useState(true)
  const [check, setCheck] = useState(true)
  const [range, setRange] = useState(420)
  const [text, setText] = useState('')
  const [select, setSelect] = useState('aluminum')

  return (
    <FeaturePageLayout
      title="Theme Preview"
      subtitle="Temporary gallery — site-* control tokens"
      badge="Dev only"
      actions={
        <button
          type="button"
          className="site-btn-primary site-btn-shimmer"
          onClick={() => setModalOpen(true)}
        >
          Open sample modal
        </button>
      }
    >
      <p className="site-banner-warn mb-6">
        Local preview only — remove <code className="text-amber-200">/theme-preview</code> before
        shipping if you do not want it on production. Visual source of truth:{' '}
        <code className="text-amber-200">src/index.css</code>.
      </p>

      <div className="space-y-6 pb-16">
        <Section title="Buttons">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="site-btn-primary site-btn-shimmer">
              Primary
            </button>
            <button type="button" className="site-btn-secondary">
              Secondary
            </button>
            <button type="button" className="site-btn-accent site-btn-shimmer">
              Accent
            </button>
            <button type="button" className="site-btn-success">
              Success
            </button>
            <button type="button" className="site-btn-danger">
              Danger
            </button>
            <button type="button" className="site-btn-ghost">
              Ghost
            </button>
            <button type="button" className="site-btn-icon" aria-label="Icon button">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button type="button" className="site-chrome-control px-3 py-1.5 text-xs">
              Chrome control
            </button>
            <button type="button" className="site-btn-primary" disabled>
              Disabled primary
            </button>
          </div>
        </Section>

        <Section title="Form controls">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="site-label" htmlFor="tp-text">
                Text input
              </label>
              <input
                id="tp-text"
                className="site-input w-full px-3 py-2 text-sm"
                placeholder="Search stock or locations…"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <p className="site-hint">Hint text under the field</p>
            </div>
            <div>
              <label className="site-label" htmlFor="tp-select">
                Select
              </label>
              <select
                id="tp-select"
                className="site-input w-full px-3 py-2 text-sm"
                value={select}
                onChange={(e) => setSelect(e.target.value)}
              >
                <option value="aluminum">Aluminum</option>
                <option value="titanium">Titanium</option>
                <option value="diamond">Diamond</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="site-label" htmlFor="tp-area">
                Textarea
              </label>
              <textarea
                id="tp-area"
                className="site-textarea w-full px-3 py-2 text-sm"
                placeholder="Optional note…"
                defaultValue=""
              />
              <p className="site-error-text">Example error text</p>
            </div>
            <div className="flex flex-wrap items-center gap-6">
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  className="site-checkbox"
                  checked={check}
                  onChange={(e) => setCheck(e.target.checked)}
                />
                Checkbox
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input type="radio" name="tp-radio" className="site-radio" defaultChecked />
                Radio A
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input type="radio" name="tp-radio" className="site-radio" />
                Radio B
              </label>
              <button
                type="button"
                className="flex items-center gap-2 text-sm text-slate-300"
                onClick={() => setToggleOn((v) => !v)}
              >
                <span className="site-toggle" data-on={toggleOn ? 'true' : 'false'} />
                Toggle {toggleOn ? 'on' : 'off'}
              </button>
            </div>
            <div>
              <label className="site-label" htmlFor="tp-range">
                Range — Q{range}
              </label>
              <input
                id="tp-range"
                type="range"
                min={1}
                max={1000}
                value={range}
                onChange={(e) => setRange(Number(e.target.value))}
                className="site-range"
              />
            </div>
          </div>
        </Section>

        <Section title="Filters / tabs / chips">
          <div className="site-chip-strip w-fit mb-3">
            {([
              ['a', 'My Resources'],
              ['b', 'Site Total'],
              ['c', 'Can Craft'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`px-4 py-2 text-sm font-medium rounded-lg site-btn-shimmer ${
                  tab === id ? 'site-filter-selected-orange' : 'site-filter-idle'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="site-chip-strip">
            {(
              [
                ['arc', 'ARC-L1', 'site-filter-selected-cyan'],
                ['orison', 'Orison', 'site-filter-selected-amber'],
                ['area18', 'Area18', 'site-filter-selected-green'],
                ['grim', 'Grim HEX', 'site-filter-selected-purple'],
              ] as const
            ).map(([id, label, selectedClass]) => (
              <button
                key={id}
                type="button"
                onClick={() => setChip(chip === id ? null : id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                  chip === id ? selectedClass : 'site-filter-idle'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Surfaces / cards">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="site-surface p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">site-surface</p>
              <p className="text-2xl font-bold text-orange-300 mt-1">11.118 SCU</p>
            </div>
            <div className="site-card p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">site-card</p>
              <p className="font-medium text-white mt-1">Aluminum</p>
              <span className="site-badge-amber mt-2 inline-flex">Q511</span>
            </div>
            <div className="site-card site-card-acquired p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">site-card-acquired</p>
              <p className="font-medium text-white mt-1">Acquired BP</p>
              <span className="site-badge-green mt-2 inline-flex">Owned</span>
            </div>
          </div>
          <div className="site-panel mt-3 pl-5">
            <p className="text-white font-medium">site-panel</p>
            <p className="site-hint">Left ember rail panel used for larger content blocks.</p>
          </div>
        </Section>

        <Section title="Banners / badges / empty / progress">
          <div className="space-y-2">
            <div className="site-banner-info">Info banner — read-only rollup note</div>
            <div className="site-banner-warn">Warning banner — offline mode</div>
            <div className="site-banner-error">Error banner — something failed</div>
            <div className="site-banner-success">Success banner — saved</div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="site-badge-orange">Orange</span>
            <span className="site-badge-amber">Amber</span>
            <span className="site-badge-green">Green</span>
            <span className="site-badge-red">Red</span>
            <span className="site-badge-slate">Slate</span>
          </div>
          <div className="mt-4">
            <div className="site-progress">
              <div className="site-progress-bar" style={{ width: '62%' }} />
            </div>
          </div>
          <div className="site-empty mt-4 py-10">
            Empty state — no stock cards yet
          </div>
        </Section>

        <Section title="Table / dropdown / tooltip / menu">
          <div className="site-table-wrap mb-4">
            <table className="site-table">
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Quality</th>
                  <th className="text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Aluminum</td>
                  <td className="text-amber-200/90">Q511</td>
                  <td className="text-right tabular-nums">2.500 SCU</td>
                </tr>
                <tr>
                  <td>Titanium</td>
                  <td className="text-amber-200/90">Q783</td>
                  <td className="text-right tabular-nums">0.125 SCU</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-start gap-4">
            <div className="site-menu-panel w-56">
              <div className="site-menu-section">
                <p className="text-sm text-white font-medium">site-menu-panel</p>
                <p className="text-xs text-amber-200/45">Avatar / nav dropdown</p>
              </div>
              <button type="button" className="site-menu-item rounded-none">
                Settings
              </button>
              <button type="button" className="site-menu-item site-menu-item-active rounded-none">
                Active item
              </button>
              <button type="button" className="site-menu-item site-menu-item-locked rounded-none">
                Locked item
              </button>
            </div>

            <div className="w-64">
              <p className="site-label">Dropdown list (static)</p>
              <div className="site-menu-panel max-h-40 overflow-y-auto">
                <button type="button" className="site-dropdown-item site-dropdown-item-active">
                  Aluminum
                </button>
                <button type="button" className="site-dropdown-item">
                  Titanium
                </button>
                <button type="button" className="site-dropdown-item">
                  Diamond
                </button>
              </div>
            </div>

            <div>
              <p className="site-label">Tooltip</p>
              <SiteTooltip content="site-tooltip-panel — frosted tip with ember edge. Hover this label.">
                <span className="text-sm text-orange-300 underline decoration-dotted cursor-help">
                  Hover me
                </span>
              </SiteTooltip>
            </div>
          </div>
        </Section>

        <Section title="Ticker chrome (static samples)">
          <div className="site-ticker-bar rounded-lg px-4 py-2.5 flex items-center gap-2">
            <span className="site-badge-orange">SITE UPDATE</span>
            <span className="text-sm text-slate-200">Collapsed ticker bar — more opaque / golden</span>
          </div>
          <div className="site-glass-ticker rounded-xl mt-2 overflow-hidden">
            <div className="site-ticker-bar px-4 py-2 border-b border-amber-500/25 flex justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200/90">
                Updates
              </p>
              <p className="text-[10px] text-amber-200/50">3 active</p>
            </div>
            <button type="button" className="site-list-row w-full text-left px-4 py-2.5 text-sm text-slate-200">
              Fresh site theme rolled out
            </button>
            <button type="button" className="site-list-row w-full text-left px-4 py-2.5 text-sm text-slate-200">
              Mining tracker polish
            </button>
          </div>
        </Section>
      </div>

      {modalOpen && (
        <AppModal
          title="Sample modal"
          subtitle="site-modal-shell + site-modal-backdrop"
          onClose={() => setModalOpen(false)}
          size="md"
          footer={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="site-btn-ghost"
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="site-btn-primary site-btn-shimmer"
                onClick={() => setModalOpen(false)}
              >
                Confirm
              </button>
            </div>
          }
        >
          <p className="text-sm text-slate-300 mb-4">
            Modals use the 3D ember shell. Form controls inside inherit the same tokens.
          </p>
          <label className="site-label" htmlFor="tp-modal-input">
            Modal field
          </label>
          <input
            id="tp-modal-input"
            className="site-input w-full px-3 py-2 text-sm mb-3"
            placeholder="Type something…"
          />
          <textarea
            className="site-textarea w-full px-3 py-2 text-sm"
            placeholder="Notes…"
            rows={3}
          />
          <div className="site-banner-info mt-3">Banner inside a modal body</div>
        </AppModal>
      )}
    </FeaturePageLayout>
  )
}
