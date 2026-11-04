import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentDbUser } from '@/lib/messages'
import { findOrCreateDirectConversation } from '@/lib/conversations'
import { getBlockState } from '@/lib/privacy'
import { emitToUsers } from '@/lib/realtime'

// { action: 'accept' | 'decline' } by the receiver, or { action: 'cancel' } by the sender
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await getCurrentDbUser()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const { action } = await req.json()
    const request = await prisma.chatRequest.findUnique({
      where: { id },
      include: {
        sender: { select: { id: true, clerkId: true } },
        receiver: { select: { id: true, clerkId: true } },
      },
    })
    if (!request || request.status !== 'PENDING') {
      return NextResponse.json({ error: 'This request is no longer pending' }, { status: 404 })
    }

    if (action === 'cancel') {
      if (request.senderId !== me.id) return NextResponse.json({ error: 'Not your request' }, { status: 403 })
      await prisma.chatRequest.delete({ where: { id } })
      emitToUsers([request.receiver.clerkId], 'requests:updated', { type: 'cancelled' })
      return NextResponse.json({ success: true })
    }

    if (request.receiverId !== me.id) return NextResponse.json({ error: 'Not your request' }, { status: 403 })

    if (action === 'decline') {
      await prisma.chatRequest.update({ where: { id }, data: { status: 'DECLINED', respondedAt: new Date() } })
      // The sender only sees it disappear from "Sent"; we don't announce declines
      emitToUsers([request.sender.clerkId], 'requests:updated', { type: 'resolved' })
      return NextResponse.json({ success: true })
    }

    if (action !== 'accept') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

    const block = await getBlockState(me.id, request.senderId)
    if (block.blockedByMe || block.blockedMe) {
      return NextResponse.json({ error: 'Unblock this person first' }, { status: 403 })
    }

    // Claim the request atomically so a double click or a second tab can't accept it twice.
    // A single conditional UPDATE is atomic in MySQL (Prisma's updateMany may read-then-write).
    const claimed = await prisma.$executeRaw`UPDATE chat_requests SET status = 'ACCEPTED', respondedAt = NOW(3) WHERE id = ${id} AND status = 'PENDING'`
    if (claimed === 0) return NextResponse.json({ error: 'This request is no longer pending' }, { status: 409 })

    const conversation = await findOrCreateDirectConversation(request.senderId, me.id)
    // The intro becomes the first message of the chat, sent at the time it was written
    await prisma.$transaction([
      prisma.message.create({
        data: { content: request.message, type: 'TEXT', conversationId: conversation.id, senderId: request.senderId, createdAt: request.createdAt },
      }),
      prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } }),
    ])

    emitToUsers([request.sender.clerkId], 'requests:updated', { type: 'accepted', byName: me.name, conversationId: conversation.id })
    emitToUsers([request.sender.clerkId, me.clerkId], 'conversations:refresh', { id: conversation.id })
    ;(globalThis as any).__synapseRefreshPrivacy?.(request.sender.clerkId)
    ;(globalThis as any).__synapseRefreshPrivacy?.(me.clerkId)

    return NextResponse.json({ success: true, conversationId: conversation.id })
  } catch (e) {
    console.error('Request update error:', e)
    return NextResponse.json({ error: 'Failed to update request' }, { status: 500 })
  }
}
