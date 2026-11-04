'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { format, isToday, isYesterday } from 'date-fns'
import { toast } from 'sonner'
import { Ban, Check, Clock, Flag, Lock, Mail, MapPin, MessageCircle, Phone, Sparkles, Users, Video, X } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useTheme } from '@/contexts/ThemeContext'

export interface PublicProfile {
  id: string
  name: string
  imageUrl: string | null
  bio: string | null
  phone: string | null
  email: string | null
  interests: string | null
  location: string | null
  isOnline: boolean | null
  lastSeen: string | null
  joinedAt: string | null
  messagePermission: 'EVERYONE' | 'REQUESTS' | 'NOBODY'
}

interface ProfileResponse {
  user: PublicProfile
  relationship: 'self' | 'connected' | 'request_sent' | 'request_received' | 'none'
  blockedByMe: boolean
  canMessage: boolean
  canRequest?: boolean
  sharedGroups: Array<{ id: string; name: string; imageUrl: string | null }>
  request: { id: string; message: string; createdAt: string; direction: 'incoming' | 'outgoing' } | null
}

const REPORT_REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'fake_profile', label: 'Fake profile' },
  { value: 'scam', label: 'Scam or fraud' },
  { value: 'other', label: 'Something else' },
]

export function formatPresence(p: { isOnline: boolean | null; lastSeen: string | null }) {
  if (p.isOnline) return 'online'
  if (!p.lastSeen) return null
  const d = new Date(p.lastSeen)
  if (isToday(d)) return `last seen today at ${format(d, 'HH:mm')}`
  if (isYesterday(d)) return `last seen yesterday at ${format(d, 'HH:mm')}`
  return `last seen ${format(d, 'MMM d')}`
}

export function Avatar({ name, src, size = 48 }: { name: string; src?: string | null; size?: number }) {
  if (src) return <img src={src} alt={name} style={{ width: size, height: size }} className="rounded-full object-cover flex-shrink-0" />
  const initials = name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div style={{ width: size, height: size, fontSize: size * 0.38 }} className="flex flex-shrink-0 items-center justify-center rounded-full bg-[#dfe5e7] text-[#54656f] font-medium dark:bg-[#6a7175] dark:text-[#d1d7db]">
      {initials || '?'}
    </div>
  )
}

interface Props {
  userId: string | null
  onClose: () => void
  /** Called with a conversation object after a chat is opened, created or a request accepted */
  onOpenConversation: (conversationId: string, conversation?: any) => void
  onStartCall?: (type: 'audio' | 'video') => void
  /** Called after block/unblock/accept etc. so lists can refresh */
  onChanged?: () => void
}

export function PersonProfileDialog({ userId, onClose, onOpenConversation, onStartCall, onChanged }: Props) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const [data, setData] = useState<ProfileResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'view' | 'request' | 'report'>('view')
  const [intro, setIntro] = useState('')
  const [reason, setReason] = useState('spam')
  const [details, setDetails] = useState('')
  const [alsoBlock, setAlsoBlock] = useState(true)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const r = await fetch(`/api/users/profile?userId=${encodeURIComponent(userId)}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setData(d)
    } catch {
      toast.error('Could not load this profile')
      onCloseRef.current()
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    setData(null)
    setMode('view')
    setIntro('')
    setDetails('')
    if (userId) load()
  }, [userId, load])

  const call = async (fn: () => Promise<Response>, success?: string) => {
    setBusy(true)
    try {
      const r = await fn()
      const d = await r.json().catch(() => ({}))
      if (!r.ok && r.status !== 409) throw new Error(d.error || 'Something went wrong')
      if (success) toast.success(success)
      onChanged?.()
      return { ok: r.ok, status: r.status, data: d }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
      return null
    } finally {
      setBusy(false)
    }
  }

  const openChat = async () => {
    if (!data) return
    const res = await call(() => fetch('/api/conversations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ participantId: data.user.id }),
    }))
    if (res?.ok && res.data.conversation) {
      onOpenConversation(res.data.conversation.id, res.data.conversation)
      onClose()
    }
  }

  const sendRequest = async () => {
    if (!data || !intro.trim()) return
    const res = await call(() => fetch('/api/requests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ receiverId: data.user.id, message: intro.trim() }),
    }))
    if (!res) return
    if (res.data.status === 'CONNECTED') {
      onOpenConversation(res.data.conversationId)
      onClose()
    } else if (res.data.status === 'THEY_REQUESTED') {
      toast.info(`${data.user.name} already sent you a request. Accept it to start chatting.`)
      load()
    } else {
      toast.success('Request sent')
      setMode('view')
      load()
    }
  }

  const respond = async (action: 'accept' | 'decline' | 'cancel') => {
    if (!data?.request) return
    const res = await call(() => fetch(`/api/requests/${data.request!.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
    }), action === 'accept' ? 'Request accepted' : action === 'cancel' ? 'Request cancelled' : 'Request declined')
    if (res?.ok && action === 'accept' && res.data.conversationId) {
      onOpenConversation(res.data.conversationId)
      onClose()
    } else if (res?.ok) {
      load()
    }
  }

  const toggleBlock = async () => {
    if (!data) return
    const blocked = data.blockedByMe
    const res = await call(
      () => blocked
        ? fetch(`/api/blocks?userId=${data.user.id}`, { method: 'DELETE' })
        : fetch('/api/blocks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: data.user.id }) }),
      blocked ? `${data.user.name} unblocked` : `${data.user.name} blocked`
    )
    if (res?.ok) load()
  }

  const submitReport = async () => {
    if (!data) return
    const res = await call(() => fetch('/api/reports', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: data.user.id, reason, details, block: alsoBlock }),
    }), alsoBlock ? 'Reported and blocked' : 'Report sent. Thanks for keeping Synapse safe.')
    if (res?.ok) { setMode('view'); load() }
  }

  const u = data?.user
  const presence = u ? formatPresence(u) : null
  const muted = dark ? 'text-[#8696a0]' : 'text-[#667781]'
  const section = dark ? 'bg-[#111b21]' : 'bg-white'
  const interests = u?.interests?.split(',').map(s => s.trim()).filter(Boolean) || []

  return (
    <Dialog open={!!userId} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className={`max-w-md p-0 gap-0 overflow-hidden border-0 ${dark ? 'bg-[#0b141a] text-[#e9edef]' : 'bg-[#f0f2f5] text-[#111b21]'} [&>button]:hidden`}>
        <DialogTitle className="sr-only">{u ? `${u.name}'s profile` : 'Profile'}</DialogTitle>
        <div className={`flex items-center gap-3 px-4 py-3 ${section}`}>
          <button type="button" onClick={onClose} className={`rounded-full p-1.5 ${muted} hover:bg-black/5 dark:hover:bg-white/5`} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
          <span className="font-medium">{mode === 'request' ? 'Message request' : mode === 'report' ? 'Report' : 'Profile'}</span>
        </div>

        {loading || !data || !u ? (
          <div className="flex justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#00a884] border-t-transparent" />
          </div>
        ) : mode === 'request' ? (
          <div className={`space-y-3 p-5 ${section}`}>
            <div className="flex items-center gap-3">
              <Avatar name={u.name} src={u.imageUrl} size={44} />
              <div className="min-w-0">
                <div className="font-medium truncate">{u.name}</div>
                <div className={`text-xs ${muted}`}>They&apos;ll see your intro and choose whether to chat.</div>
              </div>
            </div>
            <Textarea
              autoFocus
              value={intro}
              onChange={e => setIntro(e.target.value.slice(0, 300))}
              placeholder={`Say hi to ${u.name.split(' ')[0]} and why you'd like to chat…`}
              className="min-h-[110px]"
            />
            <div className={`text-right text-xs ${muted}`}>{intro.length}/300</div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setMode('view')}>Back</Button>
              <Button className="flex-1 bg-[#00a884] hover:bg-[#06cf9c] text-white" disabled={!intro.trim() || busy} onClick={sendRequest}>
                Send request
              </Button>
            </div>
          </div>
        ) : mode === 'report' ? (
          <div className={`space-y-3 p-5 ${section}`}>
            <p className={`text-sm ${muted}`}>Why are you reporting {u.name}? They won&apos;t be told who reported them.</p>
            <div className="space-y-1">
              {REPORT_REASONS.map(r => (
                <label key={r.value} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-black/5 dark:hover:bg-white/5">
                  <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} className="accent-[#00a884]" />
                  <span className="text-sm">{r.label}</span>
                </label>
              ))}
            </div>
            <Textarea value={details} onChange={e => setDetails(e.target.value.slice(0, 1000))} placeholder="Details (optional)" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={alsoBlock} onChange={e => setAlsoBlock(e.target.checked)} className="accent-[#00a884]" />
              Also block {u.name.split(' ')[0]}
            </label>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setMode('view')}>Cancel</Button>
              <Button variant="destructive" className="flex-1" disabled={busy} onClick={submitReport}>Report</Button>
            </div>
          </div>
        ) : (
          <div className="max-h-[75vh] overflow-y-auto">
            <div className={`flex flex-col items-center px-6 pb-5 pt-2 ${section}`}>
              <Avatar name={u.name} src={u.imageUrl} size={112} />
              <h2 className="mt-3 text-xl font-medium text-center">{u.name}</h2>
              {presence && <p className={`text-sm ${u.isOnline ? 'text-[#00a884]' : muted}`}>{presence}</p>}
              {u.location && (
                <p className={`mt-1 flex items-center gap-1 text-sm ${muted}`}><MapPin className="h-3.5 w-3.5" />{u.location}</p>
              )}

              {/* Primary actions depend on the relationship and the other person's privacy choices */}
              <div className="mt-4 flex w-full flex-wrap justify-center gap-2">
                {data.blockedByMe ? (
                  <Button onClick={toggleBlock} disabled={busy} className="bg-[#00a884] hover:bg-[#06cf9c] text-white">Unblock to chat</Button>
                ) : data.request?.direction === 'incoming' ? (
                  <>
                    <Button onClick={() => respond('accept')} disabled={busy} className="bg-[#00a884] hover:bg-[#06cf9c] text-white"><Check className="mr-1.5 h-4 w-4" />Accept</Button>
                    <Button variant="outline" onClick={() => respond('decline')} disabled={busy}>Decline</Button>
                  </>
                ) : data.request?.direction === 'outgoing' ? (
                  <>
                    <Button variant="secondary" disabled><Clock className="mr-1.5 h-4 w-4" />Request sent</Button>
                    <Button variant="outline" onClick={() => respond('cancel')} disabled={busy}>Cancel request</Button>
                  </>
                ) : data.canMessage ? (
                  <>
                    <Button onClick={openChat} disabled={busy} className="bg-[#00a884] hover:bg-[#06cf9c] text-white"><MessageCircle className="mr-1.5 h-4 w-4" />Message</Button>
                    {data.relationship === 'connected' && onStartCall && (
                      <>
                        <Button variant="outline" size="icon" onClick={() => { onStartCall('audio'); onClose() }} aria-label="Voice call"><Phone className="h-4 w-4" /></Button>
                        <Button variant="outline" size="icon" onClick={() => { onStartCall('video'); onClose() }} aria-label="Video call"><Video className="h-4 w-4" /></Button>
                      </>
                    )}
                  </>
                ) : data.canRequest ? (
                  <Button onClick={() => setMode('request')} className="bg-[#00a884] hover:bg-[#06cf9c] text-white"><Sparkles className="mr-1.5 h-4 w-4" />Send message request</Button>
                ) : (
                  <p className={`flex items-center gap-1.5 text-sm ${muted}`}><Lock className="h-4 w-4" />Not accepting new messages</p>
                )}
              </div>
            </div>

            {data.request?.direction === 'incoming' && (
              <div className={`mt-2 px-6 py-4 ${section}`}>
                <div className={`mb-1 text-xs ${muted}`}>Their intro</div>
                <p className="text-sm whitespace-pre-wrap break-words">{data.request.message}</p>
              </div>
            )}

            <div className={`mt-2 space-y-4 px-6 py-4 ${section}`}>
              <div>
                <div className={`mb-1 text-xs ${muted}`}>About</div>
                {u.bio ? <p className="text-sm whitespace-pre-wrap break-words">{u.bio}</p> : <p className={`flex items-center gap-1.5 text-sm ${muted}`}><Lock className="h-3.5 w-3.5" />Hidden</p>}
              </div>
              {interests.length > 0 && (
                <div>
                  <div className={`mb-1.5 text-xs ${muted}`}>Interests</div>
                  <div className="flex flex-wrap gap-1.5">
                    {interests.map(i => (
                      <span key={i} className={`rounded-full px-2.5 py-1 text-xs ${dark ? 'bg-[#202c33]' : 'bg-[#f0f2f5]'}`}>{i}</span>
                    ))}
                  </div>
                </div>
              )}
              {u.phone && <p className="flex items-center gap-2 text-sm"><Phone className={`h-4 w-4 ${muted}`} />{u.phone}</p>}
              {u.email && <p className="flex items-center gap-2 text-sm break-all"><Mail className={`h-4 w-4 flex-shrink-0 ${muted}`} />{u.email}</p>}
              {u.joinedAt && <p className={`text-xs ${muted}`}>Joined {format(new Date(u.joinedAt), 'MMMM yyyy')}</p>}
            </div>

            {data.sharedGroups.length > 0 && (
              <div className={`mt-2 px-6 py-4 ${section}`}>
                <div className={`mb-2 text-xs ${muted}`}>{data.sharedGroups.length} group{data.sharedGroups.length > 1 ? 's' : ''} in common</div>
                {data.sharedGroups.map(g => (
                  <button key={g.id} type="button" onClick={() => { onOpenConversation(g.id); onClose() }} className="flex w-full items-center gap-3 rounded-lg py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5">
                    {g.imageUrl ? <img src={g.imageUrl} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#dfe5e7] dark:bg-[#6a7175]"><Users className="h-4 w-4" /></span>}
                    <span className="text-sm truncate">{g.name}</span>
                  </button>
                ))}
              </div>
            )}

            <div className={`mt-2 mb-2 px-3 py-2 ${section}`}>
              <button type="button" onClick={toggleBlock} disabled={busy} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-red-500 hover:bg-red-500/10">
                <Ban className="h-5 w-5" /> {data.blockedByMe ? `Unblock ${u.name}` : `Block ${u.name}`}
              </button>
              <button type="button" onClick={() => setMode('report')} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-red-500 hover:bg-red-500/10">
                <Flag className="h-5 w-5" /> Report {u.name}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
