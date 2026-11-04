'use client'

import { useCallback, useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { Inbox, Send } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { Avatar, type PublicProfile } from './PersonProfileDialog'

interface RequestItem {
  id: string
  message: string
  createdAt: string
  user: PublicProfile
}

interface Props {
  onOpenProfile: (userId: string) => void
  onOpenConversation: (conversationId: string) => void
  onCountChange: (incoming: number) => void
  refreshKey?: number
}

export function RequestsPanel({ onOpenProfile, onOpenConversation, onCountChange, refreshKey }: Props) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming')
  const [incoming, setIncoming] = useState<RequestItem[]>([])
  const [outgoing, setOutgoing] = useState<RequestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/requests')
      const d = await r.json()
      if (!r.ok) throw new Error()
      setIncoming(d.incoming)
      setOutgoing(d.outgoing)
      onCountChange(d.incoming.length)
    } catch {
      toast.error('Could not load requests')
    } finally {
      setLoading(false)
    }
  }, [onCountChange])

  useEffect(() => { load() }, [load, refreshKey])

  const act = async (item: RequestItem, action: 'accept' | 'decline' | 'cancel') => {
    setBusyId(item.id)
    try {
      const r = await fetch(`/api/requests/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error)
      if (action === 'accept' && d.conversationId) {
        toast.success(`You can now chat with ${item.user.name}`)
        onOpenConversation(d.conversationId)
      }
      await load()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'Something went wrong')
    } finally {
      setBusyId(null)
    }
  }

  const list = tab === 'incoming' ? incoming : outgoing
  const muted = dark ? 'text-[#8696a0]' : 'text-[#667781]'

  return (
    <div className={`flex h-full flex-col ${dark ? 'bg-[#0b141a] text-[#e9edef]' : 'bg-[#f0f2f5] text-[#111b21]'}`}>
      <div className={`px-4 pt-5 ${dark ? 'bg-[#111b21] border-[#222d34]' : 'bg-white border-[#e9edef]'} border-b`}>
        <h2 className="text-xl font-semibold">Message requests</h2>
        <p className={`mt-1 text-sm ${muted}`}>People you don&apos;t chat with yet. They can&apos;t see if you read their intro until you accept.</p>
        <div className="mt-3 flex gap-6">
          {(['incoming', 'outgoing'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 pb-2 text-sm font-medium transition-colors ${tab === t ? 'border-[#00a884] text-[#00a884]' : `border-transparent ${muted}`}`}
            >
              {t === 'incoming' ? `Received${incoming.length ? ` (${incoming.length})` : ''}` : `Sent${outgoing.length ? ` (${outgoing.length})` : ''}`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className={`h-28 animate-pulse rounded-xl ${dark ? 'bg-[#111b21]' : 'bg-white'}`} />)
        ) : list.length === 0 ? (
          <div className={`flex flex-col items-center py-16 text-center ${muted}`}>
            {tab === 'incoming' ? <Inbox className="mb-3 h-10 w-10 opacity-40" /> : <Send className="mb-3 h-10 w-10 opacity-40" />}
            <p className="text-sm">{tab === 'incoming' ? 'No new requests' : 'You haven\'t sent any requests. Find people in Discover.'}</p>
          </div>
        ) : (
          list.map(item => (
            <div key={item.id} className={`rounded-xl p-4 shadow-sm ${dark ? 'bg-[#111b21]' : 'bg-white'}`}>
              <button type="button" onClick={() => onOpenProfile(item.user.id)} className="flex w-full items-center gap-3 text-left">
                <Avatar name={item.user.name} src={item.user.imageUrl} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{item.user.name}</div>
                  <div className={`text-xs ${muted}`}>{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })} · View profile</div>
                </div>
              </button>
              <p className={`mt-3 rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${dark ? 'bg-[#202c33]' : 'bg-[#f0f2f5]'}`}>{item.message}</p>
              <div className="mt-3 flex gap-2">
                {tab === 'incoming' ? (
                  <>
                    <button type="button" disabled={busyId === item.id} onClick={() => act(item, 'accept')} className="flex-1 rounded-full bg-[#00a884] py-2 text-sm font-medium text-white hover:bg-[#06cf9c] disabled:opacity-50">Accept</button>
                    <button type="button" disabled={busyId === item.id} onClick={() => act(item, 'decline')} className={`flex-1 rounded-full border py-2 text-sm font-medium disabled:opacity-50 ${dark ? 'border-[#2a3942]' : 'border-[#d1d7db]'}`}>Decline</button>
                    <button type="button" onClick={() => onOpenProfile(item.user.id)} className="rounded-full px-3 py-2 text-sm text-red-500 hover:bg-red-500/10">Block…</button>
                  </>
                ) : (
                  <button type="button" disabled={busyId === item.id} onClick={() => act(item, 'cancel')} className={`rounded-full border px-4 py-2 text-sm disabled:opacity-50 ${dark ? 'border-[#2a3942]' : 'border-[#d1d7db]'}`}>Cancel request</button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
