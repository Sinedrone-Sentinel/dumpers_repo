import React, { useState } from 'react'
import { wipeResourceTracker, syncBlueprintResourceCatalog, type ResourceCatalogSyncResult } from '../lib/operations'
import { supabase } from '../lib/supabase'
import { useBlueprintData } from '../routes/blueprints'
import AppModal from './layout/AppModal'

/** Patch-day command runbook — keep in sync with docs/DATA_SOURCES.md#data-update-process (.cursor/rules/db-actions-patch-runbook.mdc) */
type PatchDayStep = {
  step: number
  title: string
  description: string
  commands: string[]
  optional?: boolean
}

const PATCH_DAY_STEPS: PatchDayStep[] = [
  {
    step: 1,
    title: 'Extract game data',
    description:
      'StarBreaker: full DataForge DCB + localization into extracted-data/ (wipes prior extract). Optional shop socpaks: add -IncludeShopData',
    commands: ['.\\scripts\\extract-game-data.ps1'],
  },
  {
    step: 2,
    title: 'Parse extracted data',
    description:
      'Regenerates all src/data/game-*.json (blueprints, mining, components, lore, etc.) from scratch. Also appends What\'s New lines and pushes to Supabase (needs SUPABASE_SERVICE_ROLE_KEY in .env); same issue+version is skipped so mid-patch re-parses do not duplicate',
    commands: ['npm run parse-game-data'],
  },
  {
    step: 3,
    title: 'Review patch diff / retry What\'s New push',
    description:
      'Compare fresh parse vs last commit — ADDED / REMOVED / RENAMED-MOVED / CHANGED per file. If parse could not reach Supabase, push pending ticker lines with push-whats-new (then the pending file is wiped)',
    commands: ['npm run diff-game-data', 'npm run push-whats-new'],
  },
  {
    step: 4,
    title: 'Verify removals are real',
    description:
      'CIG often moves records between directories. Check _extraction-validation.json for missing paths; rg the new extract before treating REMOVED as deleted. Update EXPECTED_PATHS in parse-extracted-data.mjs if a directory moved',
    commands: [],
  },
  {
    step: 5,
    title: 'Audit + validate',
    description:
      'Full battery: mining aliases, ore names, blueprint sanity, mission rewards, HPP/alias coverage (needs extract), mining math + mole strategy verifiers, DFP premium check, patch diff. Fix typos in parse-extracted-data.mjs or mining-ore-aliases.json as needed',
    commands: ['npm run patch-audit'],
  },
  {
    step: 6,
    title: 'UEX Q0 commodity bases',
    description: "Refresh DFP Q0 bases for Resource Tracker commodities → dfp-commodity-bases.json. Run before DFP engine build when refreshing UEX prices",
    commands: ['npm run fetch-commodity-bases'],
    optional: true,
  },
  {
    step: 7,
    title: 'UEX commodity buy/sell locations',
    description:
      'Refresh Commodity Lookup index (terminals, buy/sell listings, SCU box sizes) → shop-commodity-index.json. Powered by UEX',
    commands: ['npm run fetch-shop-data'],
    optional: true,
  },
  {
    step: 8,
    title: 'DFP engine build',
    description:
      'Required when blueprints changed. Regenerates acquisition premiums, component metadata, commodity bases, Wikelo ammo pricing. Writes public/dfp-engine.js + public/dfp-version.json here — commit both. Pricing formulas live only in dfp-engine-private',
    commands: ['cd ..\\dfp-engine-private', 'npm run build'],
  },
  {
    step: 9,
    title: 'BP Dumper name lookup',
    description:
      'Only if blueprints changed — refreshes blueprint-name-lookup.json for Game.log / webhook resolution, then redeploy log-watcher-webhook',
    commands: [
      'npm run generate-dumper-mappings',
      'npm run copy-blueprint-lookup',
      'npx supabase functions deploy log-watcher-webhook --no-verify-jwt',
    ],
    optional: true,
  },
  {
    step: 10,
    title: 'BP Dumper min game version',
    description: 'Only if game major.minor changed — bakes version into BP Dumper sources from game-build-version.json',
    commands: ['npm run sync-min-game-version'],
    optional: true,
  },
  {
    step: 11,
    title: 'Sync resource catalog',
    description:
      'Push blueprint materials + extra commodities to Supabase blueprint_resources (use Sync from Blueprints button below). Run after parse when new craft materials appeared',
    commands: [],
  },
  {
    step: 12,
    title: 'Production build',
    description: 'Vite build + version stamp + archive guide regeneration → dist/',
    commands: ['npm run build'],
  },
  {
    step: 13,
    title: 'Commit & deploy',
    description:
      'Commit game-*.json, DFP bundle, shop/commodity data, and generated lookup files; deploy dist/. No other DB sync — catalogs bundle at build time',
    commands: [],
  },
]

function PatchDayCommandList() {
  return (
    <div className="max-h-[min(52vh,28rem)] overflow-y-auto overscroll-contain space-y-2 pr-0.5">
      {PATCH_DAY_STEPS.map((item) => (
        <div key={item.step} className="flex items-start gap-2.5 p-2 bg-slate-800/50 rounded-lg">
          <span className="shrink-0 w-6 h-6 flex items-center justify-center bg-violet-600 text-white text-xs font-bold rounded-full mt-0.5">
            {item.step}
          </span>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs text-white font-medium">{item.title}</p>
              {item.optional && (
                <span className="text-[9px] font-semibold uppercase tracking-wide rounded bg-slate-700/80 text-slate-400 border border-slate-600 px-1 py-0.5">
                  optional
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-500 leading-snug">{item.description}</p>
            {item.commands.length > 0 && (
              <div className="flex flex-col gap-1 pt-0.5">
                {item.commands.map((cmd) => (
                  <code
                    key={cmd}
                    className="block px-2 py-1 bg-slate-900 text-violet-400 text-[10px] font-mono rounded select-all break-all"
                  >
                    {cmd}
                  </code>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function PatchDayRunbookSection() {
  const [expanded, setExpanded] = useState(false)
  const commandStepCount = PATCH_DAY_STEPS.filter((s) => s.commands.length > 0).length

  return (
    <div className="p-3 sm:p-4 rounded-xl border border-orange-500/30 bg-orange-950/20 space-y-3">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        className="w-full flex items-start justify-between gap-3 text-left group"
      >
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-medium text-sm">Game Data Update Process</h3>
          <p className="text-xs text-slate-400 mt-1">
            Patch-day runbook ({PATCH_DAY_STEPS.length} steps, {commandStepCount} commands) — mirrors{' '}
            <code className="text-violet-400">docs/DATA_SOURCES.md</code>
          </p>
          {!expanded && (
            <p className="text-[10px] text-slate-500 mt-1.5">
              Expand for extract → parse → diff → audit → UEX/DFP → BP Dumper → build → deploy
            </p>
          )}
        </div>
        <span
          className={`shrink-0 mt-0.5 p-1 rounded-lg text-slate-400 group-hover:text-slate-200 group-hover:bg-slate-800/60 transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
          aria-hidden
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {expanded && (
        <>
          <PatchDayCommandList />
          <p className="text-[10px] text-slate-600 italic pt-1">
            Steps 1–12 run locally in terminal (PowerShell for extract). All game catalogs bundle from
            parsed game-*.json at build time — no Supabase sync for blueprints/mining/components.
          </p>
          <p className="text-[10px] text-amber-400/70">
            If parse or patch-audit reports validation issues, game data structure may have changed — see
            docs/DATA_SOURCES.md. Mission rewards broken?{' '}
            <code className="text-amber-300/80">npm run rebuild-mission-rewards</code>
          </p>
        </>
      )}
    </div>
  )
}

export default function DbActionsModal({ onClose }: { onClose: () => void }) {
  const { data: blueprints } = useBlueprintData()

  const [confirmText, setConfirmText] = useState('')
  const [wiping, setWiping] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Resource catalog sync state
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<ResourceCatalogSyncResult | null>(null)

  // RSI Handle verification removal state
  const [rsiHandleToRevoke, setRsiHandleToRevoke] = useState('')
  const [alsoBanUser, setAlsoBanUser] = useState(false)
  const [revoking, setRevoking] = useState(false)

  // Rep reset state
  const [repResetHandle, setRepResetHandle] = useState('')
  const [repResetUserId, setRepResetUserId] = useState<string | null>(null)
  const [repResetUserName, setRepResetUserName] = useState('')
  const [clearArchived, setClearArchived] = useState(false)
  const [searchingUser, setSearchingUser] = useState(false)
  const [resettingRep, setResettingRep] = useState(false)

  const handleSyncCatalog = async () => {
    if (!blueprints) return

    setSyncing(true)
    setMessage(null)
    setSyncResult(null)

    const result = await syncBlueprintResourceCatalog(blueprints)

    setSyncing(false)

    if (result.error) {
      setMessage({ type: 'error', text: result.error })
      return
    }

    setSyncResult(result.result ?? null)
    setMessage({
      type: 'success',
      text: `Catalog synced: ${result.result?.total ?? 0} resources`,
    })
  }

  const handleWipe = async () => {
    if (confirmText !== 'WIPE') return

    setWiping(true)
    setMessage(null)

    const result = await wipeResourceTracker()

    setWiping(false)

    if (result.error) {
      setMessage({ type: 'error', text: result.error })
      return
    }

    setMessage({
      type: 'success',
      text: `Wiped ${result.deletedCount ?? 0} personal stock row(s).`,
    })
    setConfirmText('')
  }

  const handleRevokeVerification = async () => {
    if (!rsiHandleToRevoke.trim()) return

    setRevoking(true)
    setMessage(null)

    try {
      const rpcName = alsoBanUser ? 'remove_rsi_verification_and_ban' : 'remove_rsi_verification'
      const params = alsoBanUser 
        ? { p_handle: rsiHandleToRevoke.trim(), p_reason: 'RSI Handle verification revoked by super-admin' }
        : { p_handle: rsiHandleToRevoke.trim() }

      const { data, error } = await supabase.rpc(rpcName, params)

      if (error) {
        setMessage({ type: 'error', text: error.message })
      } else if (!data?.success) {
        setMessage({ type: 'error', text: data?.error || 'Failed to revoke verification' })
      } else {
        const action = alsoBanUser ? 'revoked and banned' : 'revoked'
        const userName = data.display_name || data.banned_user || rsiHandleToRevoke
        setMessage({ 
          type: 'success', 
          text: `Verification ${action} for ${userName}` 
        })
        setRsiHandleToRevoke('')
        setAlsoBanUser(false)
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error during revocation' })
    }

    setRevoking(false)
  }

  const handleSearchRepUser = async () => {
    if (!repResetHandle.trim()) return

    setSearchingUser(true)
    setMessage(null)
    setRepResetUserId(null)
    setRepResetUserName('')

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, rsi_handle, email')
        .ilike('rsi_handle', repResetHandle.trim())
        .single()

      if (error || !data) {
        setMessage({ type: 'error', text: 'User not found with that RSI Handle' })
      } else {
        setRepResetUserId(data.id)
        setRepResetUserName(data.rsi_handle || data.display_name || data.email || 'Unknown')
      }
    } catch {
      setMessage({ type: 'error', text: 'Error searching for user' })
    }

    setSearchingUser(false)
  }

  const handleResetRep = async (type: 'buyer' | 'fulfiller') => {
    if (!repResetUserId) return

    setResettingRep(true)
    setMessage(null)

    try {
      const rpcName = type === 'buyer' ? 'reset_user_buyer_rep' : 'reset_user_fulfiller_rep'
      const { data, error } = await supabase.rpc(rpcName, {
        p_target_user_id: repResetUserId,
        p_clear_archived: clearArchived,
      })

      if (error) {
        setMessage({ type: 'error', text: error.message })
      } else if (data?.success) {
        const archiveMsg = clearArchived ? ` and ${data.deleted_orders} archived orders` : ''
        setMessage({
          type: 'success',
          text: `Reset ${type} rep for ${repResetUserName}. Deleted ${data.deleted_ratings} ratings${archiveMsg}.`,
        })
        setRepResetHandle('')
        setRepResetUserId(null)
        setRepResetUserName('')
        setClearArchived(false)
      } else {
        setMessage({ type: 'error', text: data?.error || 'Failed to reset reputation' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Error resetting reputation' })
    }

    setResettingRep(false)
  }

  return (
    <AppModal
      title="DB Actions"
      subtitle="Super-admin database operations"
      onClose={onClose}
      size="lg"
      zIndex={70}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="w-full px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Close
        </button>
      }
    >
      {message && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-900/50 border border-green-500/50 text-green-400'
              : 'bg-red-900/50 border border-red-500/50 text-red-400'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="space-y-4">
        <PatchDayRunbookSection />

        {/* Resource Catalog Sync */}
        <div className="p-3 sm:p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 space-y-3">
          <div>
            <h3 className="text-white font-medium text-sm">Sync Resource Catalog</h3>
            <p className="text-xs text-slate-400 mt-1">
              Sync commodities from blueprint materials + extra catalog (scrips, salvage, gases, etc.)
              to the database. Run after game data updates or if commodities are missing from Bazaar.
            </p>
          </div>
          {syncResult && (
            <div className="text-xs text-emerald-400 bg-emerald-900/30 p-2 rounded-lg">
              Last sync: {syncResult.total} resources
              {syncResult.added > 0 && ` · ${syncResult.added} new`}
            </div>
          )}
          <button
            type="button"
            onClick={() => void handleSyncCatalog()}
            disabled={syncing || !blueprints}
            className="w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {syncing ? 'Syncing...' : 'Sync from Blueprints'}
          </button>
        </div>

        {/* RSI Handle Verification Revoke */}
        <div className="p-3 sm:p-4 rounded-xl border border-amber-500/30 bg-amber-950/20 space-y-3">
          <div>
            <h3 className="text-white font-medium text-sm">Revoke RSI Handle Verification</h3>
            <p className="text-xs text-slate-400 mt-1">
              Remove verification badge from a user's RSI Handle. Optionally ban them at the same time.
            </p>
          </div>
          <input
            type="text"
            value={rsiHandleToRevoke}
            onChange={(e) => setRsiHandleToRevoke(e.target.value)}
            placeholder="Enter RSI Handle to revoke..."
            className="w-full px-3 py-2 bg-slate-800 border border-amber-500/30 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 text-sm"
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={alsoBanUser}
              onChange={(e) => setAlsoBanUser(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-red-500 focus:ring-red-500/20"
            />
            <span className="text-sm text-red-400">Also ban this user</span>
          </label>
          <button
            type="button"
            onClick={() => void handleRevokeVerification()}
            disabled={revoking || !rsiHandleToRevoke.trim()}
            className={`w-full px-4 py-2.5 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
              alsoBanUser 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            {revoking ? 'Processing...' : alsoBanUser ? 'Revoke & Ban' : 'Revoke Verification'}
          </button>
        </div>

        {/* Rep Reset */}
        <div className="p-3 sm:p-4 rounded-xl border border-blue-500/30 bg-blue-950/20 space-y-3">
          <div>
            <h3 className="text-white font-medium text-sm">Reset User Reputation</h3>
            <p className="text-xs text-slate-400 mt-1">
              Reset a user's buyer or fulfiller reputation. Optionally clear their archived orders.
            </p>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={repResetHandle}
              onChange={(e) => {
                setRepResetHandle(e.target.value)
                setRepResetUserId(null)
                setRepResetUserName('')
              }}
              placeholder="RSI Handle..."
              className="flex-1 px-3 py-2 bg-slate-800 border border-blue-500/30 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 text-sm"
            />
            <button
              onClick={() => void handleSearchRepUser()}
              disabled={searchingUser || !repResetHandle.trim()}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
            >
              {searchingUser ? '...' : 'Find'}
            </button>
          </div>
          {repResetUserId && (
            <div className="p-3 bg-slate-800/50 rounded-lg border border-blue-500/20">
              <p className="text-sm text-white mb-2">Found: <strong>{repResetUserName}</strong></p>
              <label className="flex items-center gap-2 cursor-pointer mb-3">
                <input
                  type="checkbox"
                  checked={clearArchived}
                  onChange={(e) => setClearArchived(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500/20"
                />
                <span className="text-sm text-slate-400">Also clear archived orders/fulfillments</span>
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => void handleResetRep('buyer')}
                  disabled={resettingRep}
                  className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  Reset Buyer Rep
                </button>
                <button
                  onClick={() => void handleResetRep('fulfiller')}
                  disabled={resettingRep}
                  className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  Reset Fulfiller Rep
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Resource Tracker Wipe */}
        <div className="p-3 sm:p-4 rounded-xl border border-red-500/30 bg-red-950/20 space-y-3">
          <div>
            <h3 className="text-white font-medium text-sm">Resource Tracker Wipe</h3>
            <p className="text-sm text-slate-400 mt-1">
              Deletes all rows from personal resource inventory. Site Total will read empty until members
              re-enter stock. This cannot be undone.
            </p>
          </div>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type WIPE to confirm"
            className="w-full px-3 py-2 bg-slate-800 border border-red-500/30 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50 text-sm"
          />
          <button
            type="button"
            onClick={() => void handleWipe()}
            disabled={wiping || confirmText !== 'WIPE'}
            className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {wiping ? 'Wiping...' : 'Wipe all personal stock'}
          </button>
        </div>
      </div>
    </AppModal>
  )
}
