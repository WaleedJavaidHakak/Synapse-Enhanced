import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentDbUser } from '@/lib/messages'
import { emitToUsers } from '@/lib/realtime'
import { findDirectConversation } from '@/lib/conversations'

export async function GET() {
  const me = await getCurrentDbUser()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const blocks = await prisma.userBlock.findMany({
    where: { blockerId: me.id },
    include: { blocked: { select: { id: true, name: true, imageUrl: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ blocked: blocks.map(b => ({ ...b.blocked, blockedAt: b.createdAt })) })
}

async function notify(meClerkId: string, otherId: string) {
  const other = await prisma.user.findUnique({ where: { id: otherId }, select: { clerkId: true } })
  emitToUsers([meClerkId, ...(other ? [other.clerkId] : [])], 'conversations:refresh', {})
  emitToUsers([meClerkId], 'blocks:updated', { userId: otherId })
  ;(globalThis as any).__synapseRefreshPrivacy?.(meClerkId)
  if (other) (globalThis as any).__synapseRefreshPrivacy?.(other.clerkId)
}

// Block: { userId }. Also drops pending requests in both directions.
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentDbUser()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { userId } = await req.json()
    if (!userId || userId === me.id) return NextResponse.json({ error: 'Invalid user' }, { status: 400 })
    if (!(await prisma.user.findUnique({ where: { id: userId }, select: { id: true } }))) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    await prisma.$transaction([
      prisma.userBlock.upsert({
        where: { blockerId_blockedId: { blockerId: me.id, blockedId: userId } },
        update: {},
        create: { blockerId: me.id, blockedId: userId },
      }),
      prisma.chatRequest.deleteMany({
        where: { status: 'PENDING', OR: [{ senderId: me.id, receiverId: userId }, { senderId: userId, receiverId: me.id }] },
      }),
    ])
    await notify(me.clerkId, userId)
    const conversation = await findDirectConversation(me.id, userId)
    return NextResponse.json({ success: true, conversationId: conversation?.id || null })
  } catch (e) {
    console.error('Block error:', e)
    return NextResponse.json({ error: 'Failed to block' }, { status: 500 })
  }
}

// Unblock: ?userId=
export async function DELETE(req: NextRequest) {
  try {
    const me = await getCurrentDbUser()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const userId = new URL(req.url).searchParams.get('userId')
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
    await prisma.userBlock.deleteMany({ where: { blockerId: me.id, blockedId: userId } })
    await notify(me.clerkId, userId)
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Unblock error:', e)
    return NextResponse.json({ error: 'Failed to unblock' }, { status: 500 })
  }
}
