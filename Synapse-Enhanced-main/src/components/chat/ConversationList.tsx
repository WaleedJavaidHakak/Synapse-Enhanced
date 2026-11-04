'use client'

import { memo } from 'react'
import { format, isToday, isYesterday } from 'date-fns'
import { Users } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { Avatar } from '@/components/people/PersonProfileDialog'

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
    senderImageUrl?: string
    messageId?: string
  } | null
  unreadCount: number
  isOnline: boolean
  isBlocked?: boolean
  participants: Array<{
    id: string
    name: string
    imageUrl?: string | null
  }>
  matchCount?: number
}

interface ConversationListProps {
  searchQuery: string
  selectedConversation: string | null
  onSelectConversation: (conversationId: string) => void
  conversations: Conversation[]
  isLoading?: boolean
  currentUserId?: string
}

function formatTime(timestamp?: string) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  if (isToday(date)) return format(date, 'HH:mm')
  if (isYesterday(date)) return 'Yesterday'
  if (Date.now() - date.getTime() < 6 * 24 * 3600 * 1000) return format(date, 'EEEE')
  return format(date, 'dd/MM/yyyy')
}

function highlight(text: string, query: string) {
  if (!query.trim()) return text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.split(new RegExp(`(${escaped})`, 'gi')).map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? <mark key={i} className="bg-transparent font-semibold text-[#00a884]">{part}</mark> : part
  )
}

function ConversationListInner({
  searchQuery,
  selectedConversation,
  onSelectConversation,
  conversations,
  isLoading = false,
  currentUserId,
}: ConversationListProps) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const muted = dark ? 'text-[#8696a0]' : 'text-[#667781]'

  if (isLoading && conversations.length === 0) {
    return (
      <div className="space-y-1 p-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-2">
            <div className={`h-12 w-12 rounded-full animate-pulse ${dark ? 'bg-[#202c33]' : 'bg-[#f0f2f5]'}`} />
            <div className="flex-1 space-y-2">
              <div className={`h-3 w-1/3 rounded animate-pulse ${dark ? 'bg-[#202c33]' : 'bg-[#f0f2f5]'}`} />
              <div className={`h-3 w-2/3 rounded animate-pulse ${dark ? 'bg-[#202c33]' : 'bg-[#f0f2f5]'}`} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (conversations.length === 0) {
    return (
      <div className={`px-8 py-12 text-center text-sm ${muted}`}>
        {searchQuery.trim() ? 'No chats or messages found' : 'No chats here yet'}
      </div>
    )
  }

  return (
    <ul>
      {conversations.map((conv) => {
        const isSelected = selectedConversation === conv.id
        const isGroup = conv.type === 'GROUP'
        const last = conv.lastMessage
        const fromMe = !!last && last.senderId === currentUserId
        const unread = conv.unreadCount > 0
        const prefix = last ? (fromMe ? 'You: ' : isGroup ? `${last.senderName.split(' ')[0]}: ` : '') : ''

        return (
          <li key={conv.id}>
            <button
              type="button"
              onClick={() => onSelectConversation(conv.id)}
              className={`flex w-full items-center gap-3 pl-3 text-left transition-colors ${isSelected
                ? (dark ? 'bg-[#2a3942]' : 'bg-[#f0f2f5]')
                : (dark ? 'hover:bg-[#202c33]' : 'hover:bg-[#f5f6f6]')}`}
            >
              <div className="relative flex-shrink-0 py-2.5">
                {isGroup && !conv.imageUrl ? (
                  <div className={`flex h-12 w-12 items-center justify-center rounded-full ${dark ? 'bg-[#6a7175]' : 'bg-[#dfe5e7]'}`}>
                    <Users className={`h-6 w-6 ${dark ? 'text-[#d1d7db]' : 'text-[#54656f]'}`} />
                  </div>
                ) : (
                  <Avatar name={conv.name} src={conv.imageUrl} size={48} />
                )}
                {conv.isOnline && !isGroup && (
                  <span className={`absolute bottom-3 right-0 h-3 w-3 rounded-full bg-[#25d366] ring-2 ${dark ? 'ring-[#111b21]' : 'ring-white'}`} />
                )}
              </div>

              <div className={`min-w-0 flex-1 border-b py-3 pr-3 ${dark ? 'border-[#222d34]' : 'border-[#e9edef]'}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-[16px] ${dark ? 'text-[#e9edef]' : 'text-[#111b21]'}`}>
                    {highlight(conv.name || (isGroup ? 'Untitled group' : 'Unknown'), searchQuery)}
                  </span>
                  {last && (
                    <span className={`flex-shrink-0 text-xs ${unread ? 'text-[#25d366] font-medium' : muted}`}>{formatTime(last.timestamp)}</span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className={`truncate text-sm ${unread ? (dark ? 'text-[#e9edef]' : 'text-[#111b21]') : muted}`}>
                    {conv.isBlocked
                      ? 'Blocked'
                      : last
                        ? <>{prefix}{highlight(last.content, searchQuery)}</>
                        : <span className="italic">No messages yet</span>}
                  </span>
                  {searchQuery.trim() && conv.matchCount ? (
                    <span className={`flex-shrink-0 text-xs ${muted}`}>{conv.matchCount} match{conv.matchCount > 1 ? 'es' : ''}</span>
                  ) : unread ? (
                    <span className="flex-shrink-0 min-w-[20px] rounded-full bg-[#25d366] px-1.5 text-center text-xs font-semibold leading-5 text-white">
                      {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                    </span>
                  ) : null}
                </div>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export const ConversationList = memo(ConversationListInner)
