import React, { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { deleteAccount, supabase } from '../lib/supabase'
import { notifyPersonalResourcesWiped } from '../lib/userDataEvents'
import SettingsSection from './settings/SettingsSection'
import SettingsField from './settings/SettingsField'
import SettingsToggle from './settings/SettingsToggle'
import ConnectedAccountsSettings from './settings/ConnectedAccountsSettings'
import CitizenIdSettings from './settings/CitizenIdSettings'
import OrgLogoUploadField from './settings/OrgLogoUploadField'
import AppModal from './layout/AppModal'
import RsiBioVerifyControls from './RsiBioVerifyControls'
import SiteTooltip from './SiteTooltip'
import { rotateMyFriendInviteLink } from '../lib/friends'

export default function ProfileSettings({ onClose }: { onClose: () => void }) {
  const {
    user,
    profile,
    refreshProfile,
    updateRsiHandle: _updateRsiHandle,
    updateCraftDeductInventory,
    updateGroupBlueprintVariants,
    groupBlueprintVariants,
    updateDfpDisplayEnabled,
    dfpDisplayEnabled,
    autoApproveEnabled,
    updateAutoApprove,
    marketplaceWtsAdsSiteEnabled,
    marketplaceWtbAdsSiteEnabled,
    marketplacePurchaseToastsSiteEnabled,
    updateMarketplaceWtsAdsSite,
    updateMarketplaceWtbAdsSite,
    updateMarketplacePurchaseToastsSite,
    marketplaceWtsAdsEnabled,
    marketplaceWtbAdsEnabled,
    marketplacePurchaseToastsEnabled,
    updateMarketplaceWtsAds,
    updateMarketplaceWtbAds,
    updateMarketplacePurchaseToasts,
    signOut,
    isSuperAdmin,
    refreshAcquiredBlueprints,
  } = useAuth()
  const [rsiHandle, setRsiHandle] = useState(profile?.rsi_handle || '')
  const [craftDeductInventory, setCraftDeductInventory] = useState(
    profile?.craft_deduct_inventory ?? false
  )
  const [groupVariantsEnabled, setGroupVariantsEnabled] = useState(groupBlueprintVariants)
  const [rotatingInvite, setRotatingInvite] = useState(false)
  const [savingCraftDeduct, setSavingCraftDeduct] = useState(false)
  const [savingGroupBlueprintVariants, setSavingGroupBlueprintVariants] = useState(false)
  const [savingDfpDisplay, setSavingDfpDisplay] = useState(false)
  const [savingAutoApprove, setSavingAutoApprove] = useState(false)
  const [savingMarketplaceWtsAds, setSavingMarketplaceWtsAds] = useState(false)
  const [savingMarketplaceWtbAds, setSavingMarketplaceWtbAds] = useState(false)
  const [savingMarketplacePurchaseToasts, setSavingMarketplacePurchaseToasts] = useState(false)
  const [savingSiteWtsAds, setSavingSiteWtsAds] = useState(false)
  const [savingSiteWtbAds, setSavingSiteWtbAds] = useState(false)
  const [savingSitePurchaseToasts, setSavingSitePurchaseToasts] = useState(false)
  const [showWelcomeAlways, setShowWelcomeAlways] = useState(false)
  const [savingWelcome, setSavingWelcome] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [wipingBlueprints, setWipingBlueprints] = useState(false)
  const [wipingResources, setWipingResources] = useState(false)
  const [showBlueprintWipeConfirm, setShowBlueprintWipeConfirm] = useState(false)
  const [showResourceWipeConfirm, setShowResourceWipeConfirm] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [hasActiveOrders, setHasActiveOrders] = useState(false)
  const [hasLiveDeals, setHasLiveDeals] = useState(false)
  const [_checkingOrders, setCheckingOrders] = useState(true)

  const isVerified = profile?.rsi_handle_verified ?? false

  // Check if user has active orders (as buyer or fulfiller)
  useEffect(() => {
    if (!user?.id) {
      setCheckingOrders(false)
      return
    }

    const checkActiveOrders = async () => {
      try {
        // Check for active orders as requester
        const { count: requesterCount } = await supabase
          .from('custom_orders')
          .select('*', { count: 'exact', head: true })
          .eq('requester_id', user.id)
          .in('status', ['pending', 'accepted', 'in_progress'])

        // Check for active orders as assignee/fulfiller
        const { count: assigneeCount } = await supabase
          .from('custom_orders')
          .select('*', { count: 'exact', head: true })
          .eq('assignee_id', user.id)
          .in('status', ['accepted', 'in_progress'])

        const liveRequester = await supabase
          .from('custom_orders')
          .select('*', { count: 'exact', head: true })
          .eq('requester_id', user.id)
          .in('status', ['accepted', 'in_progress', 'ready_for_pickup'])

        const liveAssignee = await supabase
          .from('custom_orders')
          .select('*', { count: 'exact', head: true })
          .eq('assignee_id', user.id)
          .in('status', ['accepted', 'in_progress', 'ready_for_pickup'])

        setHasActiveOrders((requesterCount ?? 0) > 0 || (assigneeCount ?? 0) > 0)
        setHasLiveDeals((liveRequester.count ?? 0) > 0 || (liveAssignee.count ?? 0) > 0)
      } catch {
        // If query fails, assume no active orders
        setHasActiveOrders(false)
      }
      setCheckingOrders(false)
    }

    checkActiveOrders()
  }, [user?.id])

  // Load welcome modal setting for super-admin
  useEffect(() => {
    if (!isSuperAdmin) return
    const loadWelcomeSetting = async () => {
      try {
        const { data } = await supabase.rpc('get_welcome_modal_status')
        if (data) {
          setShowWelcomeAlways(data.always_show ?? false)
        }
      } catch {
        // Migration may not be run yet
      }
    }
    loadWelcomeSetting()
  }, [isSuperAdmin])

  useEffect(() => {
    setRsiHandle(profile?.rsi_handle || '')
    setCraftDeductInventory(profile?.craft_deduct_inventory ?? false)
    setGroupVariantsEnabled(groupBlueprintVariants)
  }, [
    profile?.rsi_handle,
    profile?.craft_deduct_inventory,
    groupBlueprintVariants,
  ])

  const handleDfpDisplayChange = async (enabled: boolean) => {
    setSavingDfpDisplay(true)
    setMessage(null)

    const success = await updateDfpDisplayEnabled(enabled)

    if (!success) {
      setMessage({ type: 'error', text: 'Failed to update DFP display setting.' })
    }

    setSavingDfpDisplay(false)
  }

  const handleAutoApproveChange = async (enabled: boolean) => {
    setSavingAutoApprove(true)
    setMessage(null)

    const success = await updateAutoApprove(enabled)

    if (!success) {
      setMessage({ type: 'error', text: 'Failed to update auto-approve setting.' })
    }

    setSavingAutoApprove(false)
  }

  const handleWelcomeAlwaysChange = async (enabled: boolean) => {
    const previous = showWelcomeAlways
    setShowWelcomeAlways(enabled)
    setSavingWelcome(true)
    setMessage(null)

    try {
      const { error } = await supabase.rpc('update_show_welcome_modal_always', { p_enabled: enabled })
      if (error) throw error
      setMessage({ type: 'success', text: enabled ? 'Welcome modal will show on next page load.' : 'Welcome modal testing disabled.' })
    } catch {
      setShowWelcomeAlways(previous)
      setMessage({ type: 'error', text: 'Failed to update welcome modal setting.' })
    }

    setSavingWelcome(false)
  }

  const handleCraftDeductInventoryChange = async (enabled: boolean) => {
    const previous = craftDeductInventory
    setCraftDeductInventory(enabled)
    setSavingCraftDeduct(true)
    setMessage(null)

    const success = await updateCraftDeductInventory(enabled)

    if (!success) {
      setCraftDeductInventory(previous)
      setMessage({ type: 'error', text: 'Failed to update craft inventory setting.' })
    }

    setSavingCraftDeduct(false)
  }

  const handleGroupBlueprintVariantsChange = async (enabled: boolean) => {
    const previous = groupVariantsEnabled
    setGroupVariantsEnabled(enabled)
    setSavingGroupBlueprintVariants(true)
    setMessage(null)

    const success = await updateGroupBlueprintVariants(enabled)

    if (!success) {
      setGroupVariantsEnabled(previous)
      setMessage({ type: 'error', text: 'Failed to update blueprint variant grouping.' })
    }

    setSavingGroupBlueprintVariants(false)
  }

  const marketplaceSiteAnyEnabled =
    marketplaceWtsAdsSiteEnabled || marketplaceWtbAdsSiteEnabled || marketplacePurchaseToastsSiteEnabled

  const handleMarketplaceWtsAdsChange = async (enabled: boolean) => {
    setSavingMarketplaceWtsAds(true)
    setMessage(null)
    const success = await updateMarketplaceWtsAds(enabled)
    if (!success) setMessage({ type: 'error', text: 'Failed to update WTS listing ads preference.' })
    setSavingMarketplaceWtsAds(false)
  }

  const handleMarketplaceWtbAdsChange = async (enabled: boolean) => {
    setSavingMarketplaceWtbAds(true)
    setMessage(null)
    const success = await updateMarketplaceWtbAds(enabled)
    if (!success) setMessage({ type: 'error', text: 'Failed to update WTB listing ads preference.' })
    setSavingMarketplaceWtbAds(false)
  }

  const handleMarketplacePurchaseToastsChange = async (enabled: boolean) => {
    setSavingMarketplacePurchaseToasts(true)
    setMessage(null)
    const success = await updateMarketplacePurchaseToasts(enabled)
    if (!success) setMessage({ type: 'error', text: 'Failed to update purchase toast preference.' })
    setSavingMarketplacePurchaseToasts(false)
  }

  const handleSiteWtsAdsChange = async (enabled: boolean) => {
    setSavingSiteWtsAds(true)
    setMessage(null)
    const success = await updateMarketplaceWtsAdsSite(enabled)
    if (!success) setMessage({ type: 'error', text: 'Failed to update site WTS ads setting.' })
    setSavingSiteWtsAds(false)
  }

  const handleSiteWtbAdsChange = async (enabled: boolean) => {
    setSavingSiteWtbAds(true)
    setMessage(null)
    const success = await updateMarketplaceWtbAdsSite(enabled)
    if (!success) setMessage({ type: 'error', text: 'Failed to update site WTB ads setting.' })
    setSavingSiteWtbAds(false)
  }

  const handleSitePurchaseToastsChange = async (enabled: boolean) => {
    setSavingSitePurchaseToasts(true)
    setMessage(null)
    const success = await updateMarketplacePurchaseToastsSite(enabled)
    if (!success) setMessage({ type: 'error', text: 'Failed to update site purchase toasts setting.' })
    setSavingSitePurchaseToasts(false)
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return

    setDeleting(true)
    setMessage(null)

    const result = await deleteAccount()

    if (!result.success) {
      setMessage({ type: 'error', text: result.error || 'Failed to delete account' })
      setDeleting(false)
      return
    }

    await signOut()
    onClose()
  }

  const handleWipeBlueprints = async () => {
    setWipingBlueprints(true)
    setMessage(null)

    try {
      const { data, error } = await supabase.rpc('wipe_my_acquired_blueprints')
      if (error) throw error
      if (!data?.success) throw new Error(data?.error || 'Wipe failed')

      await refreshAcquiredBlueprints()
      setShowBlueprintWipeConfirm(false)
      setMessage({
        type: 'success',
        text: 'Collected blueprints cleared. Starter blueprints may reappear on refresh.',
      })
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to clear collected blueprints',
      })
    }

    setWipingBlueprints(false)
  }

  const handleWipeResources = async () => {
    setWipingResources(true)
    setMessage(null)

    try {
      const { data, error } = await supabase.rpc('wipe_my_resource_inventory')
      if (error) throw error
      if (!data?.success) throw new Error(data?.error || 'Wipe failed')

      notifyPersonalResourcesWiped()
      setShowResourceWipeConfirm(false)
      setMessage({ type: 'success', text: 'Tracked resources cleared.' })
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to clear tracked resources',
      })
    }

    setWipingResources(false)
  }

  return (
    <AppModal
      title="Settings"
      subtitle="Profile, privacy, and account"
      onClose={onClose}
      size="md"
      zIndex={70}
      footer={
        <button
          onClick={onClose}
          className="site-btn-secondary w-full"
        >
          Close
        </button>
      }
    >
      <div className="space-y-4">
          {message && (
            <div className={message.type === 'success' ? 'site-banner-success' : 'site-banner-error'}>
              {message.text}
            </div>
          )}

          <SettingsSection
            title="Profile"
            description="How you appear to other players"
          >
            <SettingsField
              label={
                <span className="flex items-center gap-2">
                  RSI Handle
                  {isVerified && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-cyan-900/50 border border-cyan-500/30 rounded text-[10px] text-cyan-400 font-semibold">
                      <span className="italic">RSI</span>
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </span>
                  )}
                </span>
              }
              hint={
                hasActiveOrders && isVerified
                  ? "You have active orders — clear them before changing your handle."
                  : isVerified
                    ? `Verified on ${profile?.rsi_handle_verified_at ? new Date(profile.rsi_handle_verified_at).toLocaleDateString() : 'RSI'}`
                    : 'Your handle is only saved after Verify succeeds. Change clears it until you verify again.'
              }
            >
              <RsiBioVerifyControls
                rsiHandle={rsiHandle}
                onRsiHandleChange={setRsiHandle}
                isVerified={isVerified}
                inputDisabled={hasActiveOrders && isVerified}
                onVerified={async () => {
                  await refreshProfile()
                }}
                onError={(text) => setMessage({ type: 'error', text })}
                onSuccessMessage={(text) => setMessage({ type: 'success', text })}
              />
            </SettingsField>

            <div className="mt-4 pt-4 site-divider">
              <CitizenIdSettings
                isSuperAdmin={isSuperAdmin}
                hasActiveOrders={hasLiveDeals}
                onRefreshProfile={refreshProfile}
                onMessage={setMessage}
              />
            </div>

            <div className="mt-4 pt-4 site-divider">
              <SettingsToggle
                label="Deduct inventory on craft complete"
                description={
                  isVerified
                    ? "When on, completing a fulfillment craft requires enough stock in My Resources and deducts materials automatically."
                    : 'Verify your RSI Handle above to enable this feature.'
                }
                checked={craftDeductInventory}
                onChange={handleCraftDeductInventoryChange}
                saving={savingCraftDeduct}
                disabled={!isVerified}
              />
            </div>
          </SettingsSection>

          <ConnectedAccountsSettings onMessage={setMessage} />

          <SettingsSection
            title="Security"
            description="Invite links and account-sensitive controls"
          >
            <SettingsField
              label="Friend invite link"
              hint={
                isVerified
                  ? 'Share invite from the Friends menu. Rotate only if you need to invalidate a link you already posted (YouTube, Discord, etc.).'
                  : 'Verify your RSI Handle above before you can share or rotate an invite link.'
              }
            >
              <SiteTooltip
                side="top"
                content="Creates a new invite link and immediately stops the old one from working. Your previous YouTube/Discord posts will no longer add friend requests. Share invite does not rotate — only this button does."
              >
                <button
                  type="button"
                  disabled={!isVerified || rotatingInvite}
                  className="site-btn-secondary text-sm px-3 py-2"
                  onClick={() => {
                    if (!isVerified || rotatingInvite) return
                    setRotatingInvite(true)
                    void (async () => {
                      const result = await rotateMyFriendInviteLink()
                      setRotatingInvite(false)
                      if (result.error) {
                        setMessage({ type: 'error', text: result.error })
                        return
                      }
                      setMessage({
                        type: 'success',
                        text: 'Invite link rotated. Old links no longer work — copy the new one from Friends.',
                      })
                    })()
                  }}
                >
                  {rotatingInvite ? 'Rotating…' : 'Rotate invite link'}
                </button>
              </SiteTooltip>
            </SettingsField>
          </SettingsSection>

          <SettingsSection
            title="Display"
            description="Customize how the Blueprints catalog is shown"
          >
            <SettingsToggle
              label="Group FPS blueprint variants"
              description="Collapse FPS weapon and armor color or skin variants into expandable family cards on the Blueprints page. Only groups variants currently visible — filters automatically split groups apart. Off by default."
              checked={groupVariantsEnabled}
              onChange={handleGroupBlueprintVariantsChange}
              saving={savingGroupBlueprintVariants}
            />
          </SettingsSection>

          {marketplaceSiteAnyEnabled && (
            <SettingsSection
              title="Marketplace"
              description="Bottom-left marketplace prompts and live purchase toasts"
            >
              <SettingsToggle
                label="WTS listing ads"
                description="Occasionally surface stale WTS listings you have not dismissed. Site-wide feature must be enabled by an admin."
                checked={marketplaceWtsAdsEnabled}
                onChange={handleMarketplaceWtsAdsChange}
                saving={savingMarketplaceWtsAds}
                disabled={!marketplaceWtsAdsSiteEnabled}
              />
              <SettingsToggle
                label="WTB listing ads"
                description="Occasionally surface stale WTB listings you have not dismissed. Site-wide feature must be enabled by an admin."
                checked={marketplaceWtbAdsEnabled}
                onChange={handleMarketplaceWtbAdsChange}
                saving={savingMarketplaceWtbAds}
                disabled={!marketplaceWtbAdsSiteEnabled}
              />
              <SettingsToggle
                label="Live purchase toasts"
                description="Show short live notifications when members accept marketplace orders. Only events while you are online — no backlog."
                checked={marketplacePurchaseToastsEnabled}
                onChange={handleMarketplacePurchaseToastsChange}
                saving={savingMarketplacePurchaseToasts}
                disabled={!marketplacePurchaseToastsSiteEnabled}
              />
            </SettingsSection>
          )}

          {isSuperAdmin && (
            <SettingsSection
              title="Site"
              description="Site-wide settings"
            >
              <OrgLogoUploadField />
              <SettingsToggle
                label="Disable DFP display"
                description={
                  <>
                    Hide Dumper's Fair-Value Price amounts in the UI. The opt-out notice will automatically appear at the bottom of every page while this is off.{' '}
                    <a
                      href="/archive#dfp"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-400/70 hover:text-orange-300 underline"
                    >
                      What is DFP?
                    </a>
                  </>
                }
                checked={!dfpDisplayEnabled}
                onChange={(disabled) => handleDfpDisplayChange(!disabled)}
                saving={savingDfpDisplay}
              />
              <SettingsToggle
                label="Auto-approve new signups"
                description="When enabled, new sign-ins are automatically approved as members instead of requiring officer approval."
                checked={autoApproveEnabled}
                onChange={handleAutoApproveChange}
                saving={savingAutoApprove}
              />
              <SettingsToggle
                label="Always show Welcome Modal (testing)"
                description="When enabled, the welcome onboarding modal appears on every page load. Use this to preview/test the modal before rolling out to all users."
                checked={showWelcomeAlways}
                onChange={handleWelcomeAlwaysChange}
                saving={savingWelcome}
              />
              <SettingsToggle
                label="WTS listing ads (site-wide)"
                description="Show bottom-left WTS listing ads to approved members. Members can opt out in Settings → Marketplace. Disabling clears ad pool data for WTS."
                checked={marketplaceWtsAdsSiteEnabled}
                onChange={handleSiteWtsAdsChange}
                saving={savingSiteWtsAds}
              />
              <SettingsToggle
                label="WTB listing ads (site-wide)"
                description="Show bottom-left WTB listing ads to approved members. Members can opt out in Settings → Marketplace. Disabling clears ad pool data for WTB."
                checked={marketplaceWtbAdsSiteEnabled}
                onChange={handleSiteWtbAdsChange}
                saving={savingSiteWtbAds}
              />
              <SettingsToggle
                label="Live purchase toasts (site-wide)"
                description="Broadcast short live purchase notifications to online members. No backlog — offline members miss events. Disabling clears the feed buffer."
                checked={marketplacePurchaseToastsSiteEnabled}
                onChange={handleSitePurchaseToastsChange}
                saving={savingSitePurchaseToasts}
              />
            </SettingsSection>
          )}

          <SettingsSection
            title="My Data"
            description="Reset your personal collection data"
            variant="danger"
          >
            <div className="space-y-4">
              <div>
                <p className="text-sm text-slate-400 mb-2">
                  Remove all blueprints you have marked as collected. Starter blueprints may be
                  re-added automatically on your next visit.
                </p>
                {!showBlueprintWipeConfirm ? (
                  <button
                    onClick={() => setShowBlueprintWipeConfirm(true)}
                    className="site-btn-danger w-full"
                  >
                    Clear Collected Blueprints
                  </button>
                ) : (
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowBlueprintWipeConfirm(false)}
                      disabled={wipingBlueprints}
                      className="site-btn-secondary flex-1"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleWipeBlueprints}
                      disabled={wipingBlueprints}
                      className="site-btn-danger flex-1"
                    >
                      {wipingBlueprints ? 'Clearing...' : 'Confirm Clear'}
                    </button>
                  </div>
                )}
              </div>

              <div className="pt-4 site-divider">
                <p className="text-sm text-slate-400 mb-2">
                  Remove all quantities and notes from My Resources in the Resource Tracker.
                </p>
                {!showResourceWipeConfirm ? (
                  <button
                    onClick={() => setShowResourceWipeConfirm(true)}
                    className="site-btn-danger w-full"
                  >
                    Clear Tracked Resources
                  </button>
                ) : (
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowResourceWipeConfirm(false)}
                      disabled={wipingResources}
                      className="site-btn-secondary flex-1"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleWipeResources}
                      disabled={wipingResources}
                      className="site-btn-danger flex-1"
                    >
                      {wipingResources ? 'Clearing...' : 'Confirm Clear'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            title="Account"
            description="Permanent account actions"
            variant="danger"
          >
            {isSuperAdmin ? (
              <p className="text-sm text-slate-500">
                Super-admin accounts cannot be self-deleted.
              </p>
            ) : !showDeleteConfirm ? (
              <>
                <p className="text-sm text-slate-400">
                  Remove your blueprint data and sign-in permanently. Accepted deals in progress
                  will close and the other party gets an automatic 5-star (counts toward their
                  5-item reputation unlock). Open WTS/WTB postings that nobody accepted are
                  cancelled with no rating. Citizen iD / Spectrum data is deleted with the account.
                </p>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="site-btn-danger w-full"
                >
                  Delete My Account
                </button>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-400">
                  Type <span className="text-white font-mono">DELETE</span> to confirm.
                </p>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Type DELETE"
                  className="site-input w-full px-4 py-2.5 text-sm border-red-500/30"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(false)
                      setDeleteConfirmText('')
                    }}
                    disabled={deleting}
                    className="site-btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleting || deleteConfirmText !== 'DELETE'}
                    className="site-btn-danger flex-1"
                  >
                    {deleting ? 'Deleting...' : 'Confirm Delete'}
                  </button>
                </div>
              </div>
            )}
          </SettingsSection>
      </div>
    </AppModal>
  )
}
