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
export const GEMINI_STUDIO_KEY_URL = 'https://aistudio.google.com/apikey'

export type AdvisorChatRole = 'user' | 'advisor'

export interface AdvisorChatMessage {
  role: AdvisorChatRole
  text: string
}

export interface AdvisorHeadSession {
  head: string
  modules: string[]
}

export interface AdvisorScanPayload {
  mass: number
  resistancePercent: number
  instability: number | null
  crackSummary: string
}

export interface AdvisorAskInput {
  apiKey?: string
  useStoredKey?: boolean
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
  | { ok: true; advice: string }
  | { ok: false; error: string }

export function describeAdvisorLoadout(slots: MiningLaserSlotConfig[]): AdvisorHeadSession[] {
  return slots.map((slot) => {
    const laser = getMiningLaserByName(slot.laserName)
    const modules = (slot.modules ?? [])
      .map((name) => (name ? getMiningModuleByName(name)?.displayName ?? null : null))
      .filter((name): name is string => Boolean(name))
    return {
      head: laser?.displayName ?? 'Unknown head',
      modules,
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

async function advisorInvokeError(error: { message?: string; context?: Response }): Promise<string> {
  const ctx = error.context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const payload = (await ctx.json()) as { error?: string }
      if (payload?.error) return payload.error
    } catch {
      /* fall through */
    }
  }
  return error.message || 'Advisor is unavailable right now.'
}

export async function miningAdvisorHasSavedKey(): Promise<boolean> {
  const { data, error } = await supabase.rpc('mining_advisor_has_saved_key')
  if (error) return false
  return data === true
}

export async function saveMiningAdvisorKey(apiKey: string): Promise<AdvisorAskResult> {
  const { data, error } = await supabase.functions.invoke('mining-loadout-advisor', {
    body: { action: 'save-key', apiKey },
  })
  if (error) return { ok: false, error: await advisorInvokeError(error) }
  if (!(data as { saved?: boolean } | null)?.saved) {
    return { ok: false, error: 'Could not save your key. Try again.' }
  }
  return { ok: true, advice: '' }
}

export async function deleteMiningAdvisorSavedKey(): Promise<AdvisorAskResult> {
  const { error } = await supabase.rpc('mining_advisor_delete_saved_key')
  if (error) return { ok: false, error: error.message || 'Could not remove the saved key.' }
  return { ok: true, advice: '' }
}

export async function askMiningAdvisor(input: AdvisorAskInput): Promise<AdvisorAskResult> {
  const pasted = input.apiKey?.trim() ?? ''
  const { data, error } = await supabase.functions.invoke('mining-loadout-advisor', {
    body: {
      action: 'ask',
      apiKey: pasted || undefined,
      useStoredKey: Boolean(input.useStoredKey) && !pasted,
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

  if (error) return { ok: false, error: await advisorInvokeError(error) }

  const advice = (data as { advice?: string } | null)?.advice?.trim()
  if (!advice) return { ok: false, error: 'Advisor returned an empty answer.' }
  return { ok: true, advice }
}
