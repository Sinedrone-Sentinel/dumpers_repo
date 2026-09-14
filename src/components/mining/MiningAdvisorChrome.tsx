import React, { createContext, useContext } from 'react'

interface MiningAdvisorChromeValue {
  headerSlot: HTMLDivElement | null
  overlaySlot: HTMLDivElement | null
}

const MiningAdvisorChromeContext = createContext<MiningAdvisorChromeValue | null>(null)

export function MiningAdvisorChromeProvider({
  children,
  headerSlot,
  overlaySlot,
}: {
  children: React.ReactNode
  headerSlot: HTMLDivElement | null
  overlaySlot: HTMLDivElement | null
}) {
  return (
    <MiningAdvisorChromeContext.Provider value={{ headerSlot, overlaySlot }}>
      {children}
    </MiningAdvisorChromeContext.Provider>
  )
}

export function useMiningAdvisorChrome(): MiningAdvisorChromeValue | null {
  return useContext(MiningAdvisorChromeContext)
}
