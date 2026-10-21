import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import ShopCartPlanner from '../components/shop/ShopCartPlanner'
import {
  readShopCart,
  removeShopCartLine,
  setShopCartQty,
  shopCartTotal,
  subscribeShopCart,
  type ShopCartLine,
} from '../lib/shopCart'

function useCartLines(): ShopCartLine[] {
  const [lines, setLines] = useState<ShopCartLine[]>(() => readShopCart())
  useEffect(() => subscribeShopCart(() => setLines(readShopCart())), [])
  return lines
}

export default function ShopCartRoute() {
  const lines = useCartLines()
  const total = useMemo(() => shopCartTotal(lines), [lines])
  const unpriced = lines.some((line) => !(line.price && line.price > 0))

  return (
    <FeaturePageLayout
      title="Shopping Cart"
      subtitle="Items you chose from UEX Lookup. This cart is separate from Fuzy's Ship Shop."
      seoIntro="A browser shopping cart for Star Citizen shop goods from UEX Lookup — guns, ammo, armor, ships, commodities, food, and drinks."
      badge="UEX"
    >
      {lines.length === 0 ? (
        <div className="site-empty px-6 py-16 text-center">
          <p className="text-slate-200">The cart is empty.</p>
          <Link to="/commodity-lookup" className="site-btn-primary mt-4 inline-flex px-3 py-1.5 text-sm">Open UEX Lookup</Link>
        </div>
      ) : (
        <div className="space-y-4">
        <ShopCartPlanner lines={lines} />
        <div className="site-card p-3">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white">Items</h2>
            {total > 0 && <p className="text-sm font-semibold text-white">{total.toLocaleString()} aUEC</p>}
          </div>
          <ul className="space-y-2">
            {lines.map((line) => (
              <li key={`${line.id}:${line.shop || ''}`} className="flex flex-wrap items-center gap-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-white">{line.name}</p>
                  <p className="text-xs text-slate-400">
                    {line.shop ? `${line.shop}${line.system ? ` · ${line.system}` : ''}` : 'No shop chosen'}
                    {line.price && line.price > 0 ? ` · ${Math.round(line.price).toLocaleString()} aUEC${line.unit === 'scu' ? '/SCU' : ''}` : ''}
                  </p>
                </div>
                <button type="button" className="site-btn-ghost px-2 py-0.5" aria-label={`Decrease ${line.name}`} onClick={() => setShopCartQty(line.id, line.shop, line.qty - 1)}>−</button>
                <span className="w-10 text-center text-slate-100">{line.qty}{line.unit === 'scu' ? ' SCU' : ''}</span>
                <button type="button" className="site-btn-ghost px-2 py-0.5" aria-label={`Increase ${line.name}`} onClick={() => setShopCartQty(line.id, line.shop, line.qty + 1)}>+</button>
                <button type="button" className="site-btn-ghost px-2 py-0.5" onClick={() => removeShopCartLine(line.id, line.shop)}>Remove</button>
              </li>
            ))}
          </ul>
          {unpriced && (
            <p className="site-hint mt-3 text-xs">Lines without a shop are not included in the total. Add the item from a Buy row to lock that shop and its price.</p>
          )}
        </div>
        </div>
      )}
    </FeaturePageLayout>
  )
}
