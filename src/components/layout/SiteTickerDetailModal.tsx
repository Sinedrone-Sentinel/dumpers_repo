import AppModal from './AppModal'
import type { SiteTickerWhatsNew } from '../../lib/whatsNew'

type Props = {
  item: SiteTickerWhatsNew
  onClose: () => void
}

export default function SiteTickerDetailModal({ item, onClose }: Props) {
  const { entry } = item
  const subtitle = [
    entry.category,
    entry.action,
    entry.version,
    entry.items.length ? `${entry.items.length} item${entry.items.length === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <AppModal title={entry.headline} subtitle={subtitle} onClose={onClose} size="lg" zIndex={80}>
      {entry.items.length === 0 ? (
        <p className="text-sm text-slate-400">No detail items for this update.</p>
      ) : (
        <ul className="space-y-2">
          {entry.items.map((row) => (
            <li
              key={row.key}
              className="rounded-lg border border-slate-700/80 bg-slate-950/50 px-3 py-2"
            >
              <p className="text-sm text-slate-100 font-medium">{row.label}</p>
              {row.summary ? (
                <p className="text-xs text-slate-500 mt-1 font-mono break-words">{row.summary}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </AppModal>
  )
}
