/**
 * Star Citizen transfer limits — informational only for UI warnings.
 * Not enforced or tracked by this app; limits may change in-game at any time.
 */
export const AUEC_SINGLE_TRANSFER_MAX = 1_000_000
export const AUEC_DAILY_TRANSFER_COUNT_MAX = 5

export function exceedsSingleTransferLimit(totalAuec: number): boolean {
  return Number.isFinite(totalAuec) && totalAuec > AUEC_SINGLE_TRANSFER_MAX
}

export function formatAuecFull(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '0 aUEC'
  return `${Math.round(amount).toLocaleString()} aUEC`
}
