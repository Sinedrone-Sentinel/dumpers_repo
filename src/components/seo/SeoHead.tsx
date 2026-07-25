import { useEffect } from 'react'
import { useRouterState } from '@tanstack/react-router'
import {
  SEO_GOOGLE_SITE_VERIFICATION,
  absoluteUrl,
  getSeoForPath,
  resolveOgImage,
} from '../../config/seo'

function upsertMeta(selector: string, attrs: Record<string, string>) {
  let el = document.head.querySelector(selector) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    document.head.appendChild(el)
  }
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value)
  }
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/** Keeps document title + social meta in sync with the active route. */
export default function SeoHead() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  useEffect(() => {
    const seo = getSeoForPath(pathname)
    const canonical = absoluteUrl(seo.canonicalPath)
    const ogImage = resolveOgImage(seo)

    document.title = seo.title

    upsertMeta('meta[name="description"]', { name: 'description', content: seo.description })
    upsertLink('canonical', canonical)

    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' })
    upsertMeta('meta[property="og:locale"]', { property: 'og:locale', content: 'en_US' })
    upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: "Dumper's Repo" })
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonical })
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: seo.title })
    upsertMeta('meta[property="og:description"]', {
      property: 'og:description',
      content: seo.description,
    })
    upsertMeta('meta[property="og:image"]', { property: 'og:image', content: ogImage })
    upsertMeta('meta[property="og:image:secure_url"]', {
      property: 'og:image:secure_url',
      content: ogImage,
    })
    upsertMeta('meta[property="og:image:alt"]', { property: 'og:image:alt', content: seo.title })

    upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' })
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: seo.title })
    upsertMeta('meta[name="twitter:description"]', {
      name: 'twitter:description',
      content: seo.description,
    })
    upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: ogImage })

    if (SEO_GOOGLE_SITE_VERIFICATION) {
      upsertMeta('meta[name="google-site-verification"]', {
        name: 'google-site-verification',
        content: SEO_GOOGLE_SITE_VERIFICATION,
      })
    }
  }, [pathname])

  return null
}
