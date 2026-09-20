import {
  deleteSavedGeminiKey,
  edgeInvokeError,
  GEMINI_SAVED_KEY_EVENT,
  hasSavedGeminiKey,
  notifyGeminiSavedKeyChanged,
  saveGeminiKey,
  unlockGeminiKey,
} from './geminiKeyVault'
import { supabase } from './supabase'
import { getMiningGadgetByName } from './miningGadgets'
import type { SmartCrackerResult } from './miningGadgetRecommendations'
import type { LoadoutBreakabilityComparison } from './miningLoadoutCompare'
import type { MiningLaserSlotConfig } from './miningLaserStats'
import { getMiningModuleByName } from './miningModules'
import { getMiningLaserByName, getMiningVessel, type MiningVesselId } from './miningVessels'

/** Legacy localStorage key — never write a Gemini key here. Cleared on Advisor open. */
export const MINING_ADVISOR_KEY_STORAGE = 'dumpers_mining_advisor_gemini_key'
export const MINING_ADVISOR_THREAD_STORAGE = 'dumpers_mining_advisor_thread'
export const MINING_ADVISOR_UI_STORAGE = 'dumpers_mining_advisor_ui'
export { GEMINI_STUDIO_KEY_URL } from './geminiKeyVault'

export type AdvisorChatRole = 'user' | 'advisor'

export interface AdvisorChatMessage {
  role: AdvisorChatRole
  text: string
}

export interface AdvisorHeadSession {
  head: string
  modules: string[]
  slots: number | null
  size: number | null
}

export interface AdvisorScanPayload {
  mass: number
  resistancePercent: number
  instability: number | null
  crackSummary: string
}

export interface AdvisorAskInput {
  apiKey: string
  question: string
  messages: AdvisorChatMessage[]
  useScannedInfo: boolean
  vesselDisplayName: string
  loadout: AdvisorHeadSession[]
  gadgetsInUse: string[]
  oreName: string | null
  scan: AdvisorScanPayload | null
}

export type AdvisorAskResult =
  | { ok: true; advice: string; usage?: unknown }
  | { ok: false; error: string; usage?: unknown }

export function describeAdvisorLoadout(slots: MiningLaserSlotConfig[]): AdvisorHeadSession[] {
  return slots.map((slot) => {
    const laser = getMiningLaserByName(slot.laserName)
    const modules = (slot.modules ?? [])
      .map((name) => (name ? getMiningModuleByName(name)?.displayName ?? null : null))
      .filter((name): name is string => Boolean(name))
    return {
      head: laser?.displayName ?? 'Unknown head',
      modules,
      slots: laser?.moduleSlotCount ?? null,
      size: laser?.size ?? null,
    }
  })
}

export function gadgetDisplayNames(names: readonly (string | null | undefined)[] | null | undefined): string[] {
  if (!names?.length) return []
  const out: string[] = []
  for (const name of names) {
    if (!name) continue
    const gadget = getMiningGadgetByName(name)
    if (gadget?.displayName) out.push(gadget.displayName)
  }
  return out
}

export function vesselAdvisorLabel(vesselId: MiningVesselId): string {
  return getMiningVessel(vesselId)?.displayName ?? 'Unknown ship'
}

export function buildAdvisorCrackSummary(
  comparison: LoadoutBreakabilityComparison | null,
  smartCracker: SmartCrackerResult | null,
): string {
  if (!comparison) return ''
  const parts: string[] = []
  parts.push(
    comparison.canBreak
      ? 'Can fracture this rock.'
      : `Short ${comparison.totalShortfallMw.toLocaleString()} MW.`,
  )
  parts.push(
    `Required ${comparison.requiredPower.toLocaleString()} MW; loadout ${comparison.totalLaserPower.toLocaleString()} MW.`,
  )
  const recommended = smartCracker?.gadgetSuggestions.find((row) => row.recommended)
  if (recommended) {
    parts.push(`Suggested gadget: ${recommended.gadget.displayName}. ${recommended.reason}`)
  }
  if (smartCracker?.moleStrategy) {
    parts.push('A Mole crew head plan is available in Smart Cracker.')
  }
  return parts.join(' ')
}

// The saved Gemini key is shared with the site Help bot, so the storage helpers
// live in geminiKeyVault. These keep their Advisor names for existing callers.
export const MINING_ADVISOR_SAVED_KEY_EVENT = GEMINI_SAVED_KEY_EVENT
export const notifyMiningAdvisorSavedKeyChanged = notifyGeminiSavedKeyChanged
export const miningAdvisorHasSavedKey = hasSavedGeminiKey
export const saveMiningAdvisorKey = saveGeminiKey
export const unlockMiningAdvisorKey = unlockGeminiKey
export const deleteMiningAdvisorSavedKey = deleteSavedGeminiKey

export async function askMiningAdvisor(input: AdvisorAskInput): Promise<AdvisorAskResult> {
  const pasted = input.apiKey.trim()
  const { data, error } = await supabase.functions.invoke('mining-loadout-advisor', {
    body: {
      apiKey: pasted,
      question: input.question,
      messages: input.messages.slice(-8),
      useScannedInfo: input.useScannedInfo,
      vesselDisplayName: input.vesselDisplayName,
      loadout: input.loadout,
      gadgetsInUse: input.gadgetsInUse,
      oreName: input.oreName,
      scan: input.useScannedInfo ? input.scan : null,
    },
  })

  if (error) {
    // A 429 still carries a usage snapshot; surface it so the meter shows the cap.
    let usage: unknown = null
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.clone === 'function') {
      try {
        usage = ((await ctx.clone().json()) as { usage?: unknown })?.usage ?? null
      } catch {
        /* no usage on this error */
      }
    }
    return {
      ok: false,
      error: await edgeInvokeError(error, 'Advisor is unavailable right now.'),
      usage,
    }
  }

  const payload = data as { advice?: string; usage?: unknown } | null
  const advice = payload?.advice?.trim()
  if (!advice) return { ok: false, error: 'Advisor returned an empty answer.' }
  return { ok: true, advice, usage: payload?.usage ?? null }
}
