import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentDbUser } from '@/lib/messages'
import { canStartDirectChat, findOrCreateDirectConversation } from '@/lib/conversations'
import { getConnectionIds, profileSelect, toPublicProfile } from '@/lib/privacy'
import { broadcastNewMessage, emitToUsers } from '@/lib/realtime'
import { messageInclude } from '@/lib/messages'

const MAX_PENDING_OUTGOING = 30
const MAX_INTRO_LENGTH = 300

export async function GET() {
  try {
    const me = await getCurrentDbUser()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [incoming, outgoing, connections] = await Promise.all([
      prisma.chatRequest.findMany({
        where: { receiverId: me.id, status: 'PENDING', sender: { blocksReceived: { none: { blockerId: me.id } } } },
        include: { sender: { select: profileSelect } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.chatRequest.findMany({
        where: { senderId: me.id, status: 'PENDING' },
        include: { receiver: { select: profileSelect } },
        orderBy: { createdAt: 'desc' },
      }),
      getConnectionIds(me.id),
    ])

    return NextResponse.json({
      incoming: incoming.map(r => ({
        id: r.id,
        message: r.message,
        createdAt: r.createdAt,
        user: toPublicProfile(r.sender, { viewerId: me.id, isConnection: connections.has(r.senderId) }),
      })),
      outgoing: outgoing.map(r => ({
        id: r.id,
        message: r.message,
        createdAt: r.createdAt,
        user: toPublicProfile(r.receiver, { viewerId: me.id, isConnection: connections.has(r.receiverId) }),
      })),
    })
  } catch (e) {
    console.error('Requests list error:', e)
    return NextResponse.json({ error: 'Failed to load requests' }, { status: 500 })
  }
}

// Send a message request to a stranger: { receiverId, message }
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentDbUser()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { receiverId, message } = await req.json()
    const intro = String(message || '').trim().slice(0, MAX_INTRO_LENGTH)
    if (!receiverId || receiverId === me.id) return NextResponse.json({ error: 'Invalid recipient' }, { status: 400 })
    if (!intro) return NextResponse.json({ error: 'Write a short intro message' }, { status: 400 })

    const receiver = await prisma.user.findUnique({ where: { id: receiverId }, select: { id: true, clerkId: true, messagePermission: true } })
    if (!receiver) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const decision = await canStartDirectChat(me.id, receiver)
    if (decision.allowed) {
      // No request needed: open the chat and post the intro as the first message
      const { id } = await findOrCreateDirectConversation(me.id, receiver.id)
      const first = await prisma.message.create({ data: { content: intro, type: 'TEXT', conversationId: id, senderId: me.id }, include: messageInclude })
      void broadcastNewMessage(first, undefined).catch(e => console.error('Broadcast error:', e))
      await prisma.conversation.update({ where: { id }, data: { updatedAt: new Date() } })
      emitToUsers([receiver.clerkId, me.clerkId], 'conversations:refresh', { id })
      return NextResponse.json({ status: 'CONNECTED', conversationId: id })
    }
    if (decision.code !== 'REQUEST_REQUIRED') {
      return NextResponse.json({ error: decision.message, code: decision.code }, { status: 403 })
    }

    // They already asked me: sending one back means we both want to talk, so accept theirs
    const reverse = await prisma.chatRequest.findUnique({
      where: { senderId_receiverId: { senderId: receiver.id, receiverId: me.id } },
    })
    if (reverse?.status === 'PENDING') {
      return NextResponse.json({ status: 'THEY_REQUESTED', requestId: reverse.id }, { status: 409 })
    }

    const pending = await prisma.chatRequest.count({ where: { senderId: me.id, status: 'PENDING' } })
    if (pending >= MAX_PENDING_OUTGOING) {
      return NextResponse.json({ error: `You have ${pending} pending requests. Wait for replies or cancel some.` }, { status: 429 })
    }

    const existing = await prisma.chatRequest.findUnique({
      where: { senderId_receiverId: { senderId: me.id, receiverId: receiver.id } },
    })
    if (existing?.status === 'PENDING') return NextResponse.json({ error: 'Request already sent' }, { status: 409 })
    if (existing?.status === 'DECLINED' && existing.respondedAt && Date.now() - existing.respondedAt.getTime() < 7 * 24 * 3600 * 1000) {
      return NextResponse.json({ error: 'This person declined your request recently' }, { status: 403 })
    }

    const request = existing
      ? await prisma.chatRequest.update({
          where: { id: existing.id },
          data: { message: intro, status: 'PENDING', createdAt: new Date(), respondedAt: null },
        })
      : await prisma.chatRequest.create({ data: { senderId: me.id, receiverId: receiver.id, message: intro } })

    emitToUsers([receiver.clerkId], 'requests:updated', { type: 'incoming', fromName: me.name })
    return NextResponse.json({ status: 'PENDING', requestId: request.id })
  } catch (e) {
    console.error('Request create error:', e)
    return NextResponse.json({ error: 'Failed to send request' }, { status: 500 })
  }
}
