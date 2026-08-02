import { useCallback, useEffect, useState } from 'react'
import AppModal from './AppModal'
import {
  adminDeleteTickerCategory,
  adminDeleteWhatsNewEntry,
  adminListTickerCategories,
  adminListWhatsNewEntries,
  adminUpsertTickerCategory,
  adminUpsertWhatsNewEntry,
  type WhatsNewEntry,
  type WhatsNewItem,
  type WhatsNewKind,
} from '../../lib/whatsNew'
import {
  fetchTickerCategories,
  normalizeTickerCategoryRow,
  notifyWhatsNewChanged,
  type TickerCategory,
} from '../../lib/tickerLayout'
import { normalizeAccentHex, stylesFromAccentHex } from '../../lib/tickerColors'

type Tab = 'messages' | 'categories'
type MessageView = 'list' | 'edit'
type CategoryView = 'list' | 'edit'

type MessageEditor = {
  id: string | null
  headline: string
  tickerCategoryId: string
  topic: string
  detailLabel: string
  detailSummary: string
  detectedAt: string
  issueKey: string
  version: string
}

type CategoryEditor = {
  id: string | null
  slug: string
  label: string
  accentHex: string
  entryKind: WhatsNewKind
  ttlDays: number
  sortOrder: number
}

function emptyMessage(defaultCategoryId: string): MessageEditor {
  return {
    id: null,
    headline: '',
    tickerCategoryId: defaultCategoryId,
    topic: '',
    detailLabel: '',
    detailSummary: '',
    detectedAt: new Date().toISOString().slice(0, 16),
    issueKey: '',
    version: '',
  }
}

function emptyCategory(): CategoryEditor {
  return {
    id: null,
    slug: '',
    label: '',
    accentHex: '#0EA5E9',
    entryKind: 'site',
    ttlDays: 3,
    sortOrder: 100,
  }
}

function formatTtlDays(days: number | undefined): string {
  const n = Math.floor(Number(days))
  if (!Number.isFinite(n) || n < 1) return '? days'
  return n === 1 ? '1 day' : `${n} days`
}

/** e.g. "Site Update · 3 days" */
function formatCategoryOption(label: string, days: number | undefined): string {
  return `${label} · ${formatTtlDays(days)}`
}

function toLocalInput(iso: string | undefined): string {
  if (!iso) return new Date().toISOString().slice(0, 16)
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 16)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function slugifyLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 63)
}

type Props = {
  onClose: () => void
}

export default function TickerAdminModal({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('messages')
  const [messageView, setMessageView] = useState<MessageView>('list')
  const [categoryView, setCategoryView] = useState<CategoryView>('list')
  const [entries, setEntries] = useState<WhatsNewEntry[]>([])
  const [categories, setCategories] = useState<TickerCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [messageEditor, setMessageEditor] = useState<MessageEditor>(() => emptyMessage(''))
  const [categoryEditor, setCategoryEditor] = useState<CategoryEditor>(emptyCategory)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [entryRows, catRows] = await Promise.all([
        adminListWhatsNewEntries(),
        adminListTickerCategories() as Promise<Partial<TickerCategory>[]>,
      ])
      setEntries(entryRows)
      setCategories(
        (catRows ?? []).map((r) =>
          normalizeTickerCategoryRow(r as Partial<TickerCategory> & { id: string; slug: string })
        )
      )
      await fetchTickerCategories()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load ticker admin data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const defaultCategoryId =
    categories.find((c) => c.slug === 'site')?.id ?? categories[0]?.id ?? ''

  const openNewMessage = () => {
    setMessageEditor(emptyMessage(defaultCategoryId))
    setMessageView('edit')
    setError(null)
  }

  const openEditMessage = (entry: WhatsNewEntry) => {
    const first = entry.items?.[0]
    setMessageEditor({
      id: entry.id,
      headline: entry.headline,
      tickerCategoryId: entry.tickerCategoryId || defaultCategoryId,
      topic: entry.category || '',
      detailLabel: first?.label || '',
      detailSummary: first?.summary || '',
      detectedAt: toLocalInput(entry.detectedAt),
      issueKey: entry.issueKey || '',
      version: entry.version || '',
    })
    setMessageView('edit')
    setError(null)
  }

  const saveMessage = async () => {
    if (!messageEditor.headline.trim()) {
      setError('Headline is required (short title for the bar).')
      return
    }
    if (!messageEditor.tickerCategoryId) {
      setError('Pick a layout category.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const items: WhatsNewItem[] = []
      if (messageEditor.detailLabel.trim()) {
        items.push({
          key: 'detail',
          label: messageEditor.detailLabel.trim(),
          summary: messageEditor.detailSummary.trim() || null,
        })
      }
      const detectedIso = messageEditor.detectedAt
        ? new Date(messageEditor.detectedAt).toISOString()
        : new Date().toISOString()
      const result = await adminUpsertWhatsNewEntry({
        id: messageEditor.id,
        headline: messageEditor.headline.trim(),
        tickerCategoryId: messageEditor.tickerCategoryId,
        category: messageEditor.topic.trim() || null,
        items,
        detectedAt: detectedIso,
        issueKey: messageEditor.issueKey.trim() || null,
        version: messageEditor.version.trim() || null,
      })
      if (!result.success) {
        setError(result.error || 'Save failed')
        return
      }
      setMessageView('list')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const deleteMessage = async (entry: WhatsNewEntry) => {
    if (!window.confirm(`Delete ticker message “${entry.headline}”?`)) return
    setSaving(true)
    setError(null)
    try {
      const result = await adminDeleteWhatsNewEntry(entry.id)
      if (!result.success) {
        setError(result.error || 'Delete failed')
        return
      }
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setSaving(false)
    }
  }

  const openNewCategory = () => {
    setCategoryEditor(emptyCategory())
    setCategoryView('edit')
    setError(null)
  }

  const openEditCategory = (cat: TickerCategory) => {
    setCategoryEditor({
      id: cat.id,
      slug: cat.slug,
      label: cat.label,
      accentHex: cat.accentHex,
      entryKind: cat.entryKind,
      ttlDays: cat.ttlDays ?? 3,
      sortOrder: cat.sortOrder,
    })
    setCategoryView('edit')
    setError(null)
  }

  const saveCategory = async () => {
    const hex = normalizeAccentHex(categoryEditor.accentHex)
    if (!hex) {
      setError('Accent color must be a hex like #0EA5E9')
      return
    }
    let slug = categoryEditor.slug.trim().toLowerCase()
    if (!slug) slug = slugifyLabel(categoryEditor.label)
    if (!categoryEditor.label.trim()) {
      setError('Label is required')
      return
    }
    const ttlDays = Math.floor(Number(categoryEditor.ttlDays))
    if (!Number.isFinite(ttlDays) || ttlDays < 1 || ttlDays > 90) {
      setError('TTL must be between 1 and 90 days')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await adminUpsertTickerCategory({
        id: categoryEditor.id,
        slug,
        label: categoryEditor.label.trim(),
        accentHex: hex,
        entryKind: categoryEditor.entryKind,
        ttlDays,
        sortOrder: categoryEditor.sortOrder,
      })
      if (!result.success) {
        setError(result.error || 'Save failed')
        return
      }
      setCategoryView('list')
      await refresh()
      notifyWhatsNewChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const deleteCategory = async (cat: TickerCategory) => {
    if (cat.isSystem) {
      setError(
        `Cannot remove “${cat.label}”: built-in categories are required by the ticker. You can still edit label, color, and TTL.`
      )
      return
    }
    const active = cat.activeCount ?? 0
    if (active > 0) {
      setError(
        `Cannot remove “${cat.label}”: ${active} active ticker item${active === 1 ? '' : 's'} currently use this category. Wait for them to expire/close, or edit those messages to a different category first.`
      )
      return
    }
    if (!window.confirm(`Remove category “${cat.label}”? Expired messages will lose this layout tag.`)) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await adminDeleteTickerCategory(cat.id)
      if (!result.success) {
        setError(result.error || 'Delete failed')
        return
      }
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setSaving(false)
    }
  }

  const previewStyles = stylesFromAccentHex(categoryEditor.accentHex)
  const selectedCat = categories.find((c) => c.id === messageEditor.tickerCategoryId)

  return (
    <AppModal
      title="Updates ticker"
      subtitle="Super-admin — messages and layout categories"
      onClose={onClose}
      size="xl"
      zIndex={70}
    >
      <div className="site-chip-strip mb-4 w-full">
        <button
          type="button"
          className={`px-3 py-1.5 text-sm rounded-lg ${
            tab === 'messages'
              ? 'site-filter-selected-blue'
              : 'site-filter-idle'
          }`}
          onClick={() => {
            setTab('messages')
            setMessageView('list')
            setError(null)
          }}
        >
          Messages
        </button>
        <button
          type="button"
          className={`px-3 py-1.5 text-sm rounded-lg ${
            tab === 'categories'
              ? 'site-filter-selected-blue'
              : 'site-filter-idle'
          }`}
          onClick={() => {
            setTab('categories')
            setCategoryView('list')
            setError(null)
          }}
        >
          Categories
        </button>
        <button
          type="button"
          className="site-btn-secondary !px-3 !py-1.5 text-sm ml-auto"
          onClick={() => void refresh()}
          disabled={loading || saving}
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="site-banner-warn mb-3">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : tab === 'messages' ? (
        messageView === 'list' ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="site-btn-primary !rounded-lg !px-3 !py-1.5 text-sm"
                onClick={openNewMessage}
                disabled={!defaultCategoryId}
              >
                New message
              </button>
            </div>
            {entries.length === 0 ? (
              <p className="text-sm text-slate-400">No ticker messages yet.</p>
            ) : (
              <ul className="site-table-wrap divide-y divide-slate-800">
                {entries.map((entry) => {
                  const accent = stylesFromAccentHex(entry.accentHex)
                  return (
                    <li key={entry.id} className="px-3 py-2.5 site-list-row flex gap-3 items-start border-b-0">
                      <span
                        className="mt-0.5 shrink-0 inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider"
                        style={accent.badgeStyle}
                      >
                        {entry.tickerCategoryLabel || entry.tickerCategorySlug || '—'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-100 font-medium truncate">{entry.headline}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Expires{' '}
                          {entry.expiresAt ? new Date(entry.expiresAt).toLocaleString() : '—'}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          className="text-xs text-sky-300 hover:text-sky-200"
                          onClick={() => openEditMessage(entry)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-xs text-red-400 hover:text-red-300"
                          onClick={() => void deleteMessage(entry)}
                          disabled={saving}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Short title for the bar. Longer explanation goes in detail fields (modal only). Public
              copy only — no ops/security jargon.
            </p>
            <label className="block space-y-1">
              <span className="site-label !mb-0">Headline</span>
              <input
                className="site-input w-full px-3 py-2 text-sm"
                value={messageEditor.headline}
                maxLength={160}
                onChange={(e) => setMessageEditor((s) => ({ ...s, headline: e.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="site-label !mb-0">Layout category</span>
              <select
                className="site-input w-full px-3 py-2 text-sm"
                value={messageEditor.tickerCategoryId}
                onChange={(e) =>
                  setMessageEditor((s) => ({ ...s, tickerCategoryId: e.target.value }))
                }
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {formatCategoryOption(c.label, c.ttlDays)}
                  </option>
                ))}
              </select>
              {selectedCat ? (
                <span
                  className="inline-flex mt-1 items-center px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider"
                  style={stylesFromAccentHex(selectedCat.accentHex).badgeStyle}
                >
                  {formatCategoryOption(selectedCat.label, selectedCat.ttlDays)}
                </span>
              ) : null}
            </label>
            <label className="block space-y-1">
              <span className="site-label !mb-0">Topic tag (optional, game digests)</span>
              <input
                className="site-input w-full px-3 py-2 text-sm"
                value={messageEditor.topic}
                placeholder="e.g. Blueprints"
                onChange={(e) => setMessageEditor((s) => ({ ...s, topic: e.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="site-label !mb-0">Detail label (modal)</span>
              <input
                className="site-input w-full px-3 py-2 text-sm"
                value={messageEditor.detailLabel}
                onChange={(e) => setMessageEditor((s) => ({ ...s, detailLabel: e.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="site-label !mb-0">Detail summary (modal)</span>
              <textarea
                className="site-textarea w-full px-3 py-2 text-sm"
                value={messageEditor.detailSummary}
                onChange={(e) =>
                  setMessageEditor((s) => ({ ...s, detailSummary: e.target.value }))
                }
              />
            </label>
            <label className="block space-y-1">
              <span className="site-label !mb-0">Detected at (starts TTL clock)</span>
              <input
                type="datetime-local"
                className="site-input w-full px-3 py-2 text-sm"
                value={messageEditor.detectedAt}
                onChange={(e) => setMessageEditor((s) => ({ ...s, detectedAt: e.target.value }))}
              />
            </label>
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer text-slate-400">Advanced keys</summary>
              <div className="mt-2 space-y-2">
                <input
                  className="site-input w-full px-3 py-2 text-sm"
                  placeholder="issue key (auto if empty)"
                  value={messageEditor.issueKey}
                  onChange={(e) => setMessageEditor((s) => ({ ...s, issueKey: e.target.value }))}
                />
                <input
                  className="site-input w-full px-3 py-2 text-sm"
                  placeholder="version (auto if empty)"
                  value={messageEditor.version}
                  onChange={(e) => setMessageEditor((s) => ({ ...s, version: e.target.value }))}
                />
              </div>
            </details>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                className="site-btn-primary !rounded-lg !px-3 !py-1.5 text-sm"
                onClick={() => void saveMessage()}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                className="site-btn-secondary !px-3 !py-1.5 text-sm"
                onClick={() => {
                  setMessageView('list')
                  setError(null)
                }}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </div>
        )
      ) : categoryView === 'list' ? (
        <div className="space-y-3">
          <button
            type="button"
            className="site-btn-primary !rounded-lg !px-3 !py-1.5 text-sm"
            onClick={openNewCategory}
          >
            New category
          </button>
          <p className="text-xs text-slate-500">
            Categories define badge label, accent color, and TTL days (1–90). Built-in categories
            cannot be removed. Questionnaire active count includes open forms on the ticker (not
            only poll-result messages).
          </p>
          <ul className="site-table-wrap divide-y divide-slate-800">
            {categories.map((cat) => {
              const accent = stylesFromAccentHex(cat.accentHex)
              const active = cat.activeCount ?? 0
              const openQ = cat.openQuestionnaireCount ?? 0
              const removeBlocked = Boolean(cat.isSystem) || active > 0
              return (
                <li key={cat.id} className="px-3 py-2.5 site-list-row flex gap-3 items-center border-b-0">
                  <span
                    className="w-4 h-4 rounded-sm border border-white/20 shrink-0"
                    style={accent.swatchStyle}
                    title={cat.accentHex}
                  />
                  <span
                    className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider"
                    style={accent.badgeStyle}
                  >
                    {cat.label}
                  </span>
                  <div className="min-w-0 flex-1 text-[11px] text-slate-500">
                    <span className="font-mono text-slate-400">{cat.slug}</span>
                    {' · '}
                    {formatTtlDays(cat.ttlDays)}
                    {' · '}
                    {active > 0 ? (
                      <span className="text-amber-300">{active} active</span>
                    ) : (
                      <span>0 active</span>
                    )}
                    {openQ > 0 ? (
                      <span className="text-violet-300">
                        {' '}
                        ({openQ} open form{openQ === 1 ? '' : 's'})
                      </span>
                    ) : null}
                    {cat.isSystem ? <span className="text-slate-600"> · built-in</span> : null}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      className="text-xs text-sky-300 hover:text-sky-200"
                      onClick={() => openEditCategory(cat)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={`text-xs ${
                        removeBlocked
                          ? 'text-slate-600 cursor-not-allowed'
                          : 'text-red-400 hover:text-red-300'
                      }`}
                      onClick={() => void deleteCategory(cat)}
                      disabled={saving || removeBlocked}
                      title={
                        cat.isSystem
                          ? 'Built-in category — cannot remove'
                          : active > 0
                            ? `Cannot remove: ${active} active item${active === 1 ? '' : 's'} use this category`
                            : 'Remove category'
                      }
                    >
                      Remove
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="site-label !mb-0">Label (badge text)</span>
            <input
              className="site-input w-full px-3 py-2 text-sm"
              value={categoryEditor.label}
              maxLength={64}
              onChange={(e) => {
                const label = e.target.value
                setCategoryEditor((s) => ({
                  ...s,
                  label,
                  slug: s.id ? s.slug : slugifyLabel(label) || s.slug,
                }))
              }}
            />
          </label>
          <label className="block space-y-1">
            <span className="site-label !mb-0">Slug (stable id)</span>
            <input
              className="site-input w-full px-3 py-2 text-sm font-mono"
              value={categoryEditor.slug}
              disabled={Boolean(
                categoryEditor.id &&
                  categories.find((c) => c.id === categoryEditor.id)?.isSystem
              )}
              onChange={(e) =>
                setCategoryEditor((s) => ({
                  ...s,
                  slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                }))
              }
            />
          </label>
          <div className="flex flex-wrap gap-4 items-end">
            <label className="block space-y-1">
              <span className="site-label !mb-0">Accent color</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  className="site-input h-9 w-12 cursor-pointer"
                  value={normalizeAccentHex(categoryEditor.accentHex) ?? '#0EA5E9'}
                  onChange={(e) =>
                    setCategoryEditor((s) => ({
                      ...s,
                      accentHex: e.target.value.toUpperCase(),
                    }))
                  }
                />
                <input
                  className="site-input w-28 px-2 py-2 text-sm font-mono"
                  value={categoryEditor.accentHex}
                  onChange={(e) =>
                    setCategoryEditor((s) => ({ ...s, accentHex: e.target.value.toUpperCase() }))
                  }
                />
              </div>
            </label>
            <label className="block space-y-1">
              <span className="site-label !mb-0">TTL (whole days, 1–90)</span>
              <input
                type="number"
                min={1}
                max={90}
                step={1}
                inputMode="numeric"
                className="site-input w-28 px-3 py-2 text-sm"
                value={categoryEditor.ttlDays}
                onChange={(e) => {
                  const raw = e.target.value
                  if (raw === '') {
                    setCategoryEditor((s) => ({ ...s, ttlDays: 1 }))
                    return
                  }
                  const n = Math.floor(Number(raw))
                  setCategoryEditor((s) => ({
                    ...s,
                    ttlDays: Number.isFinite(n) ? Math.min(90, Math.max(1, n)) : 1,
                  }))
                }}
              />
            </label>
            <label className="block space-y-1">
              <span className="site-label !mb-0">Sort order</span>
              <input
                type="number"
                className="site-input w-24 px-3 py-2 text-sm"
                value={categoryEditor.sortOrder}
                onChange={(e) =>
                  setCategoryEditor((s) => ({
                    ...s,
                    sortOrder: Number(e.target.value) || 0,
                  }))
                }
              />
            </label>
          </div>
          <p className="text-[11px] text-slate-500">
            TTL applies to ticker messages assigned to this category (and poll results for
            Questionnaire). Open questionnaire prompts stay up until the form closes.
          </p>
          <div className="site-surface px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Preview</p>
            <span
              className="inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider"
              style={previewStyles.badgeStyle}
            >
              {categoryEditor.label.trim() || 'Category'}
            </span>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              className="site-btn-primary !rounded-lg !px-3 !py-1.5 text-sm"
              onClick={() => void saveCategory()}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="site-btn-secondary !px-3 !py-1.5 text-sm"
              onClick={() => {
                setCategoryView('list')
                setError(null)
              }}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </AppModal>
  )
}
