import React from 'react'
import { RSI_PLUS_CHROME_STORE_URL, RSI_PLUS_DISPLAY_NAME } from '../../config/dumperApps'
import AppDownloadCard from './AppDownloadCard'

export default function RsiPlusPanel() {
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-white">What it is</h3>
        <p className="text-sm text-slate-400 leading-relaxed">
          <strong className="text-slate-300">{RSI_PLUS_DISPLAY_NAME}</strong> is Zedwil&apos;s Chrome
          extension for robertsspaceindustries.com — Spectrum read tracking, mutes and watches, hangar
          and buyback explorer, store prices, wishlist alerts, and a CCU planner. It runs in your
          browser with the RSI session you already use.
        </p>
        <p className="text-xs text-slate-500 leading-relaxed">
          Install from the Chrome Web Store. Listing is static (not polled from GitHub).
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-white">Install</h3>
        <div className="space-y-2">
          <AppDownloadCard
            href={RSI_PLUS_CHROME_STORE_URL}
            label="Chrome Web Store — RSI+"
            description="Add RSI+ to Chrome or Chromium-based Edge. Requires a Chromium browser."
            recommended
          />
        </div>
      </section>
    </div>
  )
}
