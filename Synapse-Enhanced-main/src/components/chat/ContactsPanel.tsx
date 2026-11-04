'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Compass, Search, Users } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { Avatar, formatPresence } from '@/components/people/PersonProfileDialog'
import { CreateGroupModal } from './CreateGroupModal'

interface ContactsPanelProps {
  onSelectConversation: (conversation: any) => void
  onOpenProfile: (userId: string) => void
  onDiscover: () => void
}

interface Contact {
  id: string
  name: string
  imageUrl: string | null
  bio: string | null
  isOnline: boolean
  lastSeen: string | null
}

/** People you already share a chat or group with. Strangers are found in Discover. */
export function ContactsPanel({ onSelectConversation, onOpenProfile, onDiscover }: ContactsPanelProps) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const [contacts, setContacts] = useState<Contact[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCreateGroup, setShowCreateGroup] = useState(false)

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`)
        const d = await r.json()
        if (!r.ok) throw new Error(d.error)
        setContacts(d.users || [])
      } catch {
        toast.error('Could not load contacts')
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const openChat = async (c: Contact) => {
    const r = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantId: c.id }),
    })
    const d = await r.json().catch(() => ({}))
    if (r.ok && d.conversation) return onSelectConversation(d.conversation)
    // e.g. they only share a group with you and accept requests only
    if (d.code === 'REQUEST_REQUIRED' || d.code === 'NOT_ACCEPTING' || d.code === 'BLOCKED') return onOpenProfile(c.id)
    toast.error(d.error || 'Could not open chat')
  }

  const muted = dark ? 'text-[#8696a0]' : 'text-[#667781]'

  return (
    <div className={`flex h-full flex-col ${dark ? 'bg-[#111b21] text-[#e9edef]' : 'bg-white text-[#111b21]'}`}>
      <div className={`px-4 pt-5 pb-3 border-b ${dark ? 'border-[#222d34]' : 'border-[#e9edef]'}`}>
        <h2 className="text-xl font-semibold">Contacts</h2>
        <p className={`mt-1 text-sm ${muted}`}>People you already chat with or share a group with.</p>
        <div className={`mt-3 flex items-center gap-2 rounded-lg px-3 ${dark ? 'bg-[#202c33]' : 'bg-[#f0f2f5]'}`}>
          <Search className={`h-4 w-4 ${muted}`} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search contacts" className="h-9 flex-1 min-w-0 bg-transparent text-sm outline-none" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <button type="button" onClick={() => setShowCreateGroup(true)} className={`flex w-full items-center gap-4 px-4 py-3 text-left ${dark ? 'hover:bg-[#202c33]' : 'hover:bg-[#f5f6f6]'}`}>
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#00a884]"><Users className="h-5 w-5 text-white" /></span>
          <span className="font-medium">New group</span>
        </button>
        <button type="button" onClick={onDiscover} className={`flex w-full items-center gap-4 px-4 py-3 text-left ${dark ? 'hover:bg-[#202c33]' : 'hover:bg-[#f5f6f6]'}`}>
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#00a884]"><Compass className="h-5 w-5 text-white" /></span>
          <span>
            <span className="block font-medium">Find new people</span>
            <span className={`block text-xs ${muted}`}>Browse profiles in Discover</span>
          </span>
        </button>

        <div className={`px-4 pt-4 pb-2 text-sm text-[#00a884]`}>{loading ? 'Loading…' : `${contacts.length} contact${contacts.length === 1 ? '' : 's'}`}</div>

        {!loading && contacts.length === 0 && (
          <p className={`px-8 py-8 text-center text-sm ${muted}`}>
            {query ? 'No contacts match that name.' : 'No contacts yet. When someone accepts your request or you join a group together, they show up here.'}
          </p>
        )}

        {contacts.map(c => {
          const presence = formatPresence(c)
          return (
            <div key={c.id} className={`flex items-center gap-3 px-4 ${dark ? 'hover:bg-[#202c33]' : 'hover:bg-[#f5f6f6]'}`}>
              <button type="button" onClick={() => onOpenProfile(c.id)} className="relative py-2.5 flex-shrink-0" aria-label={`View ${c.name}'s profile`}>
                <Avatar name={c.name} src={c.imageUrl} size={48} />
                {c.isOnline && <span className={`absolute bottom-3 right-0 h-3 w-3 rounded-full bg-[#25d366] ring-2 ${dark ? 'ring-[#111b21]' : 'ring-white'}`} />}
              </button>
              <button type="button" onClick={() => openChat(c)} className={`min-w-0 flex-1 border-b py-3 text-left ${dark ? 'border-[#222d34]' : 'border-[#e9edef]'}`}>
                <div className="truncate">{c.name}</div>
                <div className={`truncate text-sm ${muted}`}>{c.bio || presence || ' '}</div>
              </button>
            </div>
          )
        })}
      </div>

      <CreateGroupModal
        isOpen={showCreateGroup}
        onClose={() => setShowCreateGroup(false)}
        onGroupCreated={(group: any) => onSelectConversation(group)}
      />
    </div>
  )
}
