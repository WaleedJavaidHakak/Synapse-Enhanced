import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentDbUser } from '@/lib/messages'
import { emitToUsers, previewForMessage } from '@/lib/realtime'
import { canSee, getBlockedIds, type Visibility } from '@/lib/privacy'
import { canStartDirectChat, findOrCreateDirectConversation } from '@/lib/conversations'

const userSelect = {
  id: true,
  clerkId: true,
  name: true,
  imageUrl: true,
  isOnline: true,
  lastSeen: true,
  bio: true,
  profilePhotoVisibility: true,
  lastSeenVisibility: true
} as const

type ConversationWithUsers = {
  id: string
  type: string
  updatedAt: Date
  users: Array<{ userId: string; user: { id: string; clerkId: string; name: string; imageUrl: string | null; isOnline: boolean; lastSeen: Date; profilePhotoVisibility: Visibility; lastSeenVisibility: Visibility } }>
  messages: Array<{ content: string; type: string; isDeleted: boolean; fileName: string | null; createdAt: Date; senderId: string; sender: { name: string } | null }>
}

// The other person is always a connection here, so CONNECTIONS-level settings reveal data; NOBODY hides it.
function toClientConversation(conversation: ConversationWithUsers, currentUserId: string, unreadCount: number, blocked: Set<string> = new Set()) {
  const otherUser = conversation.users.find(u => u.userId !== currentUserId)?.user
  const lastMessage = conversation.messages[0]
  const isBlocked = !!otherUser && blocked.has(otherUser.id)
  const showPhoto = !!otherUser && !isBlocked && canSee(otherUser.profilePhotoVisibility, true)
  const showPresence = !!otherUser && !isBlocked && canSee(otherUser.lastSeenVisibility, true)
  return {
    id: conversation.id,
    type: conversation.type,
    name: otherUser?.name || 'Unknown User',
    imageUrl: showPhoto ? otherUser?.imageUrl || null : null,
    isBlocked,
    lastMessage: lastMessage ? {
      content: previewForMessage(lastMessage),
      timestamp: lastMessage.createdAt,
      senderId: lastMessage.senderId,
      senderName: lastMessage.sender?.name || 'Unknown'
    } : null,
    unreadCount,
    isOnline: showPresence ? otherUser?.isOnline || false : false,
    lastSeen: showPresence ? otherUser?.lastSeen || null : null,
    presenceHidden: !showPresence,
    updatedAt: conversation.updatedAt,
    participants: conversation.users.map(u => ({
      id: u.user.id,
      clerkId: u.user.clerkId,
      name: u.user.name,
      imageUrl: u.userId === currentUserId || (!blocked.has(u.userId) && canSee(u.user.profilePhotoVisibility, true)) ? u.user.imageUrl : null
    }))
  }
}

const conversationInclude = {
  users: { include: { user: { select: userSelect } } },
  messages: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    include: { sender: { select: { name: true } } }
  }
}

export async function POST(req: NextRequest) {
  try {
    const currentDbUser = await getCurrentDbUser()
    if (!currentDbUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { participantId } = await req.json()
    if (!participantId) {
      return NextResponse.json({ error: 'Participant ID required' }, { status: 400 })
    }
    if (participantId === currentDbUser.id) {
      return NextResponse.json({ error: 'You cannot start a chat with yourself' }, { status: 400 })
    }

    const participant = await prisma.user.findUnique({
      where: { id: participantId },
      select: { id: true, clerkId: true, messagePermission: true }
    })
    if (!participant) {
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 })
    }

    const decision = await canStartDirectChat(currentDbUser.id, participant)
    if (!decision.allowed) {
      return NextResponse.json({ error: decision.message, code: decision.code }, { status: 403 })
    }

    const { id, isNew } = await findOrCreateDirectConversation(currentDbUser.id, participant.id)
    const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id }, include: conversationInclude })
    if (isNew) {
      // Ping the other person so the chat shows up in their list without a reload
      // Both sides: the other person's list updates, and both presence caches learn the new connection
      emitToUsers([participant.clerkId, currentDbUser.clerkId], 'conversations:refresh', { id })
    }
    const blocked = await getBlockedIds(currentDbUser.id)
    return NextResponse.json({
      conversation: toClientConversation(conversation, currentDbUser.id, 0, blocked),
      isNew
    })
  } catch (error) {
    console.error('Conversation creation error:', error)
    return NextResponse.json({
      error: 'Failed to create conversation',
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    }, { status: 500 })
  }
}

export async function GET() {
  try {
    const currentDbUser = await getCurrentDbUser()
    if (!currentDbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const memberships = await prisma.conversationUser.findMany({
      where: { userId: currentDbUser.id },
      include: { conversation: { include: conversationInclude } },
      orderBy: { conversation: { updatedAt: 'desc' } }
    })

    const unreadCounts = await Promise.all(memberships.map(({ conversation, lastReadAt }) =>
      prisma.message.count({
        where: {
          conversationId: conversation.id,
          senderId: { not: currentDbUser.id },
          isDeleted: false,
          createdAt: { gt: lastReadAt }
        }
      })
    ))

    const blocked = await getBlockedIds(currentDbUser.id)
    const conversations = memberships.map(({ conversation }, index) =>
      toClientConversation(conversation, currentDbUser.id, unreadCounts[index], blocked)
    )

    return NextResponse.json({ conversations })
  } catch (error) {
    console.error('Conversations fetch error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    }, { status: 500 })
  }
}
