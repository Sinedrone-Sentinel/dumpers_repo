import { Link } from '@tanstack/react-router'
import SiteTooltip from './SiteTooltip'
import { useAuth } from '../contexts/AuthContext'
import { DISCORD_COLLECTIONS } from '../lib/discordCollections'

export default function WebhookCue({ collectionId }: { collectionId: string }) {
  const { user, profile, loading } = useAuth()
  const collection = DISCORD_COLLECTIONS.find((item) => item.id === collectionId)
  if (!collection || loading || !user) return null
  if (collection.requiresVerified && !profile?.rsi_handle_verified) return null

  return (
    <SiteTooltip side="top" content={`Discord can ping you about ${collection.title}.`}>
      <Link
        to="/discord-subscribe"
        search={{ focus: collectionId }}
        className="site-btn-icon inline-flex h-7 w-7 items-center justify-center"
        aria-label={`Discord alerts for ${collection.title}`}
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.1.1 0 0 0-.1.05c-.18.33-.39.76-.53 1.09a16.1 16.1 0 0 0-4.74 0c-.14-.34-.36-.76-.54-1.09a.1.1 0 0 0-.1-.05c-1.5.26-2.93.71-4.27 1.33a.09.09 0 0 0-.04.03C2.44 9.05 1.7 12.66 2.07 16.23c0 .03.02.06.05.07 1.8 1.32 3.53 2.12 5.24 2.65a.1.1 0 0 0 .11-.04c.4-.55.76-1.13 1.07-1.74a.1.1 0 0 0-.05-.14 10.6 10.6 0 0 1-1.52-.72.1.1 0 0 1-.01-.17c.1-.08.2-.16.3-.24a.1.1 0 0 1 .1-.01c3.2 1.46 6.66 1.46 9.82 0a.1.1 0 0 1 .11.01c.1.09.2.17.3.25a.1.1 0 0 1 0 .16c-.48.28-1 .53-1.53.72a.1.1 0 0 0-.05.14c.32.61.68 1.19 1.08 1.74a.1.1 0 0 0 .11.04c1.72-.53 3.45-1.33 5.25-2.65a.1.1 0 0 0 .04-.07c.44-4.16-.74-7.74-3.1-10.87a.07.07 0 0 0-.04-.03zM8.52 14.3c-.96 0-1.75-.88-1.75-1.96s.77-1.96 1.75-1.96 1.76.88 1.75 1.96c0 1.08-.77 1.96-1.75 1.96zm6.96 0c-.96 0-1.75-.88-1.75-1.96s.77-1.96 1.75-1.96 1.76.88 1.75 1.96c0 1.08-.78 1.96-1.75 1.96z" />
        </svg>
      </Link>
    </SiteTooltip>
  )
}
