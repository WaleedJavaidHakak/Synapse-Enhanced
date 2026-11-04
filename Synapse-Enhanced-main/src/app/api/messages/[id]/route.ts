import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentDbUser, messageInclude, scrubMessage } from '@/lib/messages'
import { emitToChat, emitToUsers, getChatMemberClerkIds } from '@/lib/realtime'

// WhatsApp allows editing for 15 minutes after sending
const EDIT_WINDOW_MS = 15 * 60 * 1000

async function loadOwnMessage(id: string) {
  const dbUser = await getCurrentDbUser()
  if (!dbUser) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const message = await prisma.message.findUnique({ where: { id } })
  if (!message) return { error: NextResponse.json({ error: 'Message not found' }, { status: 404 }) }
  if (message.senderId !== dbUser.id) {
    return { error: NextResponse.json({ error: 'You can only change your own messages' }, { status: 403 }) }
  }
  if (message.isDeleted) return { error: NextResponse.json({ error: 'Message was deleted' }, { status: 410 }) }
  return { message }
}

async function broadcastUpdate(messageId: string) {
  const updated = await prisma.message.findUnique({ where: { id: messageId }, include: messageInclude })
  if (!updated) return null
  const chatId = (updated.conversationId || updated.groupId)!
  const payload = { ...scrubMessage(updated), conversationId: chatId, isGroup: !!updated.groupId }
  emitToChat(chatId, 'message:updated', payload)
  // Let sidebars refresh the preview if this was the latest message
  const latest = await prisma.message.findFirst({
    where: updated.groupId ? { groupId: chatId } : { conversationId: chatId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  if (latest?.id === updated.id) {
    emitToUsers(await getChatMemberClerkIds(chatId), 'conversation:preview', {
      id: chatId,
      content: updated.isDeleted ? 'This message was deleted' : updated.content,
    })
  }
  return payload
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const result = await loadOwnMessage(id)
    if (result.error) return result.error
    const { message } = result

    const { content } = await req.json()
    const text = String(content || '').trim()
    if (!text) return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 })
    if (message.type !== 'TEXT') return NextResponse.json({ error: 'Only text messages can be edited' }, { status: 400 })
    if (Date.now() - message.createdAt.getTime() > EDIT_WINDOW_MS) {
      return NextResponse.json({ error: 'Messages can only be edited within 15 minutes' }, { status: 400 })
    }

    await prisma.message.update({ where: { id }, data: { content: text, isEdited: true } })
    const payload = await broadcastUpdate(id)
    return NextResponse.json({ message: payload })
  } catch (e) {
    console.error('Message edit error:', e)
    return NextResponse.json({ error: 'Failed to edit message' }, { status: 500 })
  }
}

// Delete for everyone (soft delete keeps reply chains intact)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const result = await loadOwnMessage(id)
    if (result.error) return result.error

    await prisma.$transaction([
      prisma.message.update({ where: { id }, data: { isDeleted: true } }),
      prisma.messageReaction.deleteMany({ where: { messageId: id } }),
    ])
    const payload = await broadcastUpdate(id)
    return NextResponse.json({ message: payload })
  } catch (e) {
    console.error('Message delete error:', e)
    return NextResponse.json({ error: 'Failed to delete message' }, { status: 500 })
  }
}
