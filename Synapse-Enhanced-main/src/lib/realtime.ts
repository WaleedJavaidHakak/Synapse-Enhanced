import type { Server } from 'socket.io'
import { prisma } from '@/lib/prisma'
import { scrubMessage } from '@/lib/messages'

// server.js stores the Socket.IO instance on globalThis. API routes run in the
// same Node process, so they can broadcast without a round trip through a client.
function getIO(): Server | null {
  return ((globalThis as any).__synapseIO as Server | undefined) ?? null
}

/** Room that receives events for a chat, whether it is a direct conversation or a group. */
export function chatRooms(chatId: string) {
  return [`conversation:${chatId}`, `group:${chatId}`]
}

export function emitToChat(chatId: string, event: string, payload: unknown) {
  getIO()?.to(chatRooms(chatId)).emit(event, payload)
}

export function emitToUsers(clerkIds: string[], event: string, payload: unknown) {
  const io = getIO()
  if (!io || clerkIds.length === 0) return
  io.to(clerkIds.map(id => `user:${id}`)).emit(event, payload)
  // Chat membership changed for these people, so who counts as their "contact" changed too:
  // reload the presence-privacy cache in server.js
  if (event === 'conversations:refresh' || event === 'conversation:removed') {
    ;(globalThis as any).__synapseRefreshPrivacy?.(clerkIds)
  }
}

/** Pull these users' live sockets out of a chat room (after removal, leaving or deletion). */
export function evictFromChat(clerkIds: string[], chatId: string) {
  const io = getIO()
  if (!io || clerkIds.length === 0) return
  io.in(clerkIds.map(id => `user:${id}`)).socketsLeave([...chatRooms(chatId), `rtc:${chatId}`])
}

/** Clerk ids of everyone who belongs to a chat (direct conversation or group). */
export async function getChatMemberClerkIds(chatId: string): Promise<string[]> {
  const [convUsers, groupMembers] = await Promise.all([
    prisma.conversationUser.findMany({
      where: { conversationId: chatId },
      select: { user: { select: { clerkId: true } } },
    }),
    prisma.groupMember.findMany({
      where: { groupId: chatId },
      select: { user: { select: { clerkId: true } } },
    }),
  ])
  return [...convUsers, ...groupMembers].map(m => m.user.clerkId)
}

/** Returns the chat kind if the user belongs to it, otherwise null. */
export async function getChatAccess(chatId: string, dbUserId: string): Promise<'DIRECT' | 'GROUP' | null> {
  const conv = await prisma.conversationUser.findFirst({ where: { conversationId: chatId, userId: dbUserId } })
  if (conv) return 'DIRECT'
  const member = await prisma.groupMember.findFirst({ where: { groupId: chatId, userId: dbUserId } })
  if (member) return 'GROUP'
  return null
}

export function previewForMessage(message: { type: string; content: string; isDeleted?: boolean; fileName?: string | null }) {
  if (message.isDeleted) return 'This message was deleted'
  switch (message.type) {
    case 'IMAGE': return '📷 Photo'
    case 'VIDEO': return '🎥 Video'
    case 'VOICE':
    case 'AUDIO': return '🎤 Voice message'
    case 'FILE':
    case 'DOCUMENT': return `📄 ${message.fileName || 'Document'}`
    default: return message.content
  }
}

type BroadcastableMessage = {
  id: string
  type: string
  content: string
  isDeleted?: boolean
  fileName?: string | null
  createdAt: Date
  senderId: string
  conversationId: string | null
  groupId: string | null
  isDelivered?: boolean
  sender: { id: string; clerkId: string; name: string; imageUrl?: string | null }
}

/**
 * Fan a freshly saved message out to everyone in the chat. Called by the API route right after
 * saving, so recipients get it without waiting for a second client round trip.
 * `clientId` lets the sender's tabs swap their optimistic copy for the saved one.
 */
export async function broadcastNewMessage(message: BroadcastableMessage, clientId?: string) {
  const chatId = (message.conversationId || message.groupId)!
  const isGroup = !!message.groupId
  // Scrubbed so a quoted message deleted a moment ago never leaks its text
  const payload = { ...scrubMessage(message as any), conversationId: chatId, isGroup, clientId }
  emitToChat(chatId, 'message:new', payload)

  const [convUsers, groupMembers] = await Promise.all([
    prisma.conversationUser.findMany({ where: { conversationId: chatId }, select: { user: { select: { clerkId: true } } } }),
    prisma.groupMember.findMany({ where: { groupId: chatId }, select: { user: { select: { clerkId: true } } } }),
  ])
  const memberClerkIds = [...convUsers, ...groupMembers].map(m => m.user.clerkId)

  emitToUsers(memberClerkIds, 'conversation:activity', {
    id: chatId,
    type: isGroup ? 'GROUP' : 'DIRECT',
    lastMessage: {
      content: previewForMessage(message),
      timestamp: message.createdAt,
      senderId: message.senderId,
      senderName: message.sender.name,
    },
    message: payload,
  })

  // Delivered (double grey tick) as soon as any recipient has a live connection
  const isOnline = (globalThis as any).__synapseIsOnline as ((clerkId: string) => boolean) | undefined
  const recipientOnline = !!isOnline && memberClerkIds.some(id => id !== message.sender.clerkId && isOnline(id))
  if (recipientOnline && !message.isDelivered) {
    const deliveredAt = new Date()
    await prisma.message.update({ where: { id: message.id }, data: { isDelivered: true, deliveredAt } })
    getIO()?.to([...chatRooms(chatId), `user:${message.sender.clerkId}`]).emit('message:status', {
      conversationId: chatId,
      messageIds: [message.id],
      isDelivered: true,
      deliveredAt,
    })
  }
}
