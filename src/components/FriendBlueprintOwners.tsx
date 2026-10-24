import { useState } from 'react'
import AppModal from './layout/AppModal'
import SiteTooltip from './SiteTooltip'

export default function FriendBlueprintOwners({
  handles,
  blueprintName,
}: {
  handles?: string[]
  blueprintName?: string
}) {
  const [open, setOpen] = useState(false)
  if (!handles || handles.length < 1) return null

  return (
    <>
      <SiteTooltip side="top" content="Friends who own this">
        <button
          type="button"
          className="flex items-center gap-1 text-green-400"
          onClick={(event) => {
            event.stopPropagation()
            setOpen(true)
          }}
        >
          <span aria-hidden>👤</span>
          <span>{handles.length}</span>
        </button>
      </SiteTooltip>
      {open && (
        <AppModal
          title={blueprintName || 'Friends'}
          subtitle="Friends who own this"
          onClose={() => setOpen(false)}
          size="sm"
          zIndex={80}
        >
          <ul className="max-h-64 space-y-1 overflow-y-auto text-sm text-white">
            {handles.map((handle) => (
              <li key={handle} className="rounded px-2 py-1 hover:bg-white/5">{handle}</li>
            ))}
          </ul>
        </AppModal>
      )}
    </>
  )
}
