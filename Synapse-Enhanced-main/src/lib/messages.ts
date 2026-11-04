import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'

export const messageInclude = {
  sender: { select: { id: true, clerkId: true, name: true, imageUrl: true } },
  replyTo: { include: { sender: { select: { name: true } } } },
  reactions: { select: { id: true, emoji: true, userId: true } },
} as const

/** Hide the body of deleted messages (and of quoted deleted messages) before sending to clients. */
export function scrubMessage<T extends { isDeleted: boolean; content: string; fileUrl: string | null; fileName: string | null; replyTo?: any }>(m: T): T {
  const replyTo = m.replyTo && m.replyTo.isDeleted
    ? { ...m.replyTo, content: 'This message was deleted', fileUrl: null }
    : m.replyTo
  if (!m.isDeleted) return { ...m, replyTo }
  return { ...m, content: '', fileUrl: null, fileName: null, replyTo: null }
}

export async function getCurrentDbUser() {
  // auth() verifies the session token locally; currentUser() would call Clerk's API on every request
  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) return null
  return prisma.user.findUnique({ where: { clerkId: clerkUserId } })
}

/** Most recent `limit` messages of a chat (optionally before a cursor message), oldest first. */
export async function fetchChatMessages(where: { conversationId?: string; groupId?: string }, limit: number, before?: string | null) {
  let createdBefore: Date | undefined
  if (before) {
    const cursor = await prisma.message.findUnique({ where: { id: before }, select: { createdAt: true } })
    createdBefore = cursor?.createdAt
  }
  const rows = await prisma.message.findMany({
    where: { ...where, ...(createdBefore ? { createdAt: { lt: createdBefore } } : {}) },
    include: messageInclude,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  })
  const hasMore = rows.length > limit
  return { messages: rows.slice(0, limit).reverse().map(scrubMessage), hasMore }
}
