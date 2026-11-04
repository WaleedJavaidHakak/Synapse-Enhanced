'use client'

import { useEffect, useState, useRef, useCallback, useMemo, Fragment } from 'react'
import { toast } from 'sonner'
import { format, isToday, isYesterday, isSameDay } from 'date-fns'
import { ArrowLeft, Ban, ChevronDown, Flag, Info, MoreVertical, Phone, Users, Video } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { DbUser } from '@/hooks/useUserSync'
import { Avatar } from '@/components/people/PersonProfileDialog'
import MessageBubble, { type ChatMessage } from './MessageBubble'
import { Composer } from './Composer'
import { TypingIndicator } from './TypingIndicator'
import { GroupInfoDrawer } from './GroupInfoDrawer'

interface ConversationSummary {
  id: string
  type?: 'DIRECT' | 'GROUP'
  name: string
  imageUrl?: string | null
}

interface ChatWindowProps {
  conversation: {
    id: string
    type?: 'DIRECT' | 'GROUP'
    name?: string
    imageUrl?: string | null
    description?: string | null
    isOnline?: boolean
    lastSeen?: string | null
    presenceHidden?: boolean
    isBlocked?: boolean
    otherUserId?: string
    participants?: Array<{ id: string; name: string; imageUrl?: string | null }>
  }
  socket: any
  isConnected: boolean
  me: DbUser | null
  onlineUserIds: Set<string>
  conversations: ConversationSummary[]
  onBack: () => void
  onStartCall: (type: 'audio' | 'video') => void
  onGroupChanged: () => void
  onOpenProfile: (userId: string) => void
}

function formatLastSeen(lastSeen?: string | null) {
  if (!lastSeen) return ''
  const date = new Date(lastSeen)
  if (Number.isNaN(date.getTime())) return ''
  if (isToday(date)) return `last seen today at ${format(date, 'HH:mm')}`
  if (isYesterday(date)) return `last seen yesterday at ${format(date, 'HH:mm')}`
  return `last seen ${format(date, 'MMM d')} at ${format(date, 'HH:mm')}`
}

function dayLabel(date: Date) {
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'MMMM d, yyyy')
}

const PAGE_SIZE = 50
const newClientId = () => `tmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

function kindOf(file: File): 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' {
  if (file.type.startsWith('image/')) return 'IMAGE'
  if (file.type.startsWith('video/')) return 'VIDEO'
  if (file.type.startsWith('audio/')) return 'AUDIO'
  return 'FILE'
}

/** Put the saved copy in place of the optimistic one, keeping any ticks/reactions that arrived first. */
function mergeSaved(existing: ChatMessage, saved: ChatMessage): ChatMessage {
  return {
    ...saved,
    isDelivered: saved.isDelivered || existing.isDelivered,
    isRead: saved.isRead || existing.isRead,
    reactions: existing.reactions?.length ? existing.reactions : saved.reactions,
    pending: false,
    failed: false,
  }
}

/** Keep the first copy of each message id (an optimistic copy and its saved copy can briefly coexist). */
function uniqueById(list: ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>()
  return list.filter(m => (seen.has(m.id) ? false : (seen.add(m.id), true)))
}

/**
 * Merge a freshly fetched latest page into what is on screen: server copies win, older history stays,
 * and anything newer that isn't in the page (still sending, failed, or just arrived) is kept at the end.
 */
function mergeLatest(prev: ChatMessage[], fetched: ChatMessage[]): ChatMessage[] {
  const byId = new Map(prev.map(m => [m.id, m]))
  const fetchedIds = new Set(fetched.map(m => m.id))
  const firstTs = fetched[0] ? new Date(fetched[0].createdAt).getTime() : Infinity
  const older = prev.filter(m => !m.pending && !m.failed && !fetchedIds.has(m.id) && new Date(m.createdAt).getTime() < firstTs)
  const merged = fetched.map(m => {
    const old = byId.get(m.id)
    return old ? { ...m, isDelivered: m.isDelivered || old.isDelivered, isRead: m.isRead || old.isRead, clientId: old.clientId } : m
  })
  const newer = prev.filter(m => !fetchedIds.has(m.id) && (m.pending || m.failed || new Date(m.createdAt).getTime() >= firstTs))
  return uniqueById([...older, ...merged, ...newer])
}

export function ChatWindow({
  conversation, socket, isConnected, me, onlineUserIds, conversations, onBack, onStartCall, onGroupChanged, onOpenProfile,
}: ChatWindowProps) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const isGroup = conversation.type === 'GROUP'
  const dbUserId = me?.id || null
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoadingMessages, setIsLoadingMessages] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({})
  const [replyContext, setReplyContext] = useState<ChatMessage | null>(null)
  const [forwardSource, setForwardSource] = useState<ChatMessage | null>(null)
  const [forwardSearch, setForwardSearch] = useState('')
  const [editing, setEditing] = useState<ChatMessage | null>(null)
  const [editText, setEditText] = useState('')
  const [deleting, setDeleting] = useState<ChatMessage | null>(null)
  const [isGroupInfoOpen, setIsGroupInfoOpen] = useState(false)
  const [showJumpToBottom, setShowJumpToBottom] = useState(false)
  const [blockedByMe, setBlockedByMe] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)
  const typingTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const retryRef = useRef<Map<string, () => void>>(new Map())
  const replyRef = useRef<ChatMessage | null>(null)
  replyRef.current = replyContext

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  const markRead = useCallback(() => {
    if (document.hidden) return
    fetch('/api/messages/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: conversation.id })
    }).catch(() => {})
  }, [conversation.id])

  const endpoint = isGroup
    ? `/api/groups/${conversation.id}/messages`
    : `/api/conversations/${conversation.id}/messages`

  // Who blocked whom decides what the composer shows
  useEffect(() => {
    setBlockedByMe(false)
    if (isGroup || !conversation.isBlocked || !conversation.otherUserId) return
    fetch(`/api/users/profile?userId=${conversation.otherUserId}`)
      .then(r => r.json())
      .then(d => setBlockedByMe(!!d.blockedByMe))
      .catch(() => {})
  }, [isGroup, conversation.isBlocked, conversation.otherUserId])

  // Initial load
  useEffect(() => {
    let cancelled = false
    setIsLoadingMessages(true)
    setMessages([])
    fetch(`${endpoint}?limit=${PAGE_SIZE}`)
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(data => {
        if (cancelled) return
        // Merge rather than replace: something may have been sent or received while this loaded
        setMessages(prev => mergeLatest(prev, data.messages || []))
        setHasMore(!!data.hasMore)
        requestAnimationFrame(() => scrollToBottom())
        markRead()
      })
      .catch(() => { if (!cancelled) toast.error('Could not load messages') })
      .finally(() => { if (!cancelled) setIsLoadingMessages(false) })
    return () => { cancelled = true }
  }, [endpoint, scrollToBottom, markRead])

  const loadOlder = useCallback(async () => {
    const first = messages.find(m => !m.pending && !m.failed)
    if (!hasMore || isLoadingOlder || !first) return
    const el = scrollRef.current
    const prevHeight = el?.scrollHeight || 0
    setIsLoadingOlder(true)
    try {
      const r = await fetch(`${endpoint}?limit=${PAGE_SIZE}&before=${first.id}`)
      if (!r.ok) throw new Error()
      const data = await r.json()
      setMessages(prev => [...(data.messages || []), ...prev])
      setHasMore(!!data.hasMore)
      // Keep the viewport anchored on the message the user was looking at
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevHeight })
    } catch {
      toast.error('Could not load older messages')
    } finally {
      setIsLoadingOlder(false)
    }
  }, [endpoint, hasMore, isLoadingOlder, messages])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    nearBottomRef.current = distance < 120
    setShowJumpToBottom(distance > 400)
    if (el.scrollTop < 80) loadOlder()
  }

  useEffect(() => {
    const onVisible = () => { if (!document.hidden) markRead() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [markRead])

  const clearTyper = useCallback((userId: string) => {
    clearTimeout(typingTimeoutsRef.current[userId])
    setTypingUsers(prev => {
      if (!(userId in prev)) return prev
      const next = { ...prev }
      delete next[userId]
      return next
    })
  }, [])

  // Realtime
  useEffect(() => {
    if (!socket) return
    const convId = conversation.id
    const join = () => socket.emit(isGroup ? 'group:join' : 'join-conversation', convId)
    join()
    // After a reconnect: rejoin the room (rooms are lost) and fetch anything missed while offline
    const resync = () => {
      join()
      fetch(`${endpoint}?limit=${PAGE_SIZE}`)
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (!data) return
          setMessages(prev => mergeLatest(prev, data.messages || []))
          if (nearBottomRef.current) requestAnimationFrame(() => scrollToBottom(true))
          markRead()
        })
        .catch(() => {})
    }
    socket.on('authenticated', resync)

    const onNew = (message: ChatMessage) => {
      if (message.conversationId !== convId) return
      setMessages(prev => {
        // Our own message coming back from the server: swap out the optimistic copy
        if (message.clientId) {
          const i = prev.findIndex(m => m.clientId === message.clientId || m.id === message.clientId)
          if (i >= 0) {
            const next = [...prev]
            next[i] = mergeSaved(prev[i], message)
            return uniqueById(next)
          }
        }
        return prev.some(m => m.id === message.id) ? prev : [...prev, message]
      })
      clearTyper(message.sender.id)
      if (nearBottomRef.current) requestAnimationFrame(() => scrollToBottom(true))
      if (message.sender.id !== dbUserId) markRead()
    }
    const onUpdated = (message: ChatMessage) => {
      if (message.conversationId !== convId) return
      setMessages(prev => prev.map(m => (m.id === message.id ? { ...m, ...message } : m)))
    }
    const onStatus = (s: { conversationId: string; messageIds: string[]; isDelivered?: boolean; isRead?: boolean }) => {
      if (s.conversationId !== convId) return
      const ids = new Set(s.messageIds)
      setMessages(prev => prev.map(m => ids.has(m.id) ? {
        ...m,
        isDelivered: s.isDelivered ?? m.isDelivered,
        isRead: s.isRead ?? m.isRead,
      } : m))
    }
    const onReaction = ({ messageId, reactions }: { messageId: string; reactions: ChatMessage['reactions'] }) => {
      setMessages(prev => prev.map(m => (m.id === messageId ? { ...m, reactions } : m)))
    }
    const onTypingStart = (d: { conversationId?: string; userId: string; userName: string }) => {
      if (d.conversationId && d.conversationId !== convId) return
      if (d.userId === dbUserId) return
      setTypingUsers(prev => ({ ...prev, [d.userId]: d.userName }))
      clearTimeout(typingTimeoutsRef.current[d.userId])
      // Safety net in case the stop event is lost
      typingTimeoutsRef.current[d.userId] = setTimeout(() => clearTyper(d.userId), 6000)
    }
    const onTypingStop = (d: { conversationId?: string; userId: string }) => {
      if (d.conversationId && d.conversationId !== convId) return
      clearTyper(d.userId)
    }

    socket.on('message:new', onNew)
    socket.on('message:updated', onUpdated)
    socket.on('message:status', onStatus)
    socket.on('reaction:update', onReaction)
    socket.on('typing:start', onTypingStart)
    socket.on('typing:stop', onTypingStop)

    return () => {
      socket.off('authenticated', resync)
      socket.off('message:new', onNew)
      socket.off('message:updated', onUpdated)
      socket.off('message:status', onStatus)
      socket.off('reaction:update', onReaction)
      socket.off('typing:start', onTypingStart)
      socket.off('typing:stop', onTypingStop)
      socket.emit(isGroup ? 'group:leave' : 'leave-conversation', convId)
    }
  }, [socket, conversation.id, isGroup, dbUserId, clearTyper, scrollToBottom, markRead, endpoint])

  const handleTyping = useCallback((typing: boolean) => {
    if (!socket || !dbUserId) return
    socket.emit(typing ? 'typing:start' : 'typing:stop', {
      conversationId: conversation.id,
      userId: dbUserId,
      userName: me?.name?.split(' ')[0] || 'Someone'
    })
  }, [socket, conversation.id, dbUserId, me?.name])

  // ---- Sending (optimistic) ----

  const addLocal = useCallback((m: ChatMessage) => {
    setMessages(prev => [...prev, m])
    requestAnimationFrame(() => scrollToBottom(true))
  }, [scrollToBottom])

  const settle = useCallback((clientId: string, saved: ChatMessage | null) => {
    setMessages(prev => uniqueById(prev.map(m => {
      if (m.clientId !== clientId && m.id !== clientId) return m
      return saved ? mergeSaved(m, saved) : { ...m, pending: false, failed: true }
    })))
    if (saved) retryRef.current.delete(clientId)
  }, [])

  const markPending = (clientId: string) =>
    setMessages(prev => prev.map(m => (m.clientId === clientId ? { ...m, pending: true, failed: false } : m)))

  const postJson = useCallback(async (body: Record<string, unknown>) => {
    const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.error || 'Failed to send')
    return data.message as ChatMessage
  }, [endpoint])

  const localBase = useCallback((clientId: string): ChatMessage => ({
    id: clientId,
    clientId,
    content: '',
    type: 'TEXT',
    conversationId: conversation.id,
    createdAt: new Date().toISOString(),
    sender: { id: dbUserId || 'me', name: me?.name || 'You', imageUrl: me?.imageUrl },
    replyTo: replyRef.current
      ? { id: replyRef.current.id, content: replyRef.current.content, type: replyRef.current.type, fileName: replyRef.current.fileName, sender: { name: replyRef.current.sender.name } }
      : null,
    reactions: [],
    pending: true,
  }), [conversation.id, dbUserId, me?.name, me?.imageUrl])

  const sendText = useCallback((text: string) => {
    const clientId = newClientId()
    const replyToId = replyRef.current?.id
    addLocal({ ...localBase(clientId), content: text })
    setReplyContext(null)
    const attempt = () => {
      markPending(clientId)
      postJson({ content: text, type: 'TEXT', replyToId, clientId })
        .then(saved => settle(clientId, saved))
        .catch(e => { settle(clientId, null); toast.error(e.message) })
    }
    retryRef.current.set(clientId, attempt)
    attempt()
  }, [addLocal, localBase, postJson, settle])

  const sendFiles = useCallback((files: File[], caption: string) => {
    const replyToId = replyRef.current?.id
    files.forEach((file, index) => {
      const clientId = newClientId()
      const kind = kindOf(file)
      const localUrl = kind === 'IMAGE' || kind === 'VIDEO' ? URL.createObjectURL(file) : null
      const text = index === 0 && caption ? caption : file.name
      addLocal({ ...localBase(clientId), type: kind, content: text, fileUrl: localUrl, fileName: file.name, fileSize: file.size })
      const attempt = async () => {
        markPending(clientId)
        try {
          const fd = new FormData()
          fd.append('file', file)
          const up = await fetch('/api/upload', { method: 'POST', body: fd })
          const upData = await up.json().catch(() => ({}))
          if (!up.ok) throw new Error(upData.error || 'Upload failed')
          const saved = await postJson({
            content: text, type: upData.kind === 'AUDIO' ? 'AUDIO' : upData.kind, fileUrl: upData.url, fileName: upData.name,
            fileSize: upData.size, replyToId: index === 0 ? replyToId : undefined, clientId,
          })
          settle(clientId, saved)
          if (localUrl) setTimeout(() => URL.revokeObjectURL(localUrl), 5000)
        } catch (e) {
          settle(clientId, null)
          toast.error(e instanceof Error ? e.message : 'Upload failed')
        }
      }
      retryRef.current.set(clientId, attempt)
      attempt()
    })
    setReplyContext(null)
  }, [addLocal, localBase, postJson, settle])

  const sendVoice = useCallback((blob: Blob, duration: number) => {
    const clientId = newClientId()
    const replyToId = replyRef.current?.id
    const localUrl = URL.createObjectURL(blob)
    addLocal({ ...localBase(clientId), type: 'VOICE', content: 'Voice message', fileUrl: localUrl, duration })
    setReplyContext(null)
    const attempt = async () => {
      markPending(clientId)
      try {
        const fd = new FormData()
        fd.append('audio', blob, blob.type.includes('mp4') ? 'voice-message.m4a' : 'voice-message.webm')
        fd.append('duration', String(duration))
        fd.append('clientId', clientId)
        if (replyToId) fd.append('replyToId', replyToId)
        const r = await fetch(`/api/conversations/${conversation.id}/voice`, { method: 'POST', body: fd })
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.error || 'Failed to send voice message')
        settle(clientId, data.message)
      } catch (e) {
        settle(clientId, null)
        toast.error(e instanceof Error ? e.message : 'Failed to send voice message')
      }
    }
    retryRef.current.set(clientId, attempt)
    attempt()
  }, [addLocal, localBase, settle, conversation.id])

  const retry = useCallback((m: ChatMessage) => {
    const fn = m.clientId && retryRef.current.get(m.clientId)
    if (fn) fn()
  }, [])

  const toggleReaction = useCallback((message: ChatMessage, emoji: string) => {
    if (!socket) return
    socket.emit('reaction:toggle', { conversationId: conversation.id, messageId: message.id, emoji }, (res: any) => {
      if (!res?.ok) toast.error(res?.error || 'Could not react')
    })
  }, [socket, conversation.id])

  const startEdit = useCallback((m: ChatMessage) => { setEditText(m.content); setEditing(m) }, [])
  const startForward = useCallback((m: ChatMessage) => { setForwardSearch(''); setForwardSource(m) }, [])

  const submitEdit = async () => {
    if (!editing) return
    const text = editText.trim()
    if (!text) return
    const r = await fetch(`/api/messages/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text })
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return toast.error(data.error || 'Could not edit message')
    setMessages(prev => prev.map(m => (m.id === editing.id ? { ...m, ...data.message } : m)))
    setEditing(null)
  }

  const confirmDelete = async () => {
    if (!deleting) return
    const r = await fetch(`/api/messages/${deleting.id}`, { method: 'DELETE' })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return toast.error(data.error || 'Could not delete message')
    setMessages(prev => prev.map(m => (m.id === deleting.id ? { ...m, ...data.message } : m)))
    setDeleting(null)
  }

  const forwardTo = async (target: ConversationSummary) => {
    if (!forwardSource) return
    const url = target.type === 'GROUP' ? `/api/groups/${target.id}/messages` : `/api/conversations/${target.id}/messages`
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: forwardSource.content,
        type: forwardSource.type,
        fileUrl: forwardSource.fileUrl,
        fileName: forwardSource.fileName,
        fileSize: forwardSource.fileSize,
        duration: forwardSource.duration,
      })
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return toast.error(data.error || 'Could not forward message')
    toast.success(`Forwarded to ${target.name}`)
    setForwardSource(null)
  }

  const blockOrUnblock = async (block: boolean) => {
    if (!conversation.otherUserId) return
    const r = block
      ? await fetch('/api/blocks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: conversation.otherUserId }) })
      : await fetch(`/api/blocks?userId=${conversation.otherUserId}`, { method: 'DELETE' })
    if (!r.ok) return toast.error('Something went wrong')
    setBlockedByMe(block)
    toast.success(block ? `${conversation.name} blocked` : `${conversation.name} unblocked`)
  }

  const typingNames = Object.values(typingUsers)
  const onlineMembers = useMemo(
    () => (conversation.participants || []).filter(p => p.id !== dbUserId && onlineUserIds.has(p.id)).length,
    [conversation.participants, dbUserId, onlineUserIds]
  )

  const muted = dark ? 'text-[#8696a0]' : 'text-[#667781]'
  let subtitle: React.ReactNode = null
  if (typingNames.length > 0) {
    subtitle = <span className="text-[#00a884]">{isGroup ? `${typingNames.join(', ')} typing…` : 'typing…'}</span>
  } else if (isGroup) {
    const names = (conversation.participants || []).map(p => (p.id === dbUserId ? 'You' : p.name.split(' ')[0]))
    subtitle = <span className="truncate">{onlineMembers > 0 ? `${onlineMembers} online · ` : ''}{names.join(', ')}</span>
  } else if (conversation.isBlocked) {
    subtitle = null
  } else if (conversation.isOnline) {
    subtitle = <span>online</span>
  } else if (!conversation.presenceHidden && conversation.lastSeen) {
    subtitle = <span>{formatLastSeen(conversation.lastSeen)}</span>
  } else {
    subtitle = <span>tap here for contact info</span>
  }

  const lockedReason = !isGroup && conversation.isBlocked ? (
    blockedByMe ? (
      <span>
        You blocked this contact.{' '}
        <button type="button" className="font-medium text-[#00a884] hover:underline" onClick={() => blockOrUnblock(false)}>Unblock</button>
      </span>
    ) : "You can't send messages to this chat."
  ) : !isGroup && blockedByMe ? (
    <span>
      You blocked this contact.{' '}
      <button type="button" className="font-medium text-[#00a884] hover:underline" onClick={() => blockOrUnblock(false)}>Unblock</button>
    </span>
  ) : null

  const openInfo = () => {
    if (isGroup) setIsGroupInfoOpen(true)
    else if (conversation.otherUserId) onOpenProfile(conversation.otherUserId)
  }

  return (
    <div className="relative flex flex-col h-full min-h-0">
      <div className={`flex items-center gap-2 px-2 sm:px-4 py-2 h-[60px] flex-shrink-0 border-l ${dark ? 'bg-[#202c33] border-[#222d34]' : 'bg-[#f0f2f5] border-[#d1d7db]'}`}>
        <Button variant="ghost" size="icon" className="md:hidden h-9 w-9 flex-shrink-0" onClick={onBack} aria-label="Back to chats">
          <ArrowLeft className={`h-5 w-5 ${dark ? 'text-[#aebac1]' : 'text-[#54656f]'}`} />
        </Button>
        <button type="button" className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={openInfo}>
          {isGroup && !conversation.imageUrl ? (
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${dark ? 'bg-[#6a7175]' : 'bg-[#dfe5e7]'}`}>
              <Users className={`w-5 h-5 ${dark ? 'text-[#d1d7db]' : 'text-[#54656f]'}`} />
            </div>
          ) : (
            <Avatar name={conversation.name || '?'} src={conversation.imageUrl} size={40} />
          )}
          <div className="min-w-0">
            <h3 className={`font-medium truncate ${dark ? 'text-[#e9edef]' : 'text-[#111b21]'}`}>{conversation.name}</h3>
            {subtitle && <div className={`text-[13px] truncate ${muted}`}>{subtitle}</div>}
          </div>
        </button>

        {!isConnected && <span className="hidden sm:inline text-xs text-amber-500 mr-1">Reconnecting…</span>}
        {!lockedReason && (
          <>
            <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => onStartCall('video')} title="Video call" disabled={!isConnected}>
              <Video className={`h-5 w-5 ${dark ? 'text-[#aebac1]' : 'text-[#54656f]'}`} />
            </Button>
            <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => onStartCall('audio')} title="Voice call" disabled={!isConnected}>
              <Phone className={`h-5 w-5 ${dark ? 'text-[#aebac1]' : 'text-[#54656f]'}`} />
            </Button>
          </>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-10 w-10" aria-label="Chat menu">
              <MoreVertical className={`h-5 w-5 ${dark ? 'text-[#aebac1]' : 'text-[#54656f]'}`} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={openInfo}>
              <Info className="mr-2 h-4 w-4" /> {isGroup ? 'Group info' : 'Contact info'}
            </DropdownMenuItem>
            {!isGroup && conversation.otherUserId && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => blockOrUnblock(!blockedByMe)} className="text-red-600 focus:text-red-600">
                  <Ban className="mr-2 h-4 w-4" /> {blockedByMe ? 'Unblock' : 'Block'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenProfile(conversation.otherUserId!)} className="text-red-600 focus:text-red-600">
                  <Flag className="mr-2 h-4 w-4" /> Report
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={`chat-wallpaper flex-1 min-h-0 overflow-y-auto overscroll-contain ${dark ? 'bg-[#0b141a]' : 'bg-[#efeae2]'}`}
      >
        <div className="px-3 sm:px-[6%] lg:px-[9%] py-3">
          {isLoadingMessages ? (
            <div className="flex justify-center py-10">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#00a884] border-t-transparent" />
            </div>
          ) : (
            <>
              {hasMore && (
                <div className="flex justify-center mb-3">
                  <button type="button" onClick={loadOlder} disabled={isLoadingOlder} className={`rounded-full px-4 py-1.5 text-xs shadow-sm ${dark ? 'bg-[#182229] text-[#8696a0]' : 'bg-white text-[#54656f]'}`}>
                    {isLoadingOlder ? 'Loading…' : 'Load older messages'}
                  </button>
                </div>
              )}
              <div className="flex justify-center mb-3">
                <div className={`max-w-md rounded-lg px-3 py-1.5 text-center text-xs shadow-sm ${dark ? 'bg-[#182229] text-[#ffd279]' : 'bg-[#ffeecd] text-[#54656f]'}`}>
                  🔒 Only people in this chat can read its messages. Don&apos;t share passwords or codes.
                </div>
              </div>
              {messages.map((msg, i) => {
                const date = new Date(msg.createdAt)
                const prev = messages[i - 1]
                const newDay = !prev || !isSameDay(new Date(prev.createdAt), date)
                const isOwn = msg.sender.id === dbUserId
                const firstInRun = newDay || !prev || prev.sender.id !== msg.sender.id
                return (
                  <Fragment key={msg.clientId || msg.id}>
                    {newDay && (
                      <div className="flex justify-center my-3 sticky top-2 z-[5]">
                        <span className={`text-xs px-3 py-1.5 rounded-lg shadow-sm ${dark ? 'bg-[#182229] text-[#8696a0]' : 'bg-white text-[#54656f]'}`}>
                          {dayLabel(date)}
                        </span>
                      </div>
                    )}
                    <MessageBubble
                      message={msg}
                      isOwn={isOwn}
                      showSender={isGroup && !isOwn && firstInRun}
                      showTail={firstInRun}
                      currentUserId={dbUserId}
                      hideReadReceipts={me?.readReceipts === false}
                      onReply={setReplyContext}
                      onForward={startForward}
                      onEdit={startEdit}
                      onDelete={setDeleting}
                      onReact={toggleReaction}
                      onRetry={retry}
                    />
                  </Fragment>
                )
              })}
              <TypingIndicator isTyping={typingNames.length > 0} userName={typingNames.join(', ')} />
            </>
          )}
        </div>
      </div>

      {showJumpToBottom && (
        <button
          type="button"
          className={`absolute right-5 bottom-24 h-10 w-10 rounded-full shadow-lg z-10 flex items-center justify-center ${dark ? 'bg-[#202c33] text-[#aebac1]' : 'bg-white text-[#54656f]'}`}
          onClick={() => scrollToBottom(true)}
          aria-label="Scroll to latest"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
      )}

      <div className="flex-shrink-0">
        <Composer
          conversationId={conversation.id}
          // Sending goes over HTTP, so a socket reconnect never blocks typing
          disabled={!me}
          lockedReason={lockedReason}
          replyTo={replyContext}
          onClearReply={() => setReplyContext(null)}
          onTyping={handleTyping}
          onSendText={sendText}
          onSendFiles={sendFiles}
          onSendVoice={sendVoice}
        />
      </div>

      {isGroup && (
        <GroupInfoDrawer
          isOpen={isGroupInfoOpen}
          onClose={() => setIsGroupInfoOpen(false)}
          onChanged={onGroupChanged}
          onOpenProfile={onOpenProfile}
          onlineUserIds={onlineUserIds}
          group={{
            id: conversation.id,
            name: conversation.name || 'Untitled Group',
            imageUrl: conversation.imageUrl || undefined,
            description: conversation.description || '',
          }}
        />
      )}

      <Dialog open={!!forwardSource} onOpenChange={(o) => { if (!o) setForwardSource(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Forward message to…</DialogTitle>
          </DialogHeader>
          <Input placeholder="Search chats" value={forwardSearch} onChange={(e) => setForwardSearch(e.target.value)} />
          <div className="max-h-72 overflow-y-auto space-y-1">
            {conversations
              .filter(c => (c.name || '').toLowerCase().includes(forwardSearch.toLowerCase()))
              .map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => forwardTo(c)}
                  className="w-full flex items-center gap-3 rounded-md p-2 text-left hover:bg-muted"
                >
                  {c.type === 'GROUP' && !c.imageUrl ? (
                    <div className="h-9 w-9 rounded-full bg-[#dfe5e7] flex items-center justify-center">
                      <Users className="h-4 w-4 text-[#54656f]" />
                    </div>
                  ) : (
                    <Avatar name={c.name} src={c.imageUrl} size={36} />
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.type === 'GROUP' ? 'Group' : 'Contact'}</div>
                  </div>
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit message</DialogTitle>
          </DialogHeader>
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit() } }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={submitEdit} disabled={!editText.trim()} className="bg-[#00a884] hover:bg-[#06cf9c] text-white">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete message for everyone?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This message will be replaced with “This message was deleted” for all participants.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete for everyone</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
