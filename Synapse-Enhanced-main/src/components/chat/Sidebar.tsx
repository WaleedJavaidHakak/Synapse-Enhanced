'use client'

import { useState, useEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import { Compass, Inbox, MessageCircle, MoreVertical, Search, ShieldCheck, UserRound, Users, X } from 'lucide-react'
import { useUserSync } from '@/hooks/useUserSync'
import { useTheme } from '@/contexts/ThemeContext'
import { Button } from '@/components/ui/button'
import { ConversationList } from '@/components/chat/ConversationList'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { DarkModeToggle } from '@/components/ui/DarkModeToggle'
import { Avatar } from '@/components/people/PersonProfileDialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type Panel = 'chat' | 'contacts' | 'discover' | 'requests' | 'profile' | 'privacy'

interface Conversation {
  id: string
  type?: 'DIRECT' | 'GROUP'
  name: string
  imageUrl?: string | null
  lastMessage?: {
    content: string
    timestamp: string
    senderId: string
    senderName: string
    messageId?: string
  } | null
  unreadCount: number
  isOnline: boolean
  lastSeen?: string | null
  participants: Array<{
    id: string
    name: string
    imageUrl?: string | null
  }>
  matchCount?: number
}

interface SidebarProps {
  selectedConversation: string | null
  onSelectConversation: (id: string | null) => void
  activePanel: Panel
  onPanelChange: (panel: Panel) => void
  conversations: Conversation[]
  isLoadingConversations?: boolean
  isConnected?: boolean
  requestCount?: number
  connectionError?: string | null
}

const TABS: Array<{ panel: Panel; label: string; Icon: typeof MessageCircle }> = [
  { panel: 'chat', label: 'Chats', Icon: MessageCircle },
  { panel: 'contacts', label: 'Contacts', Icon: Users },
  { panel: 'discover', label: 'Discover', Icon: Compass },
  { panel: 'requests', label: 'Requests', Icon: Inbox },
  { panel: 'profile', label: 'Profile', Icon: UserRound },
]

export function Sidebar({
  selectedConversation,
  onSelectConversation,
  activePanel,
  onPanelChange,
  conversations = [],
  isLoadingConversations = false,
  isConnected = false,
  requestCount = 0,
  connectionError = null,
}: SidebarProps) {
  const { user } = useUser()
  const { dbUser } = useUserSync()
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Conversation[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unread' | 'groups'>('all')

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }
    const timeoutId = setTimeout(async () => {
      setIsSearching(true)
      try {
        const response = await fetch(`/api/conversations/search?q=${encodeURIComponent(searchQuery)}`)
        if (response.ok) setSearchResults((await response.json()).conversations || [])
      } catch {
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 300)
    return () => clearTimeout(timeoutId)
  }, [searchQuery])

  const muted = dark ? 'text-[#aebac1]' : 'text-[#54656f]'
  const visible = searchQuery.trim()
    ? searchResults
    : conversations.filter(c => filter === 'all' || (filter === 'unread' ? c.unreadCount > 0 : c.type === 'GROUP'))
  const unreadChats = conversations.filter(c => c.unreadCount > 0).length

  return (
    <div className={`w-full md:w-[380px] lg:w-[420px] h-full flex flex-col flex-shrink-0 border-r ${dark ? 'bg-[#111b21] border-[#222d34]' : 'bg-white border-[#d1d7db]'}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 h-[60px] flex-shrink-0 ${dark ? 'bg-[#202c33]' : 'bg-[#f0f2f5]'}`}>
        <button type="button" onClick={() => onPanelChange('profile')} className="flex items-center gap-3 min-w-0" aria-label="Your profile">
          <Avatar name={dbUser?.name || user?.fullName || 'Me'} src={dbUser?.imageUrl || user?.imageUrl} size={40} />
          <div className="min-w-0 text-left">
            <div className={`truncate text-sm font-medium ${dark ? 'text-[#e9edef]' : 'text-[#111b21]'}`}>{dbUser?.name || user?.fullName}</div>
            <div className={`flex items-center gap-1.5 text-xs ${dark ? 'text-[#8696a0]' : 'text-[#667781]'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${isConnected && !connectionError ? 'bg-[#25d366]' : 'bg-amber-500'}`} />
              <span className="truncate">{connectionError && isConnected ? connectionError : isConnected ? 'Connected' : 'Connecting…'}</span>
            </div>
          </div>
        </button>
        <div className="flex items-center gap-1">
          <DarkModeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full" aria-label="Menu">
                <MoreVertical className={`h-5 w-5 ${muted}`} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => onPanelChange('profile')}>
                <UserRound className="mr-2 h-4 w-4" /> Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPanelChange('privacy')}>
                <ShieldCheck className="mr-2 h-4 w-4" /> Privacy
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <SignOutButton variant="ghost" className="w-full justify-start px-2 font-normal text-red-600 hover:text-red-700" />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tabs */}
      <nav className={`grid grid-cols-5 flex-shrink-0 border-b ${dark ? 'border-[#222d34]' : 'border-[#e9edef]'}`} aria-label="Sections">
        {TABS.map(({ panel, label, Icon }) => {
          const active = activePanel === panel || (panel === 'profile' && activePanel === 'privacy')
          const badge = panel === 'requests' ? requestCount : panel === 'chat' ? unreadChats : 0
          return (
            <button
              key={panel}
              type="button"
              onClick={() => onPanelChange(panel)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] transition-colors ${active ? 'text-[#00a884]' : muted} hover:bg-black/[0.03] dark:hover:bg-white/[0.03]`}
            >
              <span className="relative">
                <Icon className="h-5 w-5" />
                {badge > 0 && (
                  <span className="absolute -right-2.5 -top-1.5 min-w-[18px] rounded-full bg-[#25d366] px-1 text-center text-[10px] font-semibold leading-[18px] text-white">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
              {label}
              {active && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t bg-[#00a884]" />}
            </button>
          )
        })}
      </nav>

      {/* Search + filters (chat list only) */}
      <div className="px-3 pt-2 pb-1 flex-shrink-0">
        <div className={`flex items-center gap-3 rounded-lg px-3 ${dark ? 'bg-[#202c33]' : 'bg-[#f0f2f5]'}`}>
          {isSearching
            ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#00a884] border-t-transparent" />
            : <Search className={`h-4 w-4 ${muted}`} />}
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats and messages"
            className={`h-9 flex-1 min-w-0 bg-transparent text-sm outline-none ${dark ? 'text-[#e9edef] placeholder:text-[#8696a0]' : 'text-[#111b21] placeholder:text-[#667781]'}`}
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear search" className={muted}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {!searchQuery && (
          <div className="mt-2 flex gap-2">
            {(['all', 'unread', 'groups'] as const).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${filter === f
                  ? (dark ? 'bg-[#0a332c] text-[#00a884]' : 'bg-[#e7fce3] text-[#008069]')
                  : (dark ? 'bg-[#202c33] text-[#8696a0]' : 'bg-[#f0f2f5] text-[#54656f]')}`}
              >
                {f === 'all' ? 'All' : f === 'unread' ? 'Unread' : 'Groups'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <ConversationList
          searchQuery={searchQuery}
          selectedConversation={activePanel === 'chat' ? selectedConversation : null}
          onSelectConversation={onSelectConversation}
          currentUserId={dbUser?.id}
          conversations={visible as any}
          isLoading={isSearching || isLoadingConversations}
        />
      </div>

    </div>
  )
}
