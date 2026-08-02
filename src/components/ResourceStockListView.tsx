import { resourceLabelClassName, resourceQuantityUnitLabel } from '../config/resourceTypes'
import UexLookupButton from './shop/UexLookupButton'
import { inventoryLineKey } from '../lib/inventoryStock'
import { formatInventoryQualityLabel } from '../lib/qualityBands'
import { formatQuantityForResource } from '../lib/resourceQuantity'

export type ResourceStockListRow = {
  resource_key: string
  label: string
  quality: number
  quantity: number
  note: string | null
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
    <div className="site-table-wrap">
      <table className="site-table min-w-[32rem]">
        <thead>
          <tr>
            <th>Material</th>
            <th className="w-36">Quality</th>
            <th className="w-32 text-right">Quantity</th>
            {isPersonalTab && <th>Note</th>}
          </tr>
        </thead>
        <tbody>
          {cards.map((card) => {
            const qtyUnit = resourceQuantityUnitLabel(card.resource_key)
            const qualityLabel = formatInventoryQualityLabel(card.resource_key, card.quality)

            return (
              <tr key={inventoryLineKey(card.resource_key, card.quality, card.note)}>
                <td>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-medium ${resourceLabelClassName(card.resource_key)}`}>
                      {card.label}
                    </span>
                    <UexLookupButton commodityName={card.label} emphasis="sell" />
                  </div>
                </td>
                <td className="text-amber-200/90">{qualityLabel}</td>
                <td className="text-right tabular-nums whitespace-nowrap">
                  <span className="font-semibold text-white">
                    {formatQuantityForResource(card.resource_key, card.quantity)}
                  </span>
                  <span className="text-slate-500 ml-1 text-xs">{qtyUnit}</span>
                </td>
                {isPersonalTab && (
                  <td className="text-slate-400 text-xs max-w-[14rem] truncate" title={card.note ?? undefined}>
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
