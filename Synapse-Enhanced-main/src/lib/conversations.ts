import { prisma } from '@/lib/prisma'
import { areConnected, getBlockState } from '@/lib/privacy'

export async function findDirectConversation(a: string, b: string) {
  return prisma.conversation.findFirst({
    where: {
      type: 'DIRECT',
      AND: [{ users: { some: { userId: a } } }, { users: { some: { userId: b } } }],
    },
    select: { id: true },
  })
}

export async function findOrCreateDirectConversation(a: string, b: string) {
  const existing = await findDirectConversation(a, b)
  if (existing) return { id: existing.id, isNew: false }
  const created = await prisma.conversation.create({
    data: { type: 'DIRECT', users: { createMany: { data: [{ userId: a }, { userId: b }] } } },
    select: { id: true },
  })
  return { id: created.id, isNew: true }
}

export type StartChatDecision =
  | { allowed: true }
  | { allowed: false; code: 'BLOCKED' | 'REQUEST_REQUIRED' | 'NOT_ACCEPTING'; message: string }

/**
 * Whether `me` may open a brand-new 1:1 chat with `target` without a message request.
 * Existing chats can always be reopened (sending is still blocked if there is a block).
 */
export async function canStartDirectChat(meId: string, target: { id: string; messagePermission: 'EVERYONE' | 'REQUESTS' | 'NOBODY' }): Promise<StartChatDecision> {
  const block = await getBlockState(meId, target.id)
  if (block.blockedByMe) return { allowed: false, code: 'BLOCKED', message: 'Unblock this person to message them' }
  if (block.blockedMe) return { allowed: false, code: 'NOT_ACCEPTING', message: 'This person is not accepting messages' }
  if (await findDirectConversation(meId, target.id)) return { allowed: true }
  if (target.messagePermission === 'EVERYONE') return { allowed: true }
  // People who already share a group can DM each other unless they turned messages off entirely
  if (target.messagePermission === 'REQUESTS' && await areConnected(meId, target.id)) return { allowed: true }
  if (target.messagePermission === 'REQUESTS') {
    return { allowed: false, code: 'REQUEST_REQUIRED', message: 'Send a message request first' }
  }
  return { allowed: false, code: 'NOT_ACCEPTING', message: 'This person is not accepting new messages' }
}

/** For sending in an existing 1:1 chat: blocked in either direction means no delivery. */
export async function directChatBlockState(conversationId: string, meId: string) {
  const other = await prisma.conversationUser.findFirst({
    where: { conversationId, userId: { not: meId }, conversation: { type: 'DIRECT' } },
    select: { userId: true },
  })
  if (!other) return { blockedByMe: false, blockedMe: false }
  return getBlockState(meId, other.userId)
}
