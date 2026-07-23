import React, { useEffect, useMemo, useState } from 'react'
import { DEFAULT_STOCK_QUALITY } from '../config/dfp'
import { resourceLabelClassName, resourceQuantityUnitLabel } from '../config/resourceTypes'
import { getResourceLabel } from '../lib/blueprintResources'
import { inventoryLineKey } from '../lib/inventoryStock'
import { addPersonalInventoryLine, type BlueprintResourceRow } from '../lib/operations'
import ResourceQuantityInput from './ResourceQuantityInput'
import ResourceQualitySelect, { getDefaultQualityForResource } from './ResourceQualitySelect'
import {
  formatQuantityForResource,
  parseQuantityForResource,
} from '../lib/resourceQuantity'
import { formatInventoryQualityLabel } from '../lib/qualityBands'

type PersonalStockAddPanelBaseProps = {
  catalog: BlueprintResourceRow[]
  labelMap: Record<string, string>
  existingKeys: Set<string>
  onError?: (message: string) => void
}

type PersonalStockAddPanelProps = PersonalStockAddPanelBaseProps &
  (
    | { userId: string; onAdded: () => void; onAdd?: never }
    | { onAdd: (resourceKey: string, quality: number, quantity: number, note?: string | null) => void; userId?: never; onAdded?: never }
  )

export default function PersonalStockAddPanel(props: PersonalStockAddPanelProps) {
  const { catalog, labelMap, existingKeys, onError } = props
  const isGuestMode = 'onAdd' in props && props.onAdd != null

  const [search, setSearch] = useState('')
  const [resourceKey, setResourceKey] = useState('')
  const [quality, setQuality] = useState(String(DEFAULT_STOCK_QUALITY))
  const [quantity, setQuantity] = useState('0')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const activeCatalog = useMemo(
    () => [...catalog].sort((a, b) => a.label.localeCompare(b.label)),
    [catalog]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return activeCatalog.slice(0, 60)
    return activeCatalog
      .filter(
        (r) =>
          r.label.toLowerCase().includes(q) ||
          r.resource_key.toLowerCase().includes(q)
      )
      .slice(0, 60)
  }, [activeCatalog, search])

  const selectedLabel = resourceKey ? getResourceLabel(resourceKey, labelMap) : ''
  const qtyUnit = resourceKey ? resourceQuantityUnitLabel(resourceKey) : 'SCU'

  useEffect(() => {
    if (!resourceKey) return
    setQuality(getDefaultQualityForResource(resourceKey, selectedLabel))
  }, [resourceKey, selectedLabel])

  const lineKey =
    resourceKey && quality ? inventoryLineKey(resourceKey, Number(quality), note) : ''
  const lineExists = lineKey ? existingKeys.has(lineKey) : false
  const qualityLabel =
    resourceKey && quality
      ? formatInventoryQualityLabel(resourceKey, Number(quality))
      : ''

  const handleAdd = async () => {
    const qty = parseQuantityForResource(resourceKey, quantity)
    if (!resourceKey || qty == null || qty <= 0) {
      onError?.('Pick a resource, quality tier, and quantity greater than 0')
      return
    }

    setSubmitting(true)
    onError?.('')

    if (isGuestMode) {
      props.onAdd(resourceKey, Number(quality), qty, note.trim() || null)
      setSubmitting(false)
      setQuantity('0')
      return
    }

    const result = await addPersonalInventoryLine({
      userId: props.userId,
      resourceKey,
      quality: Number(quality),
      quantityScu: qty,
      note: note.trim() || null,
    })

    setSubmitting(false)

    if (result.error) {
      onError?.(result.error)
      return
    }

    setQuantity('0')
    props.onAdded()
  }

  return (
    <div className="w-full min-w-0 bg-slate-900/60 border border-slate-700 rounded-xl p-4 space-y-3 overflow-hidden">
      <div>
        <h2 className="text-white font-medium text-sm">Add material stock</h2>
        <p className="text-slate-500 text-xs mt-1">
          Create a card per resource and quality tier — Purchased (Q0) for store-bought refined
          materials, Q0 for salvage (RMC, construction material), Q100–Q1000 for mined/refined ore.
          Use the buttons on each card to adjust in-game.{' '}
          <a
            href="/archive#dfp"
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-400/70 hover:text-orange-300 underline"
          >
            Learn about quality &amp; DFP
          </a>
        </p>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search catalog to add..."
        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm"
      />

      <div className="flex flex-col sm:flex-row gap-2 min-w-0 items-stretch">
        <select
          value={resourceKey}
          onChange={(e) => setResourceKey(e.target.value)}
          className="sm:flex-[1.2] w-full min-w-0 max-w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm truncate"
        >
          <option value="">Select resource</option>
          {filtered.map((r) => (
            <option key={r.resource_key} value={r.resource_key}>
              {r.label}
            </option>
          ))}
        </select>

        <div className="sm:flex-1 min-w-0">
          {resourceKey ? (
            <ResourceQualitySelect
              resourceKey={resourceKey}
              resourceLabel={selectedLabel}
              quality={quality}
              onQualityChange={setQuality}
            />
          ) : (
            <div className="h-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-500 text-sm">
              Quality
            </div>
          )}
        </div>

        <ResourceQuantityInput
          resourceKey={resourceKey || undefined}
          value={quantity}
          onValueChange={setQuantity}
          placeholder={qtyUnit}
          className="sm:w-24 shrink-0 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm tabular-nums"
        />

        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 64))}
          placeholder="Note (optional)"
          maxLength={64}
          className="sm:flex-1 min-w-0 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500"
          aria-label="Stock card note"
        />
      </div>

      {resourceKey && (
        <p className="text-slate-400 text-xs">
          <span className={resourceLabelClassName(resourceKey)}>{selectedLabel}</span> ·{' '}
          {qualityLabel}
          {lineExists ? ' — adds to your existing card' : ' — creates a new card'}
        </p>
      )}

      <button
        type="button"
        onClick={() => void handleAdd()}
        disabled={submitting || !resourceKey}
        className="w-full max-w-full px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium truncate"
      >
        {submitting
          ? 'Adding...'
          : lineExists
            ? `Add ${formatQuantityForResource(resourceKey, parseQuantityForResource(resourceKey, quantity) ?? 0)} ${qtyUnit} to card`
            : 'Create stock card'}
      </button>
    </div>
  )
}
