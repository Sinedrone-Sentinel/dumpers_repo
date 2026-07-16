import { resourceLabelClassName, resourceQuantityUnitLabel } from '../config/resourceTypes'
import { inventoryLineKey } from '../lib/inventoryStock'
import { formatInventoryQualityLabel } from '../lib/qualityBands'
import { formatQuantityForResource } from '../lib/resourceQuantity'

export type ResourceStockListRow = {
  resource_key: string
  label: string
  quality: number
  quantity: number
  note: string | null
  is_active: boolean
}

interface ResourceStockListViewProps {
  cards: ResourceStockListRow[]
  isPersonalTab: boolean
}

export default function ResourceStockListView({
  cards,
  isPersonalTab,
}: ResourceStockListViewProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-900/40">
      <table className="w-full min-w-[32rem] text-sm">
        <thead>
          <tr className="border-b border-slate-700 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3 font-medium">Material</th>
            <th className="px-4 py-3 font-medium w-36">Quality</th>
            <th className="px-4 py-3 font-medium w-32 text-right">Quantity</th>
            {isPersonalTab && (
              <th className="px-4 py-3 font-medium">Note</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/80">
          {cards.map((card) => {
            const qtyUnit = resourceQuantityUnitLabel(card.resource_key)
            const qualityLabel = formatInventoryQualityLabel(card.resource_key, card.quality)

            return (
              <tr
                key={inventoryLineKey(card.resource_key, card.quality, card.note)}
                className={card.is_active ? 'text-slate-200' : 'text-slate-500 opacity-70'}
              >
                <td className="px-4 py-2.5">
                  <span className={`font-medium ${resourceLabelClassName(card.resource_key)}`}>
                    {card.label}
                  </span>
                  {!card.is_active && (
                    <span className="ml-2 text-[10px] uppercase text-slate-600">Retired</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-amber-200/90">{qualityLabel}</td>
                <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                  <span className="font-semibold text-white">
                    {formatQuantityForResource(card.resource_key, card.quantity)}
                  </span>
                  <span className="text-slate-500 ml-1 text-xs">{qtyUnit}</span>
                </td>
                {isPersonalTab && (
                  <td className="px-4 py-2.5 text-slate-400 text-xs max-w-[14rem] truncate" title={card.note ?? undefined}>
                    {card.note ? `"${card.note}"` : '—'}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
