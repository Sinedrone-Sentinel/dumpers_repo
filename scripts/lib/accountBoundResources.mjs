/**
 * Account-bound cargo: cannot be traded or shared between players, so it is
 * never tracked, priced, listed or shown anywhere in Dumper's Repo.
 *
 * Game files carry no account-bound flag on resource types, so each one is
 * listed here by its resourcetypedatabase record name and its tracker key.
 */
import { slugifyResourceKey } from './commodityLocalization.mjs'

/** resourcetypedatabase `_RecordName_` suffix (after `ResourceType.`). */
export const ACCOUNT_BOUND_RECORD_NAMES = new Set([
  'HolidayLetter', // Year of the Rat Envelope
])

/** Resource Tracker key / slug of the display name (game or UEX). */
export const ACCOUNT_BOUND_RESOURCE_KEYS = new Set([
  'year_of_the_rat_envelope',
])

export function isAccountBoundResourceKey(key) {
  return ACCOUNT_BOUND_RESOURCE_KEYS.has(key)
}

export function isAccountBoundResourceName(name) {
  return ACCOUNT_BOUND_RESOURCE_KEYS.has(slugifyResourceKey(name))
}
