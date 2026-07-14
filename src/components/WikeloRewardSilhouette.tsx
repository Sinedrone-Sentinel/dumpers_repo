import type { WikeloTrade } from '../routes/wikelo'

/** Silhouette keyed to what you actually receive — not the page filter tag. */
export type WikeloSilhouetteKind =
  | 'fighter'
  | 'ground'
  | 'armor'
  | 'flightsuit'
  | 'backpack'
  | 'pistol'
  | 'rifle'
  | 'shotgun'
  | 'lmg'
  | 'sniper'
  | 'launcher'
  | 'favor'
  | 'handshake'
  | 'food'
  | 'rep'

const ARMOR_RE = /helmet|core|arms|legs|armor|armour|suit(?!\s*case)/i
const WEAPON_RE = {
  launcher: /launcher|rocket|cannon|boomtube/i,
  shotgun: /shotgun|prism/i,
  sniper: /sniper|zenith/i,
  lmg: /\blmg\b|fresnel/i,
  rifle: /rifle|parallax|killshot/i,
  pistol: /pistol|tripledown|magazine|battery/i,
}

function classifyItemReward(entityClass: string, name: string): WikeloSilhouetteKind {
  const text = `${entityClass} ${name}`
  if (/favor|scrip|polaris|_bit\b/i.test(text)) return 'favor'
  if (/smoothie|drink|food|icecream|vestal/i.test(text)) return 'food'
  if (/flightsuit|flight\s*suit|flight\s*helmet/i.test(text)) return 'flightsuit'
  if (/backpack/i.test(text)) return 'backpack'
  if (ARMOR_RE.test(text)) return 'armor'
  if (WEAPON_RE.launcher.test(text)) return 'launcher'
  if (WEAPON_RE.shotgun.test(text)) return 'shotgun'
  if (WEAPON_RE.sniper.test(text)) return 'sniper'
  if (WEAPON_RE.lmg.test(text)) return 'lmg'
  if (WEAPON_RE.rifle.test(text)) return 'rifle'
  if (WEAPON_RE.pistol.test(text)) return 'pistol'
  return 'backpack'
}

function isGroundVehicle(entityClass: string): boolean {
  return /ursa|atls|nox|pulse|cyclone|ground|rover|tank|greycat|ballista|vanguard.*land/i.test(
    entityClass
  )
}

/** Pick the silhouette that best matches this trade's rewards. */
export function resolveWikeloRewardSilhouette(trade: WikeloTrade): WikeloSilhouetteKind {
  const vehicles = trade.rewards.filter((r) => r.kind === 'vehicle')
  if (vehicles.length > 0) {
    return isGroundVehicle(vehicles[0].entityClass) ? 'ground' : 'fighter'
  }

  const items = trade.rewards.filter((r) => r.kind === 'item')
  if (items.length > 0) {
    return classifyItemReward(items[0].entityClass, items[0].name)
  }

  if (trade.category === 'intro' || trade.requiresIntro) return 'handshake'
  if (trade.category === 'food') return 'food'
  if (trade.category === 'favor') return 'favor'
  return 'rep'
}

/** True when the trade awards a crafting blueprint — keep blueprint paper. */
export function wikeloTradeUsesBlueprintPaper(trade: WikeloTrade): boolean {
  return trade.blueprintPools.length > 0
}

const SILHOUETTE_PATHS: Record<WikeloSilhouetteKind, string> = {
  // Heavy gunship — twin engine pods, chunky body, nose pointing right
  fighter:
    'M94 50 L82 44 L70 44 L66 40 L50 40 L46 44 L32 44 L32 38 L28 34 L18 34 L14 38 L14 46 L28 46 L28 54 L14 54 L14 62 L18 66 L28 66 L32 62 L32 56 L46 56 L50 60 L66 60 L70 56 L82 56 Z',
  ground:
    'M14 58 L22 44 L38 38 L64 38 L78 46 L90 52 L90 68 L84 68 A11 11 0 0 0 62 68 L38 68 A11 11 0 0 0 16 68 L10 68 L10 62 Z M30 48 L24 52 L22 56 L36 56 Z M46 48 L46 56 L62 56 L58 48 Z M26 70 A8 8 0 1 1 26 70.01 Z M74 70 A8 8 0 1 1 74 70.01 Z',
  armor:
    'M50 12 C30 12 22 28 22 44 L22 72 L34 86 L66 86 L78 72 L78 44 C78 28 70 12 50 12 Z M32 44 C32 38 36 36 40 36 L60 36 C64 36 68 38 68 44 L68 52 C68 56 64 58 60 58 L40 58 C36 58 32 56 32 52 Z',
  flightsuit:
    'M38 18 L62 18 L66 28 L72 32 L78 44 L78 80 L22 80 L22 44 L28 32 L34 28 Z M42 36 L58 36 L58 52 L42 52 Z M36 56 L64 56 L62 72 L38 72 Z',
  backpack:
    'M36 18 C36 10 64 10 64 18 L64 24 L70 26 C78 30 82 38 82 46 L82 80 C82 86 78 90 72 90 L28 90 C22 90 18 86 18 80 L18 46 C18 38 22 30 30 26 L36 24 Z M42 18 L42 22 L58 22 L58 18 C58 15 42 15 42 18 Z M28 56 L72 56 L72 66 L28 66 Z',
  pistol:
    'M14 34 L86 34 L86 46 L80 46 L78 54 L54 54 L46 82 L28 82 L36 54 L20 54 L14 46 Z',
  rifle:
    'M8 40 L72 40 L72 48 L68 48 L66 56 L48 56 L44 72 L36 72 L40 56 L24 56 L20 64 L12 64 L8 56 Z M76 38 L92 38 L92 44 L76 44 Z',
  shotgun:
    'M10 38 L78 38 L78 50 L70 50 L68 58 L52 58 L48 74 L32 74 L36 58 L22 58 L18 66 L10 66 Z M80 36 L94 40 L94 46 L80 44 Z',
  lmg:
    'M6 42 L68 42 L68 50 L64 50 L62 58 L40 58 L36 74 L24 74 L28 58 L14 58 L10 66 L6 66 Z M70 40 L92 44 L92 50 L70 48 Z M74 52 L88 54 L88 58 L74 56 Z',
  sniper:
    'M6 44 L80 44 L80 48 L76 48 L74 52 L50 52 L46 68 L34 68 L38 52 L16 52 L12 60 L6 60 Z M82 42 L96 42 L96 46 L82 46 Z',
  launcher:
    'M12 30 L88 30 L88 54 L72 54 L68 78 L48 78 L52 54 L28 54 L24 70 L16 70 L20 54 L12 54 Z',
  favor:
    'M50 8 L62 22 L58 30 L66 36 L66 58 L74 70 L74 84 L26 84 L26 70 L34 58 L34 36 L42 30 L38 22 Z M46 38 L54 38 L58 46 L54 54 L46 54 L42 46 Z',
  handshake:
    'M10 40 L28 32 L44 40 L56 34 L74 32 L92 40 L92 48 L78 44 L62 62 C58 66 52 66 48 62 L46 60 L40 66 C36 70 30 70 27 66 L14 50 L10 48 Z',
  food:
    'M32 28 L68 28 L64 88 C64 91 60 92 56 92 L44 92 C40 92 36 91 36 88 Z M40 40 L60 40 L57 80 L43 80 Z M54 28 L62 10 L68 10 L58 28 Z',
  rep:
    'M50 14 L58 32 L76 36 L64 50 L66 68 L50 60 L34 68 L36 50 L24 36 L42 32 Z',
}

/** Image-based silhouettes (better quality than hand-coded SVG paths) */
const SILHOUETTE_IMAGES: Partial<Record<WikeloSilhouetteKind, string>> = {
  fighter: '/silhouettes/fighter.png',
  ground: '/silhouettes/ground.png',
  armor: '/silhouettes/armor.png',
  flightsuit: '/silhouettes/flightsuit.png',
  backpack: '/silhouettes/backpack.png',
  pistol: '/silhouettes/pistol.png',
  rifle: '/silhouettes/rifle.png',
  shotgun: '/silhouettes/shotgun.png',
  sniper: '/silhouettes/sniper.png',
  lmg: '/silhouettes/lmg.png',
  launcher: '/silhouettes/launcher.png',
  favor: '/silhouettes/favor.png',
  handshake: '/silhouettes/handshake.png',
  food: '/silhouettes/food.png',
  rep: '/silhouettes/rep.png',
}

interface WikeloRewardSilhouetteProps {
  kind: WikeloSilhouetteKind
  className?: string
}

export default function WikeloRewardSilhouette({ kind, className = '' }: WikeloRewardSilhouetteProps) {
  const imageSrc = SILHOUETTE_IMAGES[kind]

  return (
    <div
      className={`pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden ${className}`}
      aria-hidden
    >
      {imageSrc ? (
        <img
          src={imageSrc}
          alt=""
          className="w-[72%] max-h-[110px] h-[72%] object-contain opacity-[0.18]"
        />
      ) : (
        <svg
          viewBox="0 0 100 100"
          className="w-[72%] max-h-[110px] h-[72%] fill-slate-400/[0.18]"
          preserveAspectRatio="xMidYMid meet"
        >
          <path d={SILHOUETTE_PATHS[kind]} />
        </svg>
      )}
    </div>
  )
}
