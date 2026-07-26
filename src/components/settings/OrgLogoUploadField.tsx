import React, { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import SettingsField from './SettingsField'
import {
  ORG_LOGO_DEFAULT_PATH,
  ORG_LOGO_MAX_BYTES,
  ORG_LOGO_MAX_DIMENSION,
  ORG_LOGO_MIN_DIMENSION,
  ORG_LOGO_OBJECT_NAME,
  buildOrgLogoStorageUrl,
  removeOrgLogo,
  uploadOrgLogo,
  validateOrgLogoFile,
} from '../../lib/orgLogo'

export default function OrgLogoUploadField() {
  const { orgLogoUpdatedAt, orgLogoConfigured, refreshOrgLogo } = useAuth()
  const previewSrc = orgLogoConfigured && orgLogoUpdatedAt
    ? buildOrgLogoStorageUrl(orgLogoUpdatedAt)
    : ORG_LOGO_DEFAULT_PATH
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [previewError, setPreviewError] = useState(false)

  useEffect(() => {
    setPreviewError(false)
  }, [orgLogoUpdatedAt, orgLogoConfigured])

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setUploading(true)
    setPreviewError(false)

    const validation = await validateOrgLogoFile(file)
    if (!validation.ok) {
      window.alert(validation.error)
      setUploading(false)
      return
    }

    const result = await uploadOrgLogo(file)
    if (!result.ok) {
      window.alert(result.error)
      setUploading(false)
      return
    }

    await refreshOrgLogo()
    setUploading(false)
  }

  const handleRemove = async () => {
    if (!window.confirm('Remove the org logo from this site?')) return

    setRemoving(true)
    const result = await removeOrgLogo()
    if (!result.ok) {
      window.alert(result.error)
      setRemoving(false)
      return
    }

    await refreshOrgLogo()
    setPreviewError(false)
    setRemoving(false)
  }

  return (
    <SettingsField
      label="Org logo (blueprint modal)"
      hint={`PNG only, ${ORG_LOGO_MIN_DIMENSION}–${ORG_LOGO_MAX_DIMENSION}px per side, max ${Math.round(ORG_LOGO_MAX_BYTES / 1024)} KB. Stored as ${ORG_LOGO_OBJECT_NAME} in Supabase Storage. Until you upload, members see the shipped Dumper's Repo default logo.`}
      action={
        orgLogoConfigured ? (
          <button
            type="button"
            onClick={() => void handleRemove()}
            disabled={removing || uploading}
            className="text-xs text-red-400/80 hover:text-red-300 disabled:opacity-50"
          >
            {removing ? 'Removing…' : 'Remove org logo'}
          </button>
        ) : null
      }
    >
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        <div className="w-28 h-28 rounded-xl border border-slate-600 bg-slate-900/80 flex items-center justify-center overflow-hidden shrink-0">
          {previewSrc && !previewError ? (
            <img
              src={previewSrc ?? ORG_LOGO_DEFAULT_PATH}
              alt={orgLogoConfigured ? 'Current org logo preview' : 'Default org logo'}
              className="max-w-full max-h-full object-contain"
              onError={() => setPreviewError(true)}
            />
          ) : (
            <span className="text-[10px] text-slate-500 text-center px-2 leading-snug">
              Preview unavailable
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2 min-w-0">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,.png"
            className="hidden"
            onChange={(e) => void handleFileChange(e)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading || removing}
            className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg font-medium transition-colors w-fit"
          >
            {uploading ? 'Uploading…' : orgLogoConfigured ? 'Replace org logo' : 'Upload org logo'}
          </button>
          <p className="text-xs text-slate-500">
            Shown on the back of blueprint detail cards. Use a transparent PNG when possible.
          </p>
        </div>
      </div>
    </SettingsField>
  )
}
