import { SITE_SUPPORT_LABEL, SITE_SUPPORT_URL } from '../../config/site'

/** Quiet footer link to an optional tip page. Hidden when SITE_SUPPORT_URL is empty. */
export default function SiteSupportLink({ className = '' }: { className?: string }) {
  const url = SITE_SUPPORT_URL.trim()
  if (!url) return null

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-amber-400 underline-offset-2 transition hover:text-amber-300 hover:underline ${className}`}
    >
      {SITE_SUPPORT_LABEL}
    </a>
  )
}
