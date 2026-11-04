import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentDbUser } from '@/lib/messages'
import { emitToUsers, evictFromChat, getChatMemberClerkIds } from '@/lib/realtime'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const dbUser = await getCurrentDbUser()
    if (!dbUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: groupId } = await params
    const member = await prisma.groupMember.findFirst({ where: { groupId, userId: dbUser.id } })
    if (!member) return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 })

    await prisma.groupMember.delete({ where: { id: member.id } })

    const remaining = await prisma.groupMember.findMany({ where: { groupId }, orderBy: { joinedAt: 'asc' } })
    if (remaining.length === 0) {
      await prisma.group.update({ where: { id: groupId }, data: { isActive: false } })
    } else if (member.role === 'ADMIN' && !remaining.some(m => m.role === 'ADMIN')) {
      // Like WhatsApp: when the last admin exits, the longest-standing member becomes admin
      await prisma.groupMember.update({ where: { id: remaining[0].id }, data: { role: 'ADMIN' } })
    }

    evictFromChat([dbUser.clerkId], groupId)
    emitToUsers([dbUser.clerkId], 'conversation:removed', { id: groupId })
    emitToUsers(await getChatMemberClerkIds(groupId), 'conversations:refresh', { id: groupId })

    return NextResponse.json({ success: true, message: 'Left group successfully' })
  } catch (e) {
    console.error('Leave group error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
