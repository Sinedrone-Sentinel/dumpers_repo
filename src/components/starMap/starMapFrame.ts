import { isDedicatedStarMapWindow } from '../../lib/starMapHighlight'

/** The named View Map tab fills the window. The in-site map keeps the page column. */
export function starMapStageClass(): string {
  return isDedicatedStarMapWindow()
    ? 'relative z-10 h-screen w-screen overflow-hidden'
    : 'site-shell relative z-10 py-6 min-w-0 w-full overflow-x-hidden'
}

export function starMapCanvasClass(): string {
  return isDedicatedStarMapWindow()
    ? 'relative h-full w-full overflow-hidden'
    : 'site-surface relative h-[calc(100vh-8rem)] min-h-[480px] overflow-hidden'
}
