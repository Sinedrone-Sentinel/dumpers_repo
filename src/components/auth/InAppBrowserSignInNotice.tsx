import React from 'react'
import {
  IN_APP_BROWSER_HINT,
  IN_APP_BROWSER_MESSAGE,
  openSiteInSystemBrowser,
  systemBrowserButtonLabel,
} from '../../lib/inAppBrowser'

export default function InAppBrowserSignInNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'space-y-2 px-3 py-2' : 'mb-4 space-y-3'}>
      <div className="site-banner-warn" role="status">
        <p>{IN_APP_BROWSER_MESSAGE}</p>
        <p className="site-hint mt-1.5">{IN_APP_BROWSER_HINT}</p>
      </div>
      <button
        type="button"
        className={compact ? 'site-btn-primary w-full !text-xs !py-2' : 'site-btn-primary w-full'}
        onClick={() => openSiteInSystemBrowser()}
      >
        {systemBrowserButtonLabel()}
      </button>
    </div>
  )
}
