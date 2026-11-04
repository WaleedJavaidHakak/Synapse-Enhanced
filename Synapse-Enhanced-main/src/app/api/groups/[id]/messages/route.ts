import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchChatMessages, getCurrentDbUser, messageInclude, scrubMessage } from '@/lib/messages'
import { broadcastNewMessage } from '@/lib/realtime'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const dbUser = await getCurrentDbUser()
    if (!dbUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: groupId } = await params
    const { searchParams } = new URL(req.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const before = searchParams.get('before')

    const member = await prisma.groupMember.findFirst({ where: { groupId, userId: dbUser.id } })
    if (!member) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    const { messages, hasMore } = await fetchChatMessages({ groupId }, limit, before)
    // Group messages share the conversation-shaped API on the client
    return NextResponse.json({ messages: messages.map(m => ({ ...m, conversationId: groupId })), hasMore })
  } catch (e) {
    console.error('Group messages fetch error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const dbUser = await getCurrentDbUser()
    if (!dbUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: groupId } = await params
    const body = await req.json()
    const { content, type = 'TEXT', fileUrl, fileName, fileSize, replyToId, duration, clientId } = body

    if (type === 'TEXT' && !String(content || '').trim()) {
      return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 })
    }

    const member = await prisma.groupMember.findFirst({ where: { groupId, userId: dbUser.id } })
    if (!member) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    const message = await prisma.message.create({
      data: {
        content: content || '',
        type,
        groupId,
        senderId: dbUser.id,
        fileUrl,
        fileName,
        fileSize: fileSize ? parseInt(fileSize) : null,
        duration: duration ? Math.round(Number(duration)) : null,
        replyToId: replyToId || null,
      },
      include: messageInclude,
    })

    await Promise.all([
      prisma.group.update({ where: { id: groupId }, data: { updatedAt: new Date() } }),
      prisma.groupMember.update({ where: { id: member.id }, data: { lastReadAt: new Date() } }),
    ])

    void broadcastNewMessage(message, clientId).catch(e => console.error('Broadcast error:', e))
    return NextResponse.json({ message: { ...scrubMessage(message), conversationId: groupId, clientId }, success: true })
  } catch (e) {
    console.error('Group message create error:', e)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
