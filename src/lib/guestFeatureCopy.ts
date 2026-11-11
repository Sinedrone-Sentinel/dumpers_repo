import type { FeatureId } from './featureAccess'

export interface GuestFeatureCopy {
  title: string
  description: string
  details: string[]
}

/** Shared pitch for guest → member conversion screens */
export const GUEST_MEMBERSHIP_PITCH = {
  headline: 'Member accounts are free',
  subhead: 'Full access to every member tool. No subscriptions. No paid tiers.',
  bullets: [
    'Completely free — sign in with Google or Discord',
    'No subscriptions or recurring charges',
    'Full member access once approved (officer review is for community safety, not payment)',
  ],
}

export const GUEST_LOCKED_FEATURE_COPY: Partial<Record<FeatureId, GuestFeatureCopy>> = {
  custom_orders: {
    title: 'My Listings',
    description: 'Buy and sell crafted items and resources with other members on the Bazaar.',
    details: [
      'Keep one WTB buy listing for crafted items (blueprint, quality, quantity) or bulk resources',
      'Keep one WTS sell listing for stock you have on hand',
      'Get notified when someone buys or claims items from your listings',
      'Rate your trade partners when transactions complete — builds community reputation',
      'Requires a verified RSI Handle and officer approval to participate',
    ],
  },
  flight_profile: {
    title: 'Flight Profile',
    description: 'Map a Star Citizen joystick and HOTAS profile onto the VKB or Virpil controls you mounted.',
    details: [
      'Sign in with a free member account',
      'Pick the stick, throttle, and the modules mounted on each side. Those choices are saved on your account',
      'Upload one flight profile. A new upload replaces the saved one',
      'In Chrome or Edge, choose the stick or the throttle before you press a button. Joystick 1 and joystick 2 stay separate. The number you accept is saved on your account',
      'Show Map draws the selected controls with your joystick assignments. Print map opens that sheet as it looks. Print blank leaves three lines on every numbered control',
    ],
  },
  smart_hauler: {
    title: 'Smart Hauler',
    description: 'Plan cargo runs from where you are, or find buyers for cargo you already carry.',
    details: [
      'Pick a cargo ship, then set a profit goal or a number of trades',
      'Every buy and sell is checked against live UEX stock when the route is built',
      'Sell what I have finds the nearest terminal that buys your cargo in the crate sizes you carry',
      'Free member account — sign in with Google or Discord',
    ],
  },
}

export function getGuestFeatureCopy(featureId: FeatureId): GuestFeatureCopy {
  return (
    GUEST_LOCKED_FEATURE_COPY[featureId] ?? {
      title: 'Member Feature',
      description: 'Sign in for a free member account with full access to community tools on this site.',
      details: [
        'Free account — no subscriptions or paid tiers',
        'Track your own blueprints, targets, and resources',
        'Buy and sell on The Bazaar once approved',
      ],
    }
  )
}
