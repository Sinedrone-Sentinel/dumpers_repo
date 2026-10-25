export type DiscordCollectionEvent = {
  type: string
  label: string
  hint: string
}

export type DiscordCollection = {
  id: string
  title: string
  hint: string
  accent: string
  titleClass: string
  requiresVerified: boolean
  events: DiscordCollectionEvent[]
}

/** Member webhook groups. One URL per collection, one checkbox per alert. */
export const DISCORD_COLLECTIONS: DiscordCollection[] = [
  {
    id: 'my-deals',
    title: 'My deals',
    hint: 'Pings about a deal you are part of. Each step can be turned off.',
    accent: 'border-emerald-500/40',
    titleClass: 'text-emerald-300',
    requiresVerified: true,
    events: [
      { type: 'my_order_accepted', label: 'Someone accepted my listing', hint: 'A counterparty accepts your WTB or WTS.' },
      { type: 'my_order_in_progress', label: 'Work started', hint: 'Craft or sale work begins on your deal.' },
      { type: 'my_order_ready', label: 'Ready for pickup', hint: 'The seller marks your order ready.' },
      { type: 'my_order_completed', label: 'Pickup confirmed', hint: 'The buyer confirms pickup on your sale.' },
      { type: 'my_order_cancelled', label: 'Counterparty cancelled', hint: 'The other party cancels before completion.' },
      { type: 'my_order_released', label: 'Released back to the pool', hint: 'Your deal is released for someone else to take.' },
      { type: 'my_order_timeout', label: 'Timeout', hint: 'A deal times out and returns to the pool.' },
      { type: 'my_order_noshow', label: 'No-show', hint: 'A pickup deadline is missed.' },
    ],
  },
  {
    id: 'dispute',
    title: 'Dispute',
    hint: 'When a dispute is opened on your order.',
    accent: 'border-red-500/40',
    titleClass: 'text-red-300',
    requiresVerified: true,
    events: [
      { type: 'my_order_dispute', label: 'Dispute opened', hint: 'A dispute is opened on your order.' },
    ],
  },
  {
    id: 'deal-chat',
    title: 'Deal chat',
    hint: 'One ping each time the other party writes on your accepted deal.',
    accent: 'border-sky-500/40',
    titleClass: 'text-sky-300',
    requiresVerified: true,
    events: [
      { type: 'my_order_deal_message', label: 'Deal chat message', hint: 'The other party sends a message.' },
    ],
  },
  {
    id: 'friends',
    title: 'Friends',
    hint: 'Friend requests use RSI Handles only.',
    accent: 'border-blue-500/40',
    titleClass: 'text-blue-300',
    requiresVerified: true,
    events: [
      { type: 'my_friend_request', label: 'Request received', hint: 'Another member sends you a friend request.' },
      { type: 'my_friend_accepted', label: 'Request accepted', hint: 'Someone accepts the request you sent.' },
    ],
  },
  {
    id: 'wtb',
    title: 'WTB listings',
    hint: 'Other members’ want-to-buy posts. You do not get a ping for your own.',
    accent: 'border-emerald-500/40',
    titleClass: 'text-emerald-300',
    requiresVerified: true,
    events: [
      { type: 'market_wtb_new', label: 'New', hint: 'A new want-to-buy listing. A burst from the same member folds into one message after 2 minutes.' },
      { type: 'market_wtb_edited', label: 'Edited', hint: 'Edits to a want-to-buy listing, sent 5 minutes after the last save.' },
      { type: 'market_wtb_cancelled', label: 'Cancelled', hint: 'A want-to-buy listing is cancelled. A burst folds together for 2 minutes.' },
    ],
  },
  {
    id: 'wts',
    title: 'WTS listings',
    hint: 'Other members’ want-to-sell posts. You do not get a ping for your own.',
    accent: 'border-emerald-500/40',
    titleClass: 'text-emerald-300',
    requiresVerified: true,
    events: [
      { type: 'market_wts_new', label: 'New', hint: 'A new want-to-sell listing. A burst from the same member folds into one message after 2 minutes.' },
      { type: 'market_wts_edited', label: 'Edited', hint: 'Edits to a want-to-sell listing, sent 5 minutes after the last save.' },
      { type: 'market_wts_cancelled', label: 'Cancelled', hint: 'A want-to-sell listing is cancelled. A burst folds together for 2 minutes.' },
    ],
  },
  {
    id: 'accepted',
    title: 'Listing accepted',
    hint: 'When any marketplace listing is accepted.',
    accent: 'border-blue-500/40',
    titleClass: 'text-blue-300',
    requiresVerified: true,
    events: [
      { type: 'market_accepted', label: 'Listing accepted', hint: 'Any WTB or WTS is accepted. Sends immediately.' },
    ],
  },
  {
    id: 'support',
    title: 'My support ticket',
    hint: 'Replies and closures on a ticket you opened.',
    accent: 'border-violet-500/40',
    titleClass: 'text-violet-300',
    requiresVerified: false,
    events: [
      { type: 'my_support_reply', label: 'Staff reply', hint: 'Staff responds on your ticket.' },
      { type: 'my_support_resolved', label: 'Ticket resolved', hint: 'Staff closes your ticket.' },
    ],
  },
  {
    id: 'hangar',
    title: 'Executive Hangar',
    hint: 'Warnings before all five lights turn green.',
    accent: 'border-amber-500/40',
    titleClass: 'text-amber-300',
    requiresVerified: false,
    events: [
      { type: 'hangar_30', label: '30 minutes before', hint: 'One ping, 30 minutes before the lights are all green.' },
      { type: 'hangar_5', label: '5 minutes before', hint: 'One ping, 5 minutes before the lights are all green.' },
    ],
  },
  {
    id: 'franken',
    title: "Fuzy's Franken-Fit",
    hint: 'When a published fit is added or replaced.',
    accent: 'border-amber-500/40',
    titleClass: 'text-amber-300',
    requiresVerified: false,
    events: [
      { type: 'franken_new', label: 'New fit', hint: 'A ship gets its first published Franken-Fit.' },
      { type: 'franken_updated', label: 'Updated fit', hint: 'A published Franken-Fit is replaced.' },
    ],
  },
]

export const STAFF_WEBHOOK_GROUPS = [
  {
    id: 'member-arrived',
    title: 'Member arrived',
    events: [
      { type: 'admin_member_joined', label: 'New user joined' },
      { type: 'admin_rsi_verified', label: 'RSI Handle verified' },
      { type: 'admin_member_left', label: 'Member left' },
    ],
  },
  {
    id: 'staff-alerts',
    title: 'Staff alerts',
    events: [
      { type: 'admin_edge_abuse', label: 'Dumper edge abuse' },
      { type: 'support', label: 'New support ticket' },
    ],
  },
  {
    id: 'applications',
    title: 'Applications',
    events: [
      { type: 'partnership_application', label: 'Partnership' },
      { type: 'contributor_application', label: 'Dev team' },
    ],
  },
  {
    id: 'officer-demoted',
    title: 'Officer demoted',
    events: [{ type: 'admin_officer_demoted', label: 'Officer demoted' }],
  },
] as const
