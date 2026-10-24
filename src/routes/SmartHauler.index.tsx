import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import SmartHaulerPanel from '../components/smartHauler/SmartHaulerPanel'
import { useAuth } from '../contexts/AuthContext'

export default function SmartHaulerRoute() {
  const { profile } = useAuth()
  return (
    <FeaturePageLayout
      title="Smart Hauler"
      subtitle="Plan a cargo run to a profit goal or a number of trades, or find buyers for cargo you already carry."
      badge="UEX"
    >
      <SmartHaulerPanel rsiVerified={Boolean(profile?.rsi_handle_verified)} />
    </FeaturePageLayout>
  )
}
