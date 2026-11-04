import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchChatMessages, getCurrentDbUser, messageInclude, scrubMessage } from '@/lib/messages'
import { directChatBlockState } from '@/lib/conversations'
import { broadcastNewMessage } from '@/lib/realtime'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentDbUser = await getCurrentDbUser()
    if (!currentDbUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: conversationId } = await params
    const { searchParams } = new URL(req.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const before = searchParams.get('before')

    const conversationAccess = await prisma.conversationUser.findFirst({
      where: { conversationId, userId: currentDbUser.id }
    })
    if (!conversationAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const { messages, hasMore } = await fetchChatMessages({ conversationId }, limit, before)
    return NextResponse.json({ messages, hasMore })
  } catch (error) {
    console.error('Messages fetch error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentDbUser = await getCurrentDbUser()
    if (!currentDbUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: conversationId } = await params
    const body = await req.json()
    const { content, type = 'TEXT', fileUrl, fileName, fileSize, replyToId, duration, clientId } = body

    if (type === 'TEXT' && !String(content || '').trim()) {
      return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 })
    }

    const conversationAccess = await prisma.conversationUser.findFirst({
      where: { conversationId, userId: currentDbUser.id }
    })
    if (!conversationAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const block = await directChatBlockState(conversationId, currentDbUser.id)
    if (block.blockedByMe || block.blockedMe) {
      return NextResponse.json({ error: block.blockedByMe ? 'Unblock this contact to send a message' : "You can't send messages to this chat" }, { status: 403 })
    }

    const message = await prisma.message.create({
      data: {
        content: content || '',
        type,
        conversationId,
        senderId: currentDbUser.id,
        fileUrl,
        fileName,
        fileSize: fileSize ? parseInt(fileSize) : null,
        duration: duration ? Math.round(Number(duration)) : null,
        replyToId: replyToId || null
      },
      include: messageInclude
    })

    // Sending implies you've read everything before it
    await Promise.all([
      prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
      prisma.conversationUser.update({ where: { id: conversationAccess.id }, data: { lastReadAt: new Date() } }),
    ])

    void broadcastNewMessage(message, clientId).catch(e => console.error('Broadcast error:', e))
    return NextResponse.json({ message: { ...scrubMessage(message), clientId }, success: true })
  } catch (error) {
    console.error('Message creation error:', error)
    return NextResponse.json({
      error: 'Failed to send message',
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    }, { status: 500 })
  }
}
