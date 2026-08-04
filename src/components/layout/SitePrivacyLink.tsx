import { SITE_PRIVACY_LABEL, SITE_PRIVACY_PATH } from '../../config/site'

/** Quiet footer / legal link to the public Privacy Policy (opens in a new tab). */
export default function SitePrivacyLink({ className = '' }: { className?: string }) {
  return (
    <a
      href={SITE_PRIVACY_PATH}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-sky-400 underline-offset-2 transition hover:text-sky-300 hover:underline ${className}`}
    >
      {SITE_PRIVACY_LABEL}
    </a>
  )
}
