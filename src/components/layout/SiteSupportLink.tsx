import { SITE_SUPPORT_LABEL, SITE_SUPPORT_URL } from '../../config/site'

/** Quiet footer link to an optional tip page. Hidden when SITE_SUPPORT_URL is empty. */
export default function SiteSupportLink({ className = '' }: { className?: string }) {
  const url = SITE_SUPPORT_URL.trim()
  if (!url) return null

  return (
    <p className={className}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-slate-500 underline-offset-2 transition hover:text-slate-300 hover:underline"
      >
        {SITE_SUPPORT_LABEL}
      </a>
    </p>
  )
}
