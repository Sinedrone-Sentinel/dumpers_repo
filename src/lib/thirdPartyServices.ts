/** Static external service links shown at the top of Request Services. */

export type ThirdPartyPricingTier = 'FREE' | 'FEE'

export type ThirdPartyService = {
  id: string
  label: string
  href: string
  faviconSrc: string
  tooltip: string
  pricing_tier: ThirdPartyPricingTier
}

export const THIRD_PARTY_SERVICES: ThirdPartyService[] = [
  {
    id: 'medrunner',
    label: 'Call Medrunner',
    href: 'https://portal.medrunner.space/',
    faviconSrc: '/third-party/medrunner.png',
    pricing_tier: 'FREE',
    tooltip:
      '100% free rapid medical extraction in Star Citizen — protect, stabilize, and evacuate you to the nearest medical facility. Opens Medrunner’s client portal (their account required).',
  },
]
