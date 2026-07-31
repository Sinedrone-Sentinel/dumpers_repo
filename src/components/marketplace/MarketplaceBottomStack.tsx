import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useMarketplaceAdController } from '../../hooks/useMarketplaceAdController'
import { useMarketplacePurchaseFeed } from '../../hooks/useMarketplacePurchaseFeed'
import MarketplaceAdSlider from './MarketplaceAdSlider'
import MarketplacePurchaseToast from './MarketplacePurchaseToast'

const AD_GAP = 8

interface StackContextValue {
  setAdHeight: (height: number) => void
  setAdVisible: (visible: boolean) => void
  setAdClosing: (closing: boolean) => void
}

const StackContext = createContext<StackContextValue | null>(null)

interface MarketplaceBottomStackProps {
  onOpenSettings: () => void
}

export default function MarketplaceBottomStack({ onOpenSettings }: MarketplaceBottomStackProps) {
  const {
    marketplaceWtsAdsSiteEnabled,
    marketplaceWtbAdsSiteEnabled,
    marketplacePurchaseToastsSiteEnabled,
    marketplaceWtsAdsEnabled,
    marketplaceWtbAdsEnabled,
    marketplacePurchaseToastsEnabled,
  } = useAuth()

  const adsEnabled =
    (marketplaceWtsAdsSiteEnabled && marketplaceWtsAdsEnabled) ||
    (marketplaceWtbAdsSiteEnabled && marketplaceWtbAdsEnabled)

  const purchaseEnabled =
    marketplacePurchaseToastsSiteEnabled && marketplacePurchaseToastsEnabled

  const ad = useMarketplaceAdController({ enabled: adsEnabled, onOpenSettings })
  const purchase = useMarketplacePurchaseFeed(purchaseEnabled)

  const [adHeight, setAdHeight] = useState(0)
  const [adVisible, setAdVisible] = useState(false)
  const [adClosing, setAdClosing] = useState(false)

  const stackValue = useMemo(
    () => ({
      setAdHeight,
      setAdVisible,
      setAdClosing,
    }),
    []
  )

  const handleAdHeight = useCallback((h: number) => setAdHeight(h), [])

  React.useEffect(() => {
    setAdVisible(ad.visible)
    setAdClosing(ad.closing)
  }, [ad.visible, ad.closing])

  // Extra offset above the fixed ticker (ticker height is CSS var --site-ticker-height)
  const purchaseExtraBottom =
    adVisible && !adClosing ? adHeight + AD_GAP : 0

  if (!adsEnabled && !purchaseEnabled) return null

  return (
    <StackContext.Provider value={stackValue}>
      {adsEnabled && ad.candidate && (ad.visible || ad.closing) ? (
        <MarketplaceAdSlider
          candidate={ad.candidate}
          visible={ad.visible}
          closing={ad.closing}
          onClose={ad.onClose}
          onNotInterested={ad.onNotInterested}
          onDontShowAgain={ad.onDontShowAgain}
          onOohGimme={ad.onOohGimme}
          onOpenSettings={ad.onOpenSettings}
          onHeightChange={handleAdHeight}
        />
      ) : null}

      {purchaseEnabled && purchase.row && (purchase.visible || purchase.closing) ? (
        <MarketplacePurchaseToast
          row={purchase.row}
          visible={purchase.visible}
          closing={purchase.closing}
          bottomOffset={purchaseExtraBottom}
          onDismiss={purchase.onDismiss}
        />
      ) : null}
    </StackContext.Provider>
  )
}

export function useMarketplaceBottomStack() {
  return useContext(StackContext)
}
