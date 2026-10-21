/** Browser shopping cart for UEX Lookup. Separate from Fuzy's Ship Shop builds. */

const KEY = 'shop-cart'
const EVENT = 'shop-cart-changed'

export interface ShopCartLine {
  id: string
  name: string
  qty: number
  unit: 'scu' | 'each'
  price: number | null
  shop: string | null
  system: string | null
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function lineKey(line: Pick<ShopCartLine, 'id' | 'shop'>): string {
  return `${line.id}|${line.shop || ''}`
}

export function readShopCart(): ShopCartLine[] {
  const raw = storage()?.getItem(KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as ShopCartLine[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((line) => line && typeof line.id === 'string' && typeof line.name === 'string' && line.qty > 0)
  } catch {
    return []
  }
}

function writeShopCart(lines: ShopCartLine[]) {
  storage()?.setItem(KEY, JSON.stringify(lines))
  globalThis.dispatchEvent(new Event(EVENT))
}

export function subscribeShopCart(onChange: () => void): () => void {
  const handler = () => onChange()
  globalThis.addEventListener(EVENT, handler)
  globalThis.addEventListener('storage', handler)
  return () => {
    globalThis.removeEventListener(EVENT, handler)
    globalThis.removeEventListener('storage', handler)
  }
}

export function addShopCartLine(incoming: ShopCartLine) {
  const qty = Math.max(1, Math.round(incoming.qty))
  const lines = readShopCart()
  const key = lineKey(incoming)
  const found = lines.find((line) => lineKey(line) === key)
  if (found) found.qty += qty
  else lines.push({ ...incoming, qty })
  writeShopCart(lines)
}

export function setShopCartQty(id: string, shop: string | null, qty: number) {
  const lines = readShopCart()
    .map((line) => (line.id === id && line.shop === shop ? { ...line, qty: Math.round(qty) } : line))
    .filter((line) => line.qty > 0)
  writeShopCart(lines)
}

export function removeShopCartLine(id: string, shop: string | null) {
  writeShopCart(readShopCart().filter((line) => !(line.id === id && line.shop === shop)))
}

export function shopCartTotal(lines: ShopCartLine[]): number {
  return lines.reduce((sum, line) => sum + (line.price && line.price > 0 ? line.price * line.qty : 0), 0)
}
