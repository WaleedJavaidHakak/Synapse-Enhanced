'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Camera, Check, ChevronRight, Info, MapPin, Pencil, Phone, ShieldCheck, Sparkles, UserRound, X } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { publishDbUser, useUserSync } from '@/hooks/useUserSync'
import { Avatar } from '@/components/people/PersonProfileDialog'

type Field = 'name' | 'bio' | 'phone' | 'interests' | 'location'

const FIELDS: Array<{ key: Field; label: string; hint: string; max: number; Icon: typeof UserRound; multiline?: boolean; placeholder: string }> = [
  { key: 'name', label: 'Name', hint: 'This is the name people see in chats and Discover.', max: 60, Icon: UserRound, placeholder: 'Your name' },
  { key: 'bio', label: 'About', hint: '', max: 300, Icon: Info, multiline: true, placeholder: 'Hey there! I am using Synapse.' },
  { key: 'interests', label: 'Interests', hint: 'Comma-separated, e.g. music, hiking, startups. Helps people find you in Discover.', max: 300, Icon: Sparkles, placeholder: 'music, travel, coding' },
  { key: 'location', label: 'Location', hint: 'Optional. A city or country is enough.', max: 100, Icon: MapPin, placeholder: 'e.g. Lahore, Pakistan' },
  { key: 'phone', label: 'Phone', hint: 'Hidden from everyone by default. Change this in Privacy.', max: 30, Icon: Phone, placeholder: '+92 300 0000000' },
]

export function UserProfile({ onOpenPrivacy }: { onOpenPrivacy?: () => void }) {
  const { dbUser } = useUserSync()
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const [editing, setEditing] = useState<Field | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setEditing(null) }, [dbUser?.id])

  const save = async (patch: Record<string, string | null>) => {
    setSaving(true)
    try {
      const r = await fetch('/api/users/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      publishDbUser(d.user)
      setEditing(null)
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const uploadPhoto = async (file: File) => {
    if (!file.type.startsWith('image/')) return toast.error('Choose an image')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/upload', { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      await save({ imageUrl: d.url })
      toast.success('Profile photo updated')
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const muted = dark ? 'text-[#8696a0]' : 'text-[#667781]'
  const section = dark ? 'bg-[#111b21]' : 'bg-white'

  if (!dbUser) {
    return <div className="flex h-full items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#00a884] border-t-transparent" /></div>
  }

  return (
    <div className={`h-full overflow-y-auto ${dark ? 'bg-[#0b141a] text-[#e9edef]' : 'bg-[#f0f2f5] text-[#111b21]'}`}>
      <div className={`px-6 pt-6 pb-3 ${section}`}>
        <h2 className="text-xl font-semibold">Profile</h2>
      </div>

      <div className={`flex justify-center py-7 ${section}`}>
        <button type="button" onClick={() => fileRef.current?.click()} className="group relative rounded-full" aria-label="Change profile photo" disabled={uploading}>
          <Avatar name={dbUser.name} src={dbUser.imageUrl} size={160} />
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full bg-black/45 text-xs font-medium uppercase text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <Camera className="h-6 w-6" />
            {uploading ? 'Uploading…' : 'Change photo'}
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = '' }} />
      </div>

      <div className="mt-2 space-y-2 max-w-2xl mx-auto">
        {FIELDS.map(({ key, label, hint, max, Icon, multiline, placeholder }) => {
          const value = (dbUser as any)[key] as string | null | undefined
          const isEditing = editing === key
          return (
            <div key={key} className={`px-6 py-4 ${section}`}>
              <div className="flex items-center gap-2 text-sm text-[#00a884]"><Icon className="h-4 w-4" />{label}</div>
              {isEditing ? (
                <div className="mt-2">
                  <div className="flex items-end gap-2 border-b-2 border-[#00a884] pb-1">
                    {multiline ? (
                      <textarea autoFocus value={draft} onChange={e => setDraft(e.target.value.slice(0, max))} rows={3} placeholder={placeholder} className="flex-1 resize-none bg-transparent text-[15px] outline-none" />
                    ) : (
                      <input
                        autoFocus
                        value={draft}
                        onChange={e => setDraft(e.target.value.slice(0, max))}
                        onKeyDown={e => { if (e.key === 'Enter') save({ [key]: draft.trim() || null }); if (e.key === 'Escape') setEditing(null) }}
                        placeholder={placeholder}
                        className="flex-1 bg-transparent text-[15px] outline-none"
                      />
                    )}
                    <span className={`text-xs ${muted}`}>{max - draft.length}</span>
                    <button type="button" onClick={() => setEditing(null)} className={`p-1 ${muted}`} aria-label="Cancel"><X className="h-5 w-5" /></button>
                    <button
                      type="button"
                      disabled={saving || (key === 'name' && !draft.trim())}
                      onClick={() => save({ [key]: draft.trim() || null })}
                      className="p-1 text-[#00a884] disabled:opacity-40"
                      aria-label="Save"
                    >
                      <Check className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => { setDraft(value || ''); setEditing(key) }} className="mt-2 flex w-full items-start justify-between gap-3 text-left">
                  <span className={`text-[15px] whitespace-pre-wrap break-words ${value ? '' : muted}`}>{value || `Add ${label.toLowerCase()}`}</span>
                  <Pencil className={`mt-0.5 h-4 w-4 flex-shrink-0 ${muted}`} />
                </button>
              )}
              {hint && <p className={`mt-2 text-xs ${muted}`}>{hint}</p>}
            </div>
          )
        })}

        {onOpenPrivacy && (
          <button type="button" onClick={onOpenPrivacy} className={`flex w-full items-center gap-4 px-6 py-4 text-left ${section} hover:opacity-90`}>
            <ShieldCheck className="h-5 w-5 text-[#00a884]" />
            <span className="flex-1">
              <span className="block text-[15px]">Privacy</span>
              <span className={`block text-xs ${muted}`}>Who can find you, message you, and see your photo, about and last seen</span>
            </span>
            <ChevronRight className={`h-5 w-5 ${muted}`} />
          </button>
        )}
        <div className="h-6" />
      </div>
    </div>
  )
}
