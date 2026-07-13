export const ARCHIVE_GUIDE_META = {
  title: "Dumper's Repo",
  subtitle:
    'A community-driven platform for Star Citizen crafting, resource tracking, and fair-value pricing.',
  documentTitle: "Dumper's Repo - Complete Archive Guide",
}

export const ABOUT_SECTION = {
  id: 'about',
  title: "What is Dumper's Repo?",
  paragraphs: [
    "**Dumper's Repo** is a comprehensive toolkit for Star Citizen players who want to engage with the game's crafting and economy systems without getting ripped off.",
    "Whether you're tracking which blueprints you've unlocked, managing your mined resources, coordinating crafting orders with your org, or just trying to figure out what a fair price is for that pile of Quantanium you just refined — Dumper's Repo has you covered.",
    'The site is designed to be a one-stop shop for crafters, miners, and traders who want transparency and fairness in their in-game economic activities.',
  ],
}

export const OFFLINE_MODE_SECTION = {
  id: 'offline-mode',
  title: 'Offline Mode',
  intro:
    'Want to try out the tools before signing up? **Offline Mode** lets you explore most features without creating an account.',
  worksOffline: [
    'Browse all blueprints and archive data',
    'Mark blueprints as acquired (local only)',
    'Build your Mission Tracker list (local only)',
    'Track resources in Resource Tracker (local only)',
    'Use the Mining Tracker for RS references',
    'Preview The Bazaar — see how many WTB/WTS listings are open (sign in to trade)',
  ],
  membersOnly: [
    'My Listings — keep one WTB buy listing and one WTS sell listing (always item-by-item)',
    'The Bazaar — shop sell listings, fulfill buy listings, and complete trades',
    'BP Dumper + Live Mission Tracker — sync log unlocks and watch active missions',
    'Mining Ledgers — crew payout tracking (requires verified RSI Handle on your account)',
    'View member directory / browse collections',
    'Cross-device data sync',
  ],
  migration:
    'Offline progress is stored in your browser using the same IDs as member accounts. Old offline data from before a recent update is cleared automatically when you visit. On your **first sign-in** (when the welcome onboarding appears), valid offline data migrates to your account — unmatched or outdated items are skipped, not forced in. If you already have an account, your offline stash stays separate in the browser.',
  footnote:
    "Offline data is stored in your browser. It persists across sessions but won't sync between devices or browsers until you create an account.",
}

export const DFP_SECTION = {
  id: 'dfp',
  title: "Why Dumper's Fair-Value Price (DFP)?",
  problem: {
    title: 'The Problem',
    body: '"Grey market" trading sites are plagued with price gouging. People asking 5 billion aUEC for items that take maybe an hour to acquire yourself. It\'s predatory, it\'s frustrating, and CIG/RSI rightfully despises these practices.',
  },
  solution: {
    title: 'The Solution',
    intro:
      "**Dumper's Fair-Value Price (DFP)** is a pricing system that calculates what resources and crafted items are actually worth based on:",
    bullets: [
      'Time investment required to acquire/craft',
      'Resource rarity and availability',
      'Quality tier (500-1000 scale, with exponential value curves)',
      'Blueprint acquisition difficulty and reputation requirements',
    ],
  },
  goal: {
    title: 'The Goal',
    body: 'Create a pricing standard the community can rally behind. When everyone uses DFP, buyers know they\'re getting fair deals, sellers know they\'re being compensated fairly, and the exploitative grey market loses its power.',
  },
}

export const RATINGS_SECTION = {
  id: 'ratings',
  title: 'Buyer & Fulfiller Ratings',
  intro:
    'My Listings and The Bazaar use one **reputation rating system** for both **WTB** (want to buy) and **WTS** (want to sell) listings. There is no separate sell rating — the same 1–5 star archive flow and buyer/fulfiller scores apply to both tags.',
  wtbWts: {
    title: 'WTB vs WTS — who is the buyer?',
    items: [
      '**WTB** — you list items you want; fulfillers claim lines from your listing on The Bazaar. You are the **buyer**; they are the seller/fulfiller.',
      '**WTS** — you list stock for sale; buyers pick lines from your listing on The Bazaar. You are the **seller**; they are the buyer.',
      'Every purchase or fulfillment claim is a separate child transaction — same rating flow as any other deal.',
      'Ratings always land in the same two buckets: **buyer rep** and **fulfiller rep** (seller side), regardless of tag.',
    ],
  },
  asBuyer: {
    title: 'As a Buyer',
    items: [
      '**WTB:** post items on My Listings; after pickup confirm on **Active**, open **Completed** and click **Archive & rate**',
      '**WTS:** buy items on The Bazaar Store tab; confirm pickup on My Listings → **Active**, then **Archive & rate** on **Completed**',
      'Rate the other party 1–5 stars in the archive modal — this is required, not optional',
      'Your buyer rep helps sellers/fulfillers decide whether to trade with you',
    ],
  },
  asSeller: {
    title: 'As a Seller / Fulfiller',
    items: [
      '**WTB:** claim lines on The Bazaar Fulfillment tab, complete craft, then **Archive & rate** the buyer from **Rate completed orders** or My Listings → **Completed**',
      '**WTS:** mark ready on The Bazaar when the buyer can pick up; after they confirm pickup, **Archive & rate** from **The Bazaar → Rate completed orders** or My Listings → **Completed**',
      'Your fulfiller rep (seller side) is visible on listings and buy requests',
      'Higher ratings build trust for both craft fulfillment and direct sales',
    ],
  },
  note: 'Both buyers and fulfillers must have a verified RSI Handle to participate in the order system. This ensures accountability and helps prevent scams.',
}

export const ORDER_LIFECYCLE_SECTION = {
  id: 'order-lifecycle',
  title: 'How a WTB/WTS Deal Finishes',
  intro:
    'Every marketplace trade follows the same stages on **My Listings** and **The Bazaar**. The physical handoff happens in Star Citizen; the site tracks status, deadlines, and reputation.',
  steps: [
    {
      title: '1. Pick items to buy or fulfill',
      body: 'A **WTB** fulfiller claims lines on The Bazaar Fulfillment tab, or a buyer picks items from a **WTS** listing on the Store tab. Each selection becomes its own transaction, and both sides see the other party’s **in-game name** on the order card — add them in Star Citizen to coordinate.',
    },
    {
      title: '2. Seller prepares the order',
      body: 'WTB: fulfiller crafts and marks ready. WTS: seller marks ready for pickup. All seller actions appear **directly on the order card** on The Bazaar — status callouts explain what to do next.',
    },
    {
      title: '3. Buyer confirms pickup',
      body: 'After the seller marks ready, the buyer clicks **Confirm pickup** on **My Listings → Active**. The order moves to **Completed** — pickup is not the final step.',
    },
    {
      title: '4. Both archive & rate (required)',
      body: 'Each party must click the purple **Archive & rate** button to submit a 1–5 star rating. Buyers: **My Listings → Completed**. Sellers: **The Bazaar → Rate completed orders** or **My Listings → Completed**. Until both rate, new trades on The Bazaar stay paused.',
    },
  ],
  reminders: [
    'Header **Notifications** include clickable links (Confirm pickup, Archive & rate, Browse the Bazaar, etc.)',
    'If the other party rates first, you have **24 hours** to archive & rate or a 5-star rating is auto-applied on your behalf',
    'Use **Report Problem** on Active if goods were not received — do not wait for the 72-hour auto-complete',
  ],
}

export const PENDING_REP_SECTION = {
  id: 'pending-rep',
  title: 'Building Your Reputation',
  intro:
    'New members start with **"Pending" reputation** until they complete 5 successful marketplace transactions (as buyer or seller/fulfiller, on either WTB or WTS). During this time, limits apply by **role**, not by tag:',
  buyerLimits: {
    title: 'Pending Buyer Limits',
    items: [
      'Applies when you are the **buyer** — WTB transactions in progress and WTS purchases',
      'Maximum of 2 active buyer-side transactions at a time',
      'Total buyer-side value capped at 1,000,000 aUEC',
      'Your open WTB/WTS **listings** do not count — only transactions someone has started',
      'Limits lift after 5 completed transactions as a buyer',
    ],
  },
  sellerLimits: {
    title: 'Pending Seller / Fulfiller Limits',
    items: [
      'Applies when you are the **seller** — WTB fulfillment claims and active WTS sales (each child transaction counts)',
      'Can only have 1 active seller-side job at a time',
      'Complete or release it before starting another WTB or WTS handoff',
      'Limits lift after 5 completed transactions as a seller/fulfiller',
      'After that, others see your star rating plus average delivery time (ddd:HH:mm from accept to ready)',
    ],
  },
  important:
    'Everyone must **archive & rate** completed WTB and WTS transactions before starting new ones on The Bazaar. Until you do, those actions are paused — you can still browse listings and manage any trades already in progress. Open **My Listings → Completed** or **The Bazaar → Rate completed orders** and click the purple **Archive & rate** button on each finished deal.',
}

export const ORDER_RULES_SECTION = {
  id: 'order-rules',
  title: 'Order System Rules & Expectations',
  intro:
    'The order system is built on **trust and fairness**. To protect all members, we enforce the following rules — especially for users still building their reputation.',
  expected: {
    title: "What's Expected",
    items: [
      'List **WTB** items only when you genuinely want them crafted or supplied',
      'List **WTS** items only for stock you actually have on hand',
      'All listings are item-by-item — buyers and fulfillers pick exactly the lines they want',
      'Complete transactions in good faith on both My Listings and The Bazaar',
      'Archive & rate promptly after pickup — purple button on Completed / Rate completed orders',
      'Add the other party in-game using the name shown on each order card',
      'Communicate clearly with your buyer or seller',
      'Use your verified RSI Handle for all in-game trades',
    ],
  },
  notAllowed: {
    title: "What's Not Allowed",
    items: [
      'Making artificially small **WTB** claims or purchases to farm reputation quickly',
      'Repeatedly trading with the same person to inflate ratings (WTB or WTS)',
      'Using multiple accounts to manipulate the marketplace',
      'Abandoning accepted jobs without good reason',
      'Refusing to rate completed WTB or WTS transactions',
    ],
  },
  pendingRep: {
    title: 'Pending Rep Requirements',
    items: [
      '**Buyer limits:** Max 2 active buyer-side transactions / 1M aUEC (WTB fulfillments in progress + WTS purchases)',
      '**Seller limits:** Max 1 active seller-side job (WTB fulfillment or WTS sale in progress; each transaction counts)',
      'Open WTB/WTS **listings** do not count toward these caps — only started transactions do',
    ],
  },
  timeLimits: {
    title: 'Time Limits',
    items: [
      '**Seller deadline:** 72 hours to mark ready after a trade starts (WTB craft or WTS handoff), or the items return to the listing',
      '**Cancel/release:** Cancelling a transaction restores its items and quantities to the parent listing',
      '**Buyer pickup:** 72 hours to confirm after ready, or auto-complete (buyer may receive a strike)',
      '**Archive & rate:** Required after pickup — both parties must click **Archive & rate** on completed orders',
      '**Rating deadline:** 24 hours after the other party rates, or a 5-star rating is auto-applied on your behalf',
      '**3 strikes in 30 days** may lead to account restrictions',
    ],
  },
  consequences: {
    title: 'Consequences for Violations',
    items: [
      '**Reputation reset:** All ratings cleared, returning you to "Pending" status with limits',
      '**Order history cleared:** Archived orders may be removed along with your reputation',
      '**Account ban:** Severe or repeated violations may result in permanent removal from the platform',
    ],
    note: 'Repeated or serious violations may result in account review and disciplinary action by site staff.',
  },
}

export const ORDERING_TIPS_SECTION = {
  id: 'ordering-tips',
  title: 'Best Ordering Practices',
  intros: [
    'These tips focus on **WTB** buy listings (Add to my WTB listing). See the My Listings page guide for the item builder and line management.',
    'For **WTS** sell listings: list only stock you have on hand — every listing is item-by-item, so buyers cherry-pick lines and quantities. Mark ready promptly once a buyer picks items.',
    'For WTB listings, follow these tips to get fulfilled faster and make it easier for sellers to help you.',
  ],
  tips: [
    {
      title: 'Use Live Stat Preview',
      body: 'Expand cart lines in the order builder to set per-slot material qualities. The live DFP total and effective stat preview update as you go — match what you actually have or expect to craft with.',
      variant: 'emerald' as const,
    },
    {
      title: 'Fulfillers Pick Line by Line',
      body: 'Fulfillers only need the blueprints for the **lines they claim** — your easy Q500–Q700 items can get crafted right away even if harder Q800+ lines wait for a specialist. Mixing them on one listing no longer blocks anything.',
      variant: 'emerald' as const,
    },
    {
      title: 'Check Blueprint Ownership',
      body: 'Each blueprint card shows how many members own it. If **no one owns a blueprint**, that line may sit unfulfilled until someone acquires it — the rest of your listing stays claimable. You\'ll see a warning when posting such lines.',
      variant: 'emerald' as const,
    },
  ],
  closingTip:
    'Keep your listing tidy — remove lines you no longer need and keep quantities realistic. Fulfillers can quickly see what they can help with and jump in immediately.',
}

export const TRADE_PROTECTION_SECTION = {
  id: 'trade-protection',
  title: 'Protecting Yourself in Trades',
  intro:
    'In-game trades happen outside the site. Keep your own records so disputes can be resolved fairly.',
  items: [
    'Screenshot aUEC transfers before and after handoff',
    'Record video of the exchange when possible',
    "Note the other party's RSI Handle, location, and time",
    'Keep Spectrum or in-game chat logs',
    'If a fulfiller marked ready but you didn\'t receive goods, use **Report Problem** on the order — do not wait for the 72-hour auto-complete',
  ],
  evidenceNote:
    'Evidence is **not uploaded on the site**. If support needs proof during a dispute, they may ask you to email screenshots or share a cloud storage link (Google Drive, Imgur, etc.).',
}

export const EXTERNAL_RESOURCES = [
  { title: 'Star Citizen Wiki', description: 'Community wiki with comprehensive game information' },
  { title: 'Erkul Games', description: 'DPS calculator and ship loadout planner' },
  { title: 'Universal Item Finder', description: 'Search for in-game items and their locations' },
  { title: 'Cornerstone', description: 'Trading and economy tracker' },
  { title: 'Star Citizen Trade Tools', description: 'Mining and trading calculators' },
  { title: 'RSI Website', description: 'Official Star Citizen website' },
]

export const ARCHIVE_TIPS = [
  {
    title: 'Blueprint Rewards',
    content:
      "Blueprints are awarded from contracts at specific reputation levels. Use Mission Tracker to plan targets and browse missions; BP Dumper + Live Tracker on that page sync unlocks and show what is still dropping from active contracts.",
  },
  {
    title: 'Mining workflow',
    content:
      'On Mining Tracker: look up an ore in RS Tracker or the Mining Guide, click a card to seed the Rock Calculator, enter scanner stats manually, then open Smart Cracker for breakability and gadget advice. RSI-verified members can push yields into Ledgers for crew splits.',
  },
  {
    title: 'Resource Tracking',
    content:
      "Use the Resource Tracker to keep inventory of your mined and refined materials. Dumper's Fair-Value Price (DFP) calculates fair market values based on quality tiers.",
  },
  {
    title: 'Quality Tiers',
    content:
      'Resource quality ranges from 500 (base) to 1000 (perfect). Higher quality resources have exponentially higher DFP values, especially at Q850 and above.',
  },
  {
    title: 'Standing Progression',
    content:
      'All factions use the same standing ladder from Neutral to Elite Contractor. Higher standings unlock better-paying contracts and exclusive blueprint rewards.',
  },
]

export const DATA_SOURCES = [
  {
    title: 'Game catalog data',
    content:
      'Blueprints, components, ordnance, mining spawns, factions, Archive lore, and RS signature references are kept in sync with Star Citizen game data when the site is updated.',
  },
  {
    title: 'DFP pricing',
    content:
      "Dumper's Fair-Value Price (DFP) is a proprietary pricing engine loaded from the official franchise bundle. The site does not pull live prices from third-party market APIs.",
  },
  {
    title: 'Not included here',
    content:
      "Live in-game shop inventories are not part of Dumper's Repo. For item locations and market lookup, use the external tools listed in the General Archive section.",
  },
]

export const ORGANIZATIONS = [
  {
    title: 'RSI Organization Hub',
    description: 'Browse all Star Citizen organizations on the official RSI site',
  },
  {
    title: 'Black Star [BSTR]',
    badge: 'Site Sponsor',
    description: 'Industrial and defense enterprise focused on extraction, production, and trade',
  },
]

export const ARCHIVE_DISCLAIMER =
  'This site is not affiliated with Cloud Imperium Games or Roberts Space Industries. All game content and materials are trademarks and copyrights of their respective owners.'

/** Table of contents for the printable guide (anchor ids + labels). */
export const PRINTABLE_TOC = [
  { id: 'about', label: "What is Dumper's Repo?" },
  { id: 'offline-mode', label: 'Offline Mode' },
  { id: 'dfp', label: "Why Dumper's Fair-Value Price (DFP)?" },
  { id: 'order-lifecycle', label: 'How a Deal Finishes' },
  { id: 'ratings', label: 'Buyer & Fulfiller Ratings' },
  { id: 'pending-rep', label: 'Building Your Reputation' },
  { id: 'order-rules', label: 'Order System Rules' },
  { id: 'ordering-tips', label: 'Best Ordering Practices' },
  { id: 'trade-protection', label: 'Protecting Yourself in Trades' },
  { id: 'page-guides', label: 'Page-by-Page Guide' },
  { id: 'archive-tips', label: 'Quick Tips' },
  { id: 'data-sources', label: 'Data Sources' },
  { id: 'external-resources', label: 'External Resources' },
]
