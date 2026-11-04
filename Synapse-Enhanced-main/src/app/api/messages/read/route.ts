import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentDbUser } from '@/lib/messages'
import { emitToChat, getChatAccess } from '@/lib/realtime'

// Mark every message in a chat as read by the current user (blue ticks).
export async function POST(req: NextRequest) {
  try {
    const dbUser = await getCurrentDbUser()
    if (!dbUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { conversationId } = await req.json()
    if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })

    const kind = await getChatAccess(conversationId, dbUser.id)
    if (!kind) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    const now = new Date()
    const scope = kind === 'GROUP' ? { groupId: conversationId } : { conversationId }

    const unread = await prisma.message.findMany({
      where: { ...scope, senderId: { not: dbUser.id }, isRead: false },
      select: { id: true },
    })

    if (kind === 'GROUP') {
      await prisma.groupMember.updateMany({ where: { groupId: conversationId, userId: dbUser.id }, data: { lastReadAt: now } })
    } else {
      await prisma.conversationUser.updateMany({ where: { conversationId, userId: dbUser.id }, data: { lastReadAt: now } })
    }

    // Read receipts off (WhatsApp privacy): unread counts clear, but senders never get blue ticks.
    // Delivery is still reported so senders see double grey ticks.
    if (unread.length > 0 && !dbUser.readReceipts) {
      const ids = unread.map(m => m.id)
      await prisma.message.updateMany({ where: { id: { in: ids }, isDelivered: false }, data: { isDelivered: true, deliveredAt: now } })
      emitToChat(conversationId, 'message:status', { conversationId, messageIds: ids, isDelivered: true })
      return NextResponse.json({ success: true, marked: 0 })
    }

    if (unread.length > 0) {
      const ids = unread.map(m => m.id)
      await prisma.message.updateMany({
        where: { id: { in: ids } },
        data: { isRead: true, readAt: now, isDelivered: true },
      })
      await prisma.message.updateMany({
        where: { id: { in: ids }, deliveredAt: null },
        data: { deliveredAt: now },
      })
      await prisma.messageRead.createMany({
        data: ids.map(messageId => ({ messageId, userId: dbUser.id, readAt: now })),
        skipDuplicates: true,
      })
      emitToChat(conversationId, 'message:status', {
        conversationId,
        messageIds: ids,
        isDelivered: true,
        isRead: true,
        readAt: now,
        readerId: dbUser.id,
      })
    }

    return NextResponse.json({ success: true, marked: unread.length })
  } catch (e) {
    console.error('Mark read error:', e)
    return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 })
  }
}
