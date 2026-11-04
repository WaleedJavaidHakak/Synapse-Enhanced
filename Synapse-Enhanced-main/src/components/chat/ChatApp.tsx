'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import { useUserSync } from '@/hooks/useUserSync'
import { useSocket } from '@/hooks/useSocket'
import { useTheme } from '@/contexts/ThemeContext'
import { Sidebar, type Panel } from '@/components/chat/Sidebar'
import { ChatWindow } from '@/components/chat/ChatWindow'
import { ContactsPanel } from '@/components/chat/ContactsPanel'
import { UserProfile } from '@/components/chat/UserProfile'
import { CallModal, CallRole } from '@/components/call/CallModal'
import { IncomingCallDialog, IncomingCall } from '@/components/call/IncomingCallDialog'
import { PersonProfileDialog } from '@/components/people/PersonProfileDialog'
import { DiscoverPanel } from '@/components/people/DiscoverPanel'
import { RequestsPanel } from '@/components/people/RequestsPanel'
import { PrivacySettings } from '@/components/people/PrivacySettings'

interface Participant {
  id: string
  clerkId?: string
  name: string
  imageUrl?: string | null
}

interface Conversation {
  id: string
  type?: 'DIRECT' | 'GROUP'
  name: string
  imageUrl?: string | null
  description?: string | null
  myRole?: 'ADMIN' | 'MODERATOR' | 'MEMBER'
  lastMessage?: {
    content: string
    timestamp: string
    senderId: string
    senderName: string
  } | null
  unreadCount: number
  isOnline: boolean
  lastSeen?: string | null
  presenceHidden?: boolean
  isBlocked?: boolean
  updatedAt?: string
  participants: Participant[]
}

interface ActiveCall {
  conversationId: string
  audioOnly: boolean
  role: CallRole
  peerName: string
  peerImage?: string | null
  isGroup?: boolean
  /** Someone picked up; later declines (other devices, other group members) must not end the call */
  answered?: boolean
}

function sortConversations(list: Conversation[]) {
  const ts = (c: Conversation) => new Date(c.lastMessage?.timestamp || c.updatedAt || 0).getTime()
  return [...list].sort((a, b) => ts(b) - ts(a))
}

// Short notification "pop" via WebAudio
function playMessageSound() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    const ctx: AudioContext = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.22)
    setTimeout(() => ctx.close().catch(() => {}), 400)
  } catch {}
}

function ChatAppContent() {
  const { user, isLoaded, dbUser, error: syncError, syncUser, refreshUser } = useUserSync()
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const { socket, isConnected, connectionError, reauthenticate } = useSocket()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activePanel, setActivePanel] = useState<Panel>('chat')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [isLoadingConversations, setIsLoadingConversations] = useState(false)
  const [hasLoadedInitial, setHasLoadedInitial] = useState(false)
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set())
  const [lastSeenOverrides, setLastSeenOverrides] = useState<Record<string, string>>({})
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null)
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null)
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const [requestCount, setRequestCount] = useState(0)
  const [peopleKey, setPeopleKey] = useState(0)

  const selectedIdRef = useRef<string | null>(null)
  selectedIdRef.current = activePanel === 'chat' ? selectedId : null
  const dbUserIdRef = useRef<string | undefined>(undefined)
  dbUserIdRef.current = dbUser?.id
  const loadingRef = useRef(false)
  const reloadQueuedRef = useRef(false)

  const loadUserConversations = useCallback(async () => {
    // A refresh requested mid-load runs again afterwards instead of being dropped
    if (loadingRef.current) { reloadQueuedRef.current = true; return }
    loadingRef.current = true
    setIsLoadingConversations(true)
    try {
      do {
        reloadQueuedRef.current = false
        const [conversationsResponse, groupsResponse] = await Promise.all([
          fetch('/api/conversations'),
          fetch('/api/groups')
        ])
        const all: Conversation[] = []
        if (conversationsResponse.ok) all.push(...((await conversationsResponse.json()).conversations || []))
        if (groupsResponse.ok) all.push(...((await groupsResponse.json()).groups || []))
        setConversations(() => {
          // Keep the open chat's badge at zero; it is being read right now
          const open = selectedIdRef.current
          return sortConversations(all.map(c => (c.id === open ? { ...c, unreadCount: 0 } : c)))
        })
        setHasLoadedInitial(true)
      } while (reloadQueuedRef.current)
    } catch (error) {
      console.error('Failed to load conversations:', error)
      setHasLoadedInitial(true)
    } finally {
      loadingRef.current = false
      setIsLoadingConversations(false)
    }
  }, [])

  const loadRequestCount = useCallback(() => {
    fetch('/api/requests')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setRequestCount(d.incoming.length) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (isLoaded && user && dbUser) {
      loadUserConversations()
      loadRequestCount()
    }
  }, [isLoaded, user?.id, dbUser?.id, loadUserConversations, loadRequestCount]) // eslint-disable-line react-hooks/exhaustive-deps

  // A brand-new account can connect its socket before its DB row exists; identify again once it does
  useEffect(() => {
    if (dbUser?.id && isConnected) reauthenticate()
  }, [dbUser?.id, isConnected, reauthenticate])

  // Ask for notification permission on the first interaction (browsers require a gesture)
  useEffect(() => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'default') return
    const ask = () => { Notification.requestPermission().catch(() => {}) }
    window.addEventListener('pointerdown', ask, { once: true })
    return () => window.removeEventListener('pointerdown', ask)
  }, [])

  const openConversationById = useCallback((id: string) => {
    setSelectedId(id)
    setActivePanel('chat')
    setConversations(prev => prev.map(c => (c.id === id ? { ...c, unreadCount: 0 } : c)))
    // A chat that was just created or accepted may not be in the list yet
    loadUserConversations()
  }, [loadUserConversations])

  const notify = useCallback((title: string, body: string, conversationId: string, icon?: string | null) => {
    playMessageSound()
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
      const n = new Notification(title, { body, icon: icon || '/default-avatar.svg', tag: conversationId })
      n.onclick = () => {
        window.focus()
        openConversationById(conversationId)
        n.close()
      }
    }
  }, [openConversationById])

  const conversationsRef = useRef<Conversation[]>([])

  useEffect(() => {
    if (!socket) return

    const onOnlineUsers = (list: Array<{ dbUserId?: string }>) => {
      setOnlineUserIds(new Set(list.map(u => u.dbUserId).filter(Boolean) as string[]))
    }
    const onUserOnline = ({ dbUserId }: { dbUserId?: string }) => {
      if (!dbUserId) return
      setOnlineUserIds(prev => new Set(prev).add(dbUserId))
    }
    const onUserOffline = ({ dbUserId, lastSeen }: { dbUserId?: string; lastSeen?: string }) => {
      if (!dbUserId) return
      setOnlineUserIds(prev => { const next = new Set(prev); next.delete(dbUserId); return next })
      if (lastSeen) setLastSeenOverrides(prev => ({ ...prev, [dbUserId]: lastSeen }))
    }
    // Someone changed privacy or blocks: ask the server what we may see now
    const onPresenceRefresh = () => socket.emit('presence:list')

    const onActivity = (activity: { id: string; type: 'DIRECT' | 'GROUP'; lastMessage: Conversation['lastMessage']; message: any }) => {
      const fromMe = activity.lastMessage?.senderId === dbUserIdRef.current
      const isOpen = selectedIdRef.current === activity.id && !document.hidden
      const known = conversationsRef.current.some(c => c.id === activity.id)
      if (!known) {
        loadUserConversations()
      } else {
        setConversations(prev => sortConversations(prev.map(c => c.id === activity.id ? {
          ...c,
          lastMessage: activity.lastMessage,
          unreadCount: fromMe || isOpen ? c.unreadCount : c.unreadCount + 1
        } : c)))
      }
      if (!fromMe && !isOpen) {
        const sender = activity.message?.sender
        const prefix = activity.type === 'GROUP' ? `${sender?.name || 'Someone'}: ` : ''
        const conv = conversationsRef.current.find(c => c.id === activity.id)
        notify(conv?.name || sender?.name || 'New message', prefix + (activity.lastMessage?.content || ''), activity.id, conv?.imageUrl)
      }
    }

    const onPreview = ({ id, content }: { id: string; content: string }) => {
      setConversations(prev => prev.map(c => c.id === id && c.lastMessage ? { ...c, lastMessage: { ...c.lastMessage, content } } : c))
    }

    const onRefresh = () => loadUserConversations()

    const onRemoved = ({ id }: { id: string }) => {
      setConversations(prev => prev.filter(c => c.id !== id))
      if (selectedIdRef.current === id) setSelectedId(null)
    }

    const onRequests = (e: { type: string; fromName?: string; byName?: string }) => {
      loadRequestCount()
      setPeopleKey(k => k + 1)
      if (e.type === 'incoming') {
        playMessageSound()
        toast(`${e.fromName || 'Someone'} wants to chat with you`, {
          action: { label: 'View', onClick: () => setActivePanel('requests') },
        })
      } else if (e.type === 'accepted') {
        toast.success(`${e.byName || 'They'} accepted your request`)
      }
    }

    const onBlocks = () => { loadUserConversations(); setPeopleKey(k => k + 1) }
    const onPrivacy = () => refreshUser()

    const onIncomingCall = (call: IncomingCall) => {
      setIncomingCall(current => current || call)
      if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(`Incoming ${call.callType} call`, { body: call.fromName, icon: call.fromImage || '/default-avatar.svg', tag: 'call' })
      }
    }
    const onCallCancelled = ({ conversationId }: { conversationId: string }) => {
      setIncomingCall(current => (current?.conversationId === conversationId ? null : current))
    }
    const onCallDeclined = ({ conversationId }: { conversationId: string }) => {
      setActiveCall(current => {
        if (current?.conversationId !== conversationId || current.role !== 'caller') return current
        if (current.isGroup || current.answered) return current
        toast.info(`${current.peerName} declined the call`)
        return null
      })
    }

    const onCallAnswered = ({ conversationId }: { conversationId: string }) => {
      setActiveCall(current => (current?.conversationId === conversationId ? { ...current, answered: true } : current))
    }

    const handlers: Record<string, (...args: any[]) => void> = {
      'online-users': onOnlineUsers,
      'user-online': onUserOnline,
      'user-offline': onUserOffline,
      'presence:refresh': onPresenceRefresh,
      'conversation:activity': onActivity,
      'conversation:preview': onPreview,
      'conversations:refresh': onRefresh,
      'conversation:removed': onRemoved,
      'requests:updated': onRequests,
      'blocks:updated': onBlocks,
      'privacy:updated': onPrivacy,
      'call:incoming': onIncomingCall,
      'call:cancelled': onCallCancelled,
      'call:declined': onCallDeclined,
      'call:answered': onCallAnswered,
    }
    Object.entries(handlers).forEach(([event, fn]) => socket.on(event, fn))
    // Anything that happened while disconnected: refetch once we're back
    const onReconnect = () => { loadUserConversations(); loadRequestCount() }
    socket.io.on('reconnect', onReconnect)

    return () => {
      Object.entries(handlers).forEach(([event, fn]) => socket.off(event, fn))
      socket.io.off('reconnect', onReconnect)
    }
  }, [socket, loadUserConversations, loadRequestCount, notify, refreshUser])

  const getOtherParticipant = useCallback((conversation: Conversation) => {
    if (!dbUser || conversation.type === 'GROUP') return undefined
    return conversation.participants?.find(p => p.id !== dbUser.id)
  }, [dbUser])

  // Overlay live presence onto the server snapshot (the server only tells us what we're allowed to see)
  const liveConversations = useMemo(() => conversations.map(c => {
    const other = getOtherParticipant(c)
    if (!other || c.isBlocked) return c
    return {
      ...c,
      isOnline: onlineUserIds.has(other.id),
      lastSeen: lastSeenOverrides[other.id] || c.lastSeen,
    }
  }), [conversations, onlineUserIds, lastSeenOverrides, getOtherParticipant])

  conversationsRef.current = liveConversations

  const selectedConversation = liveConversations.find(c => c.id === selectedId) || null

  const handleConversationSelect = (id: string | null) => {
    if (!id) {
      setSelectedId(null)
      setActivePanel('chat')
      return
    }
    openConversationById(id)
  }

  const startCall = useCallback((callType: 'audio' | 'video') => {
    if (!socket || !selectedConversation) return
    if (activeCall) return toast.info('You are already in a call')
    const other = getOtherParticipant(selectedConversation)
    const isGroup = selectedConversation.type === 'GROUP'
    socket.emit('call:invite', {
      conversationId: selectedConversation.id,
      callType,
      isGroup,
      chatName: selectedConversation.name
    })
    setActiveCall({
      conversationId: selectedConversation.id,
      audioOnly: callType === 'audio',
      role: 'caller',
      peerName: isGroup ? selectedConversation.name : (other?.name || selectedConversation.name),
      peerImage: selectedConversation.imageUrl,
      isGroup,
    })
  }, [socket, selectedConversation, activeCall, getOtherParticipant])

  const endActiveCall = useCallback(() => {
    if (activeCall?.role === 'caller') socket?.emit('call:cancel', { conversationId: activeCall.conversationId })
    setActiveCall(null)
  }, [activeCall, socket])

  const acceptIncomingCall = useCallback(() => {
    if (!incomingCall) return
    // Stops ringing on my other tabs/devices and tells the caller someone answered
    socket?.emit('call:answered', { conversationId: incomingCall.conversationId, toClerkId: incomingCall.fromClerkId })
    setActiveCall({
      conversationId: incomingCall.conversationId,
      audioOnly: incomingCall.callType === 'audio',
      role: 'callee',
      peerName: incomingCall.fromName,
      peerImage: incomingCall.fromImage,
      isGroup: incomingCall.isGroup,
      answered: true,
    })
    setIncomingCall(null)
  }, [incomingCall, socket])

  const declineIncomingCall = useCallback(() => {
    setIncomingCall(current => {
      if (current) socket?.emit('call:decline', { conversationId: current.conversationId, toClerkId: current.fromClerkId })
      return null
    })
  }, [socket])

  const closeProfile = useCallback(() => setProfileUserId(null), [])
  const onPeopleChanged = useCallback(() => { setPeopleKey(k => k + 1); loadRequestCount() }, [loadRequestCount])

  if (syncError && !dbUser) {
    return (
      <div className={`flex h-[100dvh] items-center justify-center p-6 ${dark ? 'bg-[#111b21] text-[#e9edef]' : 'bg-[#f0f2f5] text-[#111b21]'}`}>
        <div className="max-w-sm text-center">
          <h2 className="text-lg font-semibold">We couldn&apos;t finish setting up your account</h2>
          <p className={`mt-2 text-sm ${dark ? 'text-[#8696a0]' : 'text-[#667781]'}`}>{syncError}. This is usually a temporary connection problem.</p>
          <button type="button" onClick={() => syncUser(true)} className="mt-5 rounded-full bg-[#00a884] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#06cf9c]">
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!isLoaded || !hasLoadedInitial) {
    return (
      <div className={`flex items-center justify-center h-[100dvh] ${dark ? 'bg-[#111b21]' : 'bg-[#f0f2f5]'}`}>
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-[#00a884] border-t-transparent" />
          <p className={dark ? 'text-[#e9edef]' : 'text-[#111b21]'}>Loading your chats…</p>
          {connectionError && <p className="mt-2 text-sm text-amber-500">{connectionError}</p>}
        </div>
      </div>
    )
  }

  // On phones show either the list or the open panel, like WhatsApp mobile
  const showMainOnMobile = activePanel !== 'chat' || !!selectedConversation

  return (
    <div className={`flex h-[100dvh] overflow-hidden ${dark ? 'bg-[#0b141a]' : 'bg-[#f0f2f5]'}`}>
      <div className={`${showMainOnMobile ? 'hidden md:flex' : 'flex'} w-full md:w-auto h-full`}>
        <Sidebar
          selectedConversation={selectedId}
          onSelectConversation={handleConversationSelect}
          activePanel={activePanel}
          onPanelChange={setActivePanel}
          conversations={liveConversations}
          isLoadingConversations={isLoadingConversations && !hasLoadedInitial}
          isConnected={isConnected}
          requestCount={requestCount}
          connectionError={connectionError}
        />
      </div>
      <div className={`${showMainOnMobile ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0 h-full`}>
        {activePanel !== 'chat' && (
          // Phones have no sidebar while a section is open: give them a way back
          <button
            type="button"
            onClick={() => setActivePanel('chat')}
            className={`md:hidden flex items-center gap-2 px-4 py-3 text-sm font-medium ${dark ? 'bg-[#202c33] text-[#e9edef]' : 'bg-[#f0f2f5] text-[#111b21]'}`}
          >
            <ArrowLeft className="h-5 w-5" /> Chats
          </button>
        )}
        <div className="flex flex-1 min-h-0 flex-col">
        {activePanel === 'chat' && selectedConversation && (
          <ChatWindow
            key={selectedConversation.id}
            conversation={{
              ...selectedConversation,
              otherUserId: getOtherParticipant(selectedConversation)?.id
            }}
            socket={socket}
            isConnected={isConnected}
            me={dbUser}
            onlineUserIds={onlineUserIds}
            conversations={liveConversations}
            onBack={() => setSelectedId(null)}
            onStartCall={startCall}
            onGroupChanged={loadUserConversations}
            onOpenProfile={setProfileUserId}
          />
        )}
        {activePanel === 'chat' && !selectedConversation && (
          <div className={`flex h-full items-center justify-center border-l ${dark ? 'bg-[#222e35] border-[#222d34]' : 'bg-[#f0f2f5] border-[#d1d7db]'}`}>
            <div className={`mx-auto max-w-md px-6 text-center ${dark ? 'text-[#8696a0]' : 'text-[#667781]'}`}>
              <div className={`mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full ${dark ? 'bg-[#202c33]' : 'bg-white'}`}>
                <svg className="h-12 w-12 text-[#00a884]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className={`mb-2 text-2xl font-light ${dark ? 'text-[#e9edef]' : 'text-[#41525d]'}`}>Synapse</h3>
              <p className="mb-6 text-sm">
                {conversations.length === 0
                  ? 'No chats yet. Find people in Discover or start a group from Contacts.'
                  : 'Select a chat to start messaging.'}
              </p>
              {conversations.length === 0 && (
                <button type="button" onClick={() => setActivePanel('discover')} className="rounded-full bg-[#00a884] px-5 py-2 text-sm font-medium text-white hover:bg-[#06cf9c]">
                  Discover people
                </button>
              )}
              <div className="mt-8 flex items-center justify-center gap-2 text-xs">
                <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-[#25d366]' : 'bg-amber-500'}`} />
                {isConnected ? 'Connected' : 'Connecting…'}
              </div>
            </div>
          </div>
        )}
        {activePanel === 'contacts' && (
          <ContactsPanel
            onSelectConversation={(conversation) => { if (conversation?.id) openConversationById(conversation.id) }}
            onOpenProfile={setProfileUserId}
            onDiscover={() => setActivePanel('discover')}
          />
        )}
        {activePanel === 'discover' && (
          <DiscoverPanel onOpenProfile={setProfileUserId} onOpenPrivacy={() => setActivePanel('privacy')} refreshKey={peopleKey} />
        )}
        {activePanel === 'requests' && (
          <RequestsPanel
            onOpenProfile={setProfileUserId}
            onOpenConversation={openConversationById}
            onCountChange={setRequestCount}
            refreshKey={peopleKey}
          />
        )}
        {activePanel === 'profile' && <UserProfile onOpenPrivacy={() => setActivePanel('privacy')} />}
        {activePanel === 'privacy' && <PrivacySettings onBack={() => setActivePanel('profile')} />}
        </div>
      </div>

      <PersonProfileDialog
        userId={profileUserId}
        onClose={closeProfile}
        onOpenConversation={openConversationById}
        onStartCall={(type) => {
          // Calls start from the open chat; open it first if needed
          const conv = liveConversations.find(c => c.type !== 'GROUP' && c.participants.some(p => p.id === profileUserId))
          if (conv && conv.id === selectedId) startCall(type)
          else if (conv) { openConversationById(conv.id); toast.info('Chat opened. Tap the call button to start.') }
        }}
        onChanged={onPeopleChanged}
      />

      {activeCall && (
        <CallModal
          isOpen
          onClose={endActiveCall}
          roomId={activeCall.conversationId}
          audioOnly={activeCall.audioOnly}
          role={activeCall.role}
          peerName={activeCall.peerName}
          peerImage={activeCall.peerImage}
        />
      )}
      <IncomingCallDialog call={incomingCall} onAccept={acceptIncomingCall} onDecline={declineIncomingCall} />
    </div>
  )
}

export function ChatApp() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-[100dvh] bg-[#f0f2f5] dark:bg-[#111b21]">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#00a884] border-t-transparent" />
      </div>
    )
  }

  return <ChatAppContent />
}
