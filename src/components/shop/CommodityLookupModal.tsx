import React from 'react'
import { useNavigate } from '@tanstack/react-router'
import AppModal from '../layout/AppModal'
import CommodityTradePanels, { ShopSystemFilter } from './CommodityTradePanels'
import {
  SHOP_INDEX_META,
  findCommodityByName,
  getCommodityTradeInfo,
} from '../../lib/shopLookup'

interface CommodityLookupModalProps {
  /** In-app name (ore/resource/commodity); resolved fuzzily against UEX names. */
  commodityName: string
  /** Which side to lead with. Mining/inventory context -> 'sell'. */
  emphasis?: 'sell' | 'buy'
  onClose: () => void
}

export default function CommodityLookupModal({
  commodityName,
  emphasis = 'sell',
  onClose,
}: CommodityLookupModalProps) {
  const navigate = useNavigate()
  const [systemFilter, setSystemFilter] = React.useState<string | null>(null)

  const result = React.useMemo(() => {
    const commodity = findCommodityByName(commodityName)
    return commodity ? getCommodityTradeInfo(commodity.id) : null
  }, [commodityName])

  React.useEffect(() => {
    setSystemFilter(null)
  }, [commodityName])

  const openFullPage = React.useCallback(() => {
    onClose()
    void navigate({
      to: '/commodity-lookup',
      search: result ? { commodity: result.commodity.name } : {},
    })
  }, [navigate, onClose, result])

  return (
    <AppModal
      title={result ? result.commodity.name : commodityName}
      subtitle="Where to buy & sell — per-SCU prices Powered by UEX"
      onClose={onClose}
      size="xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <a
            href={SHOP_INDEX_META.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-sky-400 hover:text-sky-300"
          >
            Powered by UEX · updated {SHOP_INDEX_META.generatedAt}
          </a>
          <button
            type="button"
            onClick={openFullPage}
            className="site-btn-accent px-3 py-1.5 rounded-md text-sm font-medium site-btn-shimmer"
          >
            Open full lookup →
          </button>
        </div>
      }
    >
      {result ? (
        <>
          <ShopSystemFilter result={result} value={systemFilter} onChange={setSystemFilter} />
          <CommodityTradePanels result={result} emphasis={emphasis} systemFilter={systemFilter} />
        </>
      ) : (
        <div className="text-center py-10">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-slate-300 font-medium">No UEX commodity match</p>
          <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">
            "{commodityName}" isn&apos;t tracked as a tradable commodity in the UEX index (it may be
            a component, gadget, or unreleased item).
          </p>
        </div>
      )}
    </AppModal>
  )
}
