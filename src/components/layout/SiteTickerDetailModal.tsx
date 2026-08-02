import AppModal from './AppModal'
import type { SiteTickerWhatsNew } from '../../lib/whatsNew'
import {
  cleanTickerHeadline,
  formatTickerMetaChips,
  resolveTickerLayoutFromEntry,
  TICKER_LAYOUTS,
} from '../../lib/tickerLayout'

type Props = {
  item: SiteTickerWhatsNew
  onClose: () => void
}

export default function SiteTickerDetailModal({ item, onClose }: Props) {
  const { entry } = item
  const layout = TICKER_LAYOUTS[resolveTickerLayoutFromEntry(entry)]
  const title = cleanTickerHeadline(entry.headline)
  const chips = formatTickerMetaChips(entry)

  return (
    <AppModal title={title} onClose={onClose} size="lg" zIndex={80}>
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${layout.badgeClass}`}
        >
          {layout.label}
        </span>
        {chips.map((chip) => (
          <span
            key={chip}
            className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-semibold tracking-wide ${layout.badgeClass}`}
          >
            {chip}
          </span>
        ))}
      </div>

      {entry.items.length === 0 ? (
        <p className="text-sm text-slate-400">No extra detail for this update.</p>
      ) : (
        <ul className="space-y-2">
          {entry.items.map((row) => (
            <li
              key={row.key}
              className={`rounded-lg border border-slate-700/80 bg-slate-950/50 px-3 py-2 ${layout.rowClass}`}
            >
              <p className="text-sm text-slate-100 font-medium">{row.label}</p>
              {row.summary ? (
                <p className="text-xs text-slate-400 mt-1 break-words">{row.summary}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </AppModal>
  )
}
