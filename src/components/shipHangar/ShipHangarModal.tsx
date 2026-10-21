import { useEffect, useMemo, useState } from 'react'
import AppModal from '../layout/AppModal'
import { SHIPS, getShip } from '../../lib/shipShopData'
import {
  fetchShipHangar,
  hangarCap,
  nextHangarLabel,
  saveShipHangar,
  stockHangarBuild,
  type HangarShip,
} from '../../lib/shipHangar'

export default function ShipHangarModal({
  mode,
  cargoOnly = false,
  rsiVerified,
  onClose,
  onSelect,
}: {
  mode: 'manage' | 'select'
  cargoOnly?: boolean
  rsiVerified: boolean
  onClose: () => void
  onSelect?: (ship: HangarShip) => void
}) {
  const [ships, setShips] = useState<HangarShip[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const cap = hangarCap(rsiVerified)

  useEffect(() => {
    let cancelled = false
    fetchShipHangar()
      .then((rows) => {
        if (!cancelled) setShips(rows)
      })
      .catch(() => {
        if (!cancelled) setError('The hangar did not load.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const listed = useMemo(
    () => ships.filter((ship) => !cargoOnly || (getShip(ship.shipId)?.cargoScu || 0) > 0),
    [ships, cargoOnly],
  )
  const choices = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return []
    return SHIPS.filter((ship) => {
      if (cargoOnly && (ship.cargoScu || 0) <= 0) return false
      return `${ship.displayName} ${ship.manufacturer} ${ship.role}`.toLowerCase().includes(needle)
    }).slice(0, 40)
  }, [query, cargoOnly])

  async function persist(next: HangarShip[]) {
    setBusy(true)
    setError(null)
    try {
      await saveShipHangar(next)
      setShips(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The hangar did not save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppModal
      title={mode === 'select' ? 'My Hangar' : 'Ship Hangar'}
      subtitle={`${ships.length} of ${cap}`}
      onClose={onClose}
      size="lg"
      zIndex={80}
    >
      <div className="space-y-4">
        {error && <p className="site-error-text text-sm">{error}</p>}
        {mode === 'manage' && (
          <div className="relative">
            <label className="block">
              <span className="site-label">Add a ship</span>
              <input
                className="site-input mt-1 w-full px-3 py-2"
                value={query}
                placeholder="Search ships"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            {query.trim() && (
              <div className="site-dropdown-list max-h-60 overflow-y-auto">
                {choices.length === 0 ? (
                  <p className="site-hint px-3 py-2">No matching ship.</p>
                ) : choices.map((ship) => (
                  <button
                    key={ship.id}
                    type="button"
                    className="site-dropdown-item w-full text-left"
                    disabled={busy || ships.length >= cap}
                    onClick={() => {
                      const next = [
                        ...ships,
                        {
                          id: crypto.randomUUID(),
                          shipId: ship.id,
                          label: nextHangarLabel(ships, ship.id, ship.displayName),
                          build: stockHangarBuild(ship),
                        },
                      ]
                      setQuery('')
                      void persist(next)
                    }}
                  >
                    {ship.displayName}
                  </button>
                ))}
              </div>
            )}
            {ships.length >= cap && <p className="site-hint mt-2">The hangar is full.</p>}
          </div>
        )}
        <ul className="max-h-80 space-y-2 overflow-y-auto">
          {listed.length === 0 ? (
            <li className="site-empty py-8">No ships in the hangar.</li>
          ) : listed.map((ship) => {
            const name = getShip(ship.shipId)?.displayName || ship.label
            return (
              <li key={ship.id} className="site-card flex items-center justify-between gap-3 px-3 py-2">
                {mode === 'select' ? (
                  <button
                    type="button"
                    className="min-w-0 text-left"
                    onClick={() => {
                      if (!onSelect) return
                      onSelect(ship)
                      onClose()
                    }}
                  >
                    <span className="block text-sm text-white">{ship.label}</span>
                    {ship.label !== name && <span className="block text-xs text-slate-400">{name}</span>}
                  </button>
                ) : (
                  <div className="min-w-0 text-left">
                    <span className="block text-sm text-white">{ship.label}</span>
                    {ship.label !== name && <span className="block text-xs text-slate-400">{name}</span>}
                  </div>
                )}
                {mode === 'manage' && (
                  <button
                    type="button"
                    className="site-btn-danger px-2 py-1 text-xs"
                    disabled={busy}
                    onClick={() => void persist(ships.filter((row) => row.id !== ship.id))}
                  >
                    Remove
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </AppModal>
  )
}
