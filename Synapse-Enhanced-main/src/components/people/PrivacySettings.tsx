'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, Ban, ShieldCheck } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { publishDbUser } from '@/hooks/useUserSync'
import { Avatar } from './PersonProfileDialog'

type Visibility = 'EVERYONE' | 'CONNECTIONS' | 'NOBODY'
type MessagePermission = 'EVERYONE' | 'REQUESTS' | 'NOBODY'

interface Settings {
  isDiscoverable: boolean
  readReceipts: boolean
  messagePermission: MessagePermission
  profilePhotoVisibility: Visibility
  aboutVisibility: Visibility
  lastSeenVisibility: Visibility
  phoneVisibility: Visibility
  emailVisibility: Visibility
}

const VIS_OPTIONS: Array<{ value: Visibility; label: string }> = [
  { value: 'EVERYONE', label: 'Everyone' },
  { value: 'CONNECTIONS', label: 'My contacts' },
  { value: 'NOBODY', label: 'Nobody' },
]

const VIS_FIELDS: Array<{ key: keyof Settings; title: string; hint: string }> = [
  { key: 'lastSeenVisibility', title: 'Last seen & online', hint: 'Who can see when you\'re online and when you were last active.' },
  { key: 'profilePhotoVisibility', title: 'Profile photo', hint: 'Hidden photos show your initials instead.' },
  { key: 'aboutVisibility', title: 'About', hint: 'Your status text.' },
  { key: 'phoneVisibility', title: 'Phone number', hint: 'Only shown if you added one in your profile.' },
  { key: 'emailVisibility', title: 'Email address', hint: '' },
]

const MESSAGE_OPTIONS: Array<{ value: MessagePermission; label: string; hint: string }> = [
  { value: 'EVERYONE', label: 'Everyone', hint: 'Anyone can start a chat with you directly.' },
  { value: 'REQUESTS', label: 'Message requests', hint: 'Strangers send a short intro first; you decide whether to chat.' },
  { value: 'NOBODY', label: 'Only existing chats', hint: 'No new people can contact you.' },
]

interface BlockedUser { id: string; name: string; imageUrl: string | null }

export function PrivacySettings({ onBack }: { onBack: () => void }) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const [settings, setSettings] = useState<Settings | null>(null)
  const [blocked, setBlocked] = useState<BlockedUser[]>([])
  const [showBlocked, setShowBlocked] = useState(false)

  const load = useCallback(async () => {
    const [p, b] = await Promise.all([fetch('/api/users/privacy'), fetch('/api/blocks')])
    if (p.ok) setSettings((await p.json()).settings)
    if (b.ok) setBlocked((await b.json()).blocked)
  }, [])

  useEffect(() => { load().catch(() => toast.error('Could not load privacy settings')) }, [load])

  const update = async (patch: Partial<Settings>) => {
    if (!settings) return
    const previous = settings
    setSettings({ ...settings, ...patch }) // optimistic
    try {
      const r = await fetch('/api/users/privacy', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setSettings(d.settings)
      // Let other components (e.g. read-receipt display) pick up the change
      const me = await fetch('/api/users/profile').then(res => res.json()).catch(() => null)
      if (me?.user) publishDbUser(me.user)
    } catch {
      setSettings(previous)
      toast.error('Could not save. Try again.')
    }
  }

  const unblock = async (u: BlockedUser) => {
    const r = await fetch(`/api/blocks?userId=${u.id}`, { method: 'DELETE' })
    if (r.ok) {
      setBlocked(prev => prev.filter(b => b.id !== u.id))
      toast.success(`${u.name} unblocked`)
    } else {
      toast.error('Could not unblock')
    }
  }

  const muted = dark ? 'text-[#8696a0]' : 'text-[#667781]'
  const section = `rounded-xl ${dark ? 'bg-[#111b21]' : 'bg-white'} shadow-sm`
  const divider = dark ? 'divide-[#222d34]' : 'divide-[#e9edef]'

  const Toggle = ({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) => (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${on ? 'bg-[#00a884]' : dark ? 'bg-[#3b4a54]' : 'bg-[#c4c9cc]'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  )

  return (
    <div className={`flex h-full flex-col ${dark ? 'bg-[#0b141a] text-[#e9edef]' : 'bg-[#f0f2f5] text-[#111b21]'}`}>
      <div className={`flex items-center gap-3 px-4 py-4 ${dark ? 'bg-[#111b21]' : 'bg-white'}`}>
        <button type="button" onClick={showBlocked ? () => setShowBlocked(false) : onBack} className={`rounded-full p-1.5 ${muted} hover:bg-black/5 dark:hover:bg-white/5`} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-semibold">{showBlocked ? 'Blocked contacts' : 'Privacy'}</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl w-full mx-auto">
        {!settings ? (
          <div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#00a884] border-t-transparent" /></div>
        ) : showBlocked ? (
          <div className={`${section} divide-y ${divider}`}>
            {blocked.length === 0 ? (
              <p className={`p-6 text-center text-sm ${muted}`}>You haven&apos;t blocked anyone.</p>
            ) : blocked.map(u => (
              <div key={u.id} className="flex items-center gap-3 p-3">
                <Avatar name={u.name} src={u.imageUrl} size={40} />
                <span className="flex-1 truncate text-sm">{u.name}</span>
                <button type="button" onClick={() => unblock(u)} className="rounded-full border px-3 py-1.5 text-xs text-[#00a884] border-[#00a884]/40 hover:bg-[#00a884]/10">Unblock</button>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className={`${section} p-4 flex items-start gap-3`}>
              <ShieldCheck className="h-5 w-5 flex-shrink-0 text-[#00a884] mt-0.5" />
              <p className={`text-sm ${muted}`}>
                &ldquo;My contacts&rdquo; means people you already share a chat or group with. Strangers in Discover only ever see
                what you allow for &ldquo;Everyone&rdquo;.
              </p>
            </div>

            <div className={`${section} divide-y ${divider}`}>
              <div className="flex items-center gap-4 p-4">
                <div className="flex-1">
                  <div className="text-sm font-medium">Show me in Discover</div>
                  <div className={`text-xs ${muted}`}>Let new people find your profile. People you already chat with can always reach you.</div>
                </div>
                <Toggle label="Show me in Discover" on={settings.isDiscoverable} onChange={v => update({ isDiscoverable: v })} />
              </div>
              <div className="p-4">
                <div className="text-sm font-medium">Who can message me</div>
                <div className="mt-2 space-y-1">
                  {MESSAGE_OPTIONS.map(o => (
                    <label key={o.value} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-black/5 dark:hover:bg-white/5">
                      <input type="radio" name="messagePermission" className="mt-1 accent-[#00a884]" checked={settings.messagePermission === o.value} onChange={() => update({ messagePermission: o.value })} />
                      <span>
                        <span className="block text-sm">{o.label}</span>
                        <span className={`block text-xs ${muted}`}>{o.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className={`${section} divide-y ${divider}`}>
              <div className={`px-4 pt-3 pb-2 text-xs font-medium uppercase tracking-wide ${muted}`}>Who can see my personal info</div>
              {VIS_FIELDS.map(f => (
                <div key={f.key} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{f.title}</div>
                    {f.hint && <div className={`text-xs ${muted}`}>{f.hint}</div>}
                  </div>
                  <div className={`flex rounded-lg p-0.5 ${dark ? 'bg-[#202c33]' : 'bg-[#f0f2f5]'}`} role="radiogroup" aria-label={f.title}>
                    {VIS_OPTIONS.map(o => (
                      <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={settings[f.key] === o.value}
                        onClick={() => update({ [f.key]: o.value } as Partial<Settings>)}
                        className={`rounded-md px-3 py-1.5 text-xs transition-colors ${settings[f.key] === o.value ? 'bg-[#00a884] text-white shadow-sm' : ''}`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className={`${section} divide-y ${divider}`}>
              <div className="flex items-center gap-4 p-4">
                <div className="flex-1">
                  <div className="text-sm font-medium">Read receipts</div>
                  <div className={`text-xs ${muted}`}>If turned off, you won&apos;t send or see blue ticks. Your unread badges still clear when you open a chat.</div>
                </div>
                <Toggle label="Read receipts" on={settings.readReceipts} onChange={v => update({ readReceipts: v })} />
              </div>
              <button type="button" onClick={() => setShowBlocked(true)} className="flex w-full items-center gap-4 p-4 text-left hover:bg-black/5 dark:hover:bg-white/5">
                <Ban className={`h-5 w-5 ${muted}`} />
                <span className="flex-1 text-sm font-medium">Blocked contacts</span>
                <span className={`text-sm ${muted}`}>{blocked.length}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
