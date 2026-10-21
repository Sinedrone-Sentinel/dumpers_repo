import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { readShopCart, subscribeShopCart } from '../../lib/shopCart'

export default function CartHeaderButton({ className = '' }: { className?: string }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const sync = () => setCount(readShopCart().length)
    sync()
    return subscribeShopCart(sync)
  }, [])

  return (
    <Link
      to="/shop-cart"
      className={`site-chrome-control relative w-9 h-9 ${className}`.trim()}
      aria-label={count > 0 ? `Shopping cart, ${count} items` : 'Shopping cart'}
      title="Shopping cart"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="9" cy="20" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="18" cy="20" r="1.5" fill="currentColor" stroke="none" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h2l2.2 11h11.3l2-7H7" />
      </svg>
      {count > 0 ? (
        <span className="absolute -top-1 -right-1 min-w-4 rounded-full bg-amber-400 px-1 text-center text-[10px] font-bold leading-4 text-slate-950">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  )
}
