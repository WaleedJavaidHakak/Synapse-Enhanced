'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Compass, EyeOff, MapPin, Search, ShieldCheck } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { Avatar, formatPresence, type PublicProfile } from './PersonProfileDialog'

type Person = PublicProfile & { relationship: 'connected' | 'request_sent' | 'request_received' | 'none' | 'self' }

const BADGES: Record<string, { label: string; className: string }> = {
  connected: { label: 'In your chats', className: 'bg-emerald-500/10 text-emerald-600' },
  request_sent: { label: 'Request sent', className: 'bg-amber-500/10 text-amber-600' },
  request_received: { label: 'Wants to chat', className: 'bg-sky-500/10 text-sky-600' },
}

interface Props {
  onOpenProfile: (userId: string) => void
  onOpenPrivacy: () => void
  /** Bumped by the parent when relationships change, to refresh badges */
  refreshKey?: number
}

export function DiscoverPanel({ onOpenProfile, onOpenPrivacy, refreshKey }: Props) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const [query, setQuery] = useState('')
  const [onlineOnly, setOnlineOnly] = useState(false)
  const [people, setPeople] = useState<Person[]>([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [discoverable, setDiscoverable] = useState(true)
  const requestId = useRef(0)

  const load = useCallback(async (nextPage: number) => {
    const id = ++requestId.current
    setLoading(true)
    try {
      const params = new URLSearchParams({ q: query, page: String(nextPage), ...(onlineOnly ? { online: '1' } : {}) })
      const r = await fetch(`/api/discover?${params}`)
      const d = await r.json()
      if (id !== requestId.current) return // a newer search replaced this one
      if (!r.ok) throw new Error()
      // Merge by id so a person never appears twice if the list shifted between pages
      setPeople(prev => (nextPage === 0 ? d.people : [...prev, ...d.people.filter((p: Person) => !prev.some(x => x.id === p.id))]))
      setHasMore(d.hasMore)
      setPage(nextPage)
      setDiscoverable(d.discoverable !== false)
    } catch {
      if (id === requestId.current) setPeople([])
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [query, onlineOnly])

  useEffect(() => {
    const t = setTimeout(() => load(0), 250)
    return () => clearTimeout(t)
  }, [load, refreshKey])

  const muted = dark ? 'text-[#8696a0]' : 'text-[#667781]'
  const card = dark ? 'bg-[#111b21] hover:bg-[#202c33]' : 'bg-white hover:bg-[#f5f6f6]'

  return (
    <div className={`flex h-full flex-col ${dark ? 'bg-[#0b141a] text-[#e9edef]' : 'bg-[#f0f2f5] text-[#111b21]'}`}>
      <div className={`px-4 pt-5 pb-3 ${dark ? 'bg-[#111b21]' : 'bg-white'} border-b ${dark ? 'border-[#222d34]' : 'border-[#e9edef]'}`}>
        <div className="flex items-center gap-2">
          <Compass className="h-6 w-6 text-[#00a884]" />
          <h2 className="text-xl font-semibold">Discover people</h2>
        </div>
        <p className={`mt-1 text-sm ${muted}`}>Meet new people. You only see what they choose to share, and they decide whether to chat.</p>
        <div className="mt-3 flex items-center gap-2">
          <div className={`flex flex-1 items-center gap-2 rounded-lg px-3 ${dark ? 'bg-[#202c33]' : 'bg-[#f0f2f5]'}`}>
            <Search className={`h-4 w-4 ${muted}`} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name, interest or place"
              className="h-9 flex-1 min-w-0 bg-transparent text-sm outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => setOnlineOnly(v => !v)}
            className={`h-9 rounded-lg px-3 text-sm whitespace-nowrap transition-colors ${onlineOnly ? 'bg-[#00a884] text-white' : dark ? 'bg-[#202c33]' : 'bg-[#f0f2f5]'}`}
            aria-pressed={onlineOnly}
          >
            Online now
          </button>
        </div>
      </div>

      {!discoverable && (
        <button type="button" onClick={onOpenPrivacy} className={`mx-4 mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${dark ? 'bg-[#182229]' : 'bg-[#fff7e5]'}`}>
          <EyeOff className="h-4 w-4 flex-shrink-0 text-amber-500" />
          <span>You&apos;re hidden from Discover, so others can&apos;t find you here. <span className="text-[#00a884]">Change</span></span>
        </button>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {loading && people.length === 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`h-[120px] animate-pulse rounded-xl ${dark ? 'bg-[#111b21]' : 'bg-white'}`} />
            ))}
          </div>
        ) : people.length === 0 ? (
          <div className={`flex flex-col items-center py-16 text-center ${muted}`}>
            <Compass className="mb-3 h-10 w-10 opacity-40" />
            <p className="text-sm">{query || onlineOnly ? 'No one matches that search' : 'No one is discoverable yet. Invite friends to join!'}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {people.map(p => {
                const presence = formatPresence(p)
                const badge = BADGES[p.relationship]
                const interests = p.interests?.split(',').map(s => s.trim()).filter(Boolean).slice(0, 3) || []
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onOpenProfile(p.id)}
                    className={`flex gap-3 rounded-xl p-3 text-left shadow-sm transition-colors ${card}`}
                  >
                    <div className="relative">
                      <Avatar name={p.name} src={p.imageUrl} size={52} />
                      {p.isOnline && <span className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-[#25d366] ring-2 ${dark ? 'ring-[#111b21]' : 'ring-white'}`} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{p.name}</span>
                        {badge && <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}>{badge.label}</span>}
                      </div>
                      {presence && <div className={`text-xs ${p.isOnline ? 'text-[#00a884]' : muted}`}>{presence}</div>}
                      {p.bio && <p className={`mt-1 line-clamp-2 text-sm ${muted}`}>{p.bio}</p>}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {p.location && <span className={`flex items-center gap-0.5 text-xs ${muted}`}><MapPin className="h-3 w-3" />{p.location}</span>}
                        {interests.map(i => (
                          <span key={i} className={`rounded-full px-2 py-0.5 text-[11px] ${dark ? 'bg-[#202c33]' : 'bg-[#f0f2f5]'}`}>{i}</span>
                        ))}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
            {hasMore && (
              <div className="mt-4 flex justify-center">
                <button type="button" disabled={loading} onClick={() => load(page + 1)} className="rounded-full bg-[#00a884] px-5 py-2 text-sm text-white disabled:opacity-50">
                  {loading ? 'Loading…' : 'Show more'}
                </button>
              </div>
            )}
          </>
        )}
        <button type="button" onClick={onOpenPrivacy} className={`mx-auto mt-6 flex items-center gap-1.5 text-xs ${muted} hover:underline`}>
          <ShieldCheck className="h-3.5 w-3.5" /> Control what others can see in Privacy settings
        </button>
      </div>
    </div>
  )
}
