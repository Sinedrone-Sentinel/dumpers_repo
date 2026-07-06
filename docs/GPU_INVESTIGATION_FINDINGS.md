# GPU Investigation Findings

Static code audit + expected DevTools signals (Chrome Performance monitor, Rendering → Layer borders / Paint flashing). Use this as the baseline before/after checklist when re-profiling locally.

## Profiling matrix (expected signals)

| Page | Idle GPU elevated? | Scroll GPU spike? | Primary driver |
|------|-------------------|-------------------|----------------|
| Blueprints (filters selected) | **Yes** — infinite ember on multiple `.site-filter-selected-*` chips | **Yes** — hundreds of cards + fixed header blur recompositing | Ember `box-shadow` animation + header `backdrop-blur-xl` + full grid paint |
| Mining Tracker → Guide | Moderate — rarity filter may use `.site-btn-burn` | **Yes** — many `SiteTooltip` scroll reposition updates | Tooltip scroll handler + optional ember on filter |
| Archive → Resource Lore (Open All) | Low | **Yes** — 5000+ DOM nodes | Paint volume (no idle animation) |
| Blueprint detail modal | Transient spike on open/close | N/A | Framer 3D flip + animated `filter: blur()` on wormhole close |
| Analytics (control) | Low | Low | Static CSS bars, fewer filters |

## Ranked culprits (fix priority)

1. **Fixed header `backdrop-blur-xl`** — [`src/index.css`](../src/index.css) `.site-app-header` via [`AppChrome.tsx`](../src/components/layout/AppChrome.tsx). Recomposites on every scroll frame sitewide.
2. **Infinite ember animations** — [`src/index.css`](../src/index.css) `@keyframes site-btn-burn-glow` animating `box-shadow` on every selected filter chip. Runs 24/7 on Blueprints/Analytics/Mining when filters are active.
3. **Blueprint grid DOM + paint** — [`Blueprints.index.tsx`](../src/routes/Blueprints.index.tsx) renders full grid; [`BlueprintCard.jsx`](../src/components/BlueprintCard.jsx) uses `transition-all` and `.blueprint-paper-panel` multi-layer backgrounds.
4. **Modal/tooltip blur layers** — [`AppModal.tsx`](../src/components/layout/AppModal.tsx), [`SiteTooltip.tsx`](../src/components/SiteTooltip.tsx), header controls.
5. **BrandReveal close animation** — [`BrandRevealModalShell.tsx`](../src/components/layout/BrandRevealModalShell.tsx) animated CSS `filter: blur()`.

## Fixes applied (this PR)

- Header: faux-glass solid background (no live blur sampling)
- Ember: static outer glow; animate only `opacity` + `transform` on `::before`
- Modals/tooltips/header: remove `backdrop-blur`; solid overlays
- `SiteTooltip`: rAF-throttled scroll/resize positioning
- `BrandRevealModalShell`: remove animated blur on wormhole close
- Lore entries: `content-visibility: auto` for off-screen paint skipping (avoids mounting 5000+ nodes in paint path)
- Blueprint grid: window row virtualization via `@tanstack/react-virtual` ([`VirtualizedBlueprintGrid.tsx`](../src/components/VirtualizedBlueprintGrid.tsx))
- `BlueprintCard`: `transition-colors transition-shadow` instead of `transition-all`

## Re-profile checklist

Run locally in Chrome DevTools (Performance monitor + Rendering → Layer borders):

1. Open Blueprints with several filters selected; idle 30s — GPU should drop vs baseline (no animated box-shadow; no header blur).
2. Scroll blueprint grid — only visible rows mount; target ~60fps in Performance recording.
3. Mining Guide scroll with tooltip open — scroll handler batched via rAF.
4. Visual: selected filter ember glow (pulsing gradient overlay) and header still read as orange glass brand.

**Build verification:** `npm run lint` and `npm run build` pass after these changes.
