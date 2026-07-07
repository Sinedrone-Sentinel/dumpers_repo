import lookupData from '../data/blueprint-name-lookup.json'
import {
  normalizeInternalKey,
  resolveBlueprintInput as resolveWithLookup,
  type BlueprintLookupData,
  type BlueprintResolveContext,
  type BlueprintResolveFailure,
  type BlueprintResolveResult,
  type BlueprintResolveSuccess,
} from '../../supabase/functions/_shared/blueprintResolver.ts'

export type { BlueprintLookupData, BlueprintResolveContext, BlueprintResolveFailure, BlueprintResolveResult, BlueprintResolveSuccess }
export { normalizeInternalKey }

const catalogLookup = lookupData as BlueprintLookupData

export function resolveBlueprintInput(
  input: string,
  context: BlueprintResolveContext = {},
  lookup: BlueprintLookupData = catalogLookup
): BlueprintResolveResult {
  return resolveWithLookup(input, context, lookup)
}
