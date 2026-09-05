/** Shared FAQ copy for the marketing landing + FAQPage JSON-LD. */

export type SeoFaq = {
  q: string
  a: string
}

export const SEO_LANDING_FAQS: SeoFaq[] = [
  {
    q: 'Do I need an account to use Star Citizen tools here?',
    a: 'No. Choose Browse tools offline to explore the blueprint tracker, missions, mining, resources, Wikelo barter trades, and the archive in this browser. Sign in when you want cloud sync, the community marketplace, and BP Dumper.',
  },
  {
    q: 'Why did Discord or Google sign-in fail on my phone?',
    a: 'If you opened this site from Facebook, Instagram, Discord, or another app, sign-in cannot finish there. Open dumpers-repo.com in Safari on iPhone (or Chrome on Android), then tap Sign in. On iPhone, Discord may bounce you through the Discord app and back — the site should finish sign-in on that return without another tap. Refresh will not finish it. The page icon next to the address is Safari Reader (that is what “Reader Unavailable” means), not Refresh. Offline Mode still works from the other app.',
  },
  {
    q: 'Is there a free Star Citizen blueprint tracker?',
    a: "Yes. Dumper's Repo includes a crafting blueprint database and tracker — browse recipes, mark acquisitions, and see which reputation missions reward each blueprint. Start from the public /blueprints catalog or open Blueprints in Offline Mode.",
  },
  {
    q: 'Where can I look up Wikelo favors, reputation, and barter trades?',
    a: 'Use the Wikelo tool for every Wikelo Emporium barter trade — hand-ins, rewards, customer rank, favors, and reputation context. Filter by ships, armor, weapons, gear, and favors.',
  },
  {
    q: 'How do crafting blueprints unlock in Star Citizen?',
    a: 'Many blueprints drop from reputation missions, faction progression, or related activities. Use Mission Tracker (blueprint mission tracker) and blueprint detail views to see which contracts reward each recipe.',
  },
  {
    q: "What is Dumper's Fair-Value Price (DFP)?",
    a: "DFP is a proprietary fair-value estimate for crafted gear and materials so members can price WTB/WTS listings consistently. It is shown on blueprint and resource tools when enabled on this site.",
  },
  {
    q: 'What is BP Dumper?',
    a: 'BP Dumper is a desktop Game.log watcher that syncs newly acquired blueprints to your account and powers the Live Mission Tracker while you play.',
  },
  {
    q: 'Who is this site for?',
    a: "Anyone can browse the tools in Offline Mode. Signed-in members get sync, BP Dumper, and the community marketplace on this deployment.",
  },
]
