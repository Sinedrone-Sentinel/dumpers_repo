import lookup from './lookup.json' with { type: 'json' }
import {
  normalizeInternalKey,
  resolveBlueprintInput as resolveWithLookup,
  type BlueprintLookupData,
  type BlueprintResolveContext,
  type BlueprintResolveFailure,
  type BlueprintResolveResult,
  type BlueprintResolveSuccess,
} from '../_shared/blueprintResolver.ts'

export type ResolveContext = BlueprintResolveContext
export type ResolveSuccess = BlueprintResolveSuccess
export type ResolveFailure = BlueprintResolveFailure
export type ResolveResult = BlueprintResolveResult

export { normalizeInternalKey }

const lookupData = lookup as BlueprintLookupData

export function resolveBlueprintInput(
  input: string,
  context: ResolveContext = {}
): ResolveResult {
  return resolveWithLookup(input, context, lookupData)
}
