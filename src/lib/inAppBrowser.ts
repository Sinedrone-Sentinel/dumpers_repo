import { useEffect, useState } from 'react'

/** Facebook, Instagram, Discord, and similar app browsers (user-agent). */
const IN_APP_UA = [
  'FBAN',
  'FBAV',
  'FB_IAB',
  'FBIOS',
  'FB4A',
  'Instagram',
  'Messenger',
  'Line/',
  'Twitter',
  'TwitterAndroid',
  'Discord',
  'TikTok',
  'musical_ly',
  'BytedanceWebview',
  'ByteLocale',
  'Snapchat',
  'LinkedInApp',
  'MicroMessenger',
  'Pinterest',
  'Reddit',
  'WhatsApp',
] as const

export type InAppBrowserInfo = {
  inApp: boolean
  ios: boolean
  android: boolean
}

export const IN_APP_BROWSER_MESSAGE =
  'This page is open inside another app. Google and Discord sign-in will not finish here. Open this site in Safari (iPhone) or Chrome (Android), then sign in.'

export const IN_APP_BROWSER_HINT =
  'If the page does not switch, tap the Safari or compass icon in the top bar.'

export function detectInAppBrowser(userAgent: string): InAppBrowserInfo {
  const ua = userAgent || ''
  const ios = /iPhone|iPad|iPod/i.test(ua)
  const android = /Android/i.test(ua)
  const inApp = IN_APP_UA.some((token) => ua.includes(token))
  return { inApp, ios, android }
}

export function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  return detectInAppBrowser(navigator.userAgent).inApp
}

/** False on first render (prerender / hydration), then true in Facebook etc. */
export function useInAppBrowser(): boolean {
  const [detected, setDetected] = useState(false)
  useEffect(() => {
    setDetected(detectInAppBrowser(navigator.userAgent).inApp)
  }, [])
  return detected
}

export function systemBrowserButtonLabel(userAgent?: string): string {
  const ua = userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '')
  if (/Android/i.test(ua)) return 'Open in Chrome'
  return 'Open in Safari'
}

export function buildSystemBrowserUrl(pageUrl: string, userAgent: string): string {
  let parsed: URL
  try {
    parsed = new URL(pageUrl)
  } catch {
    return pageUrl
  }
  const href = parsed.href
  const { ios, android } = detectInAppBrowser(userAgent)

  if (ios) {
    if (/^https:\/\//i.test(href)) return href.replace(/^https:\/\//i, 'x-safari-https://')
    if (/^http:\/\//i.test(href)) return href.replace(/^http:\/\//i, 'x-safari-http://')
  }

  if (android) {
    const rest = href.replace(/^https?:\/\//i, '')
    const scheme = parsed.protocol === 'http:' ? 'http' : 'https'
    return `intent://${rest}#Intent;scheme=${scheme};action=android.intent.action.VIEW;end`
  }

  return href
}

export function openSiteInSystemBrowser(
  pageUrl: string = typeof window !== 'undefined' ? window.location.href : '',
): void {
  if (typeof window === 'undefined') return
  const target = buildSystemBrowserUrl(pageUrl, navigator.userAgent)
  try {
    window.location.assign(target)
  } catch {
    window.location.href = pageUrl
  }
}
