import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentDbUser } from '@/lib/messages'
import { emitToUsers, evictFromChat, getChatMemberClerkIds } from '@/lib/realtime'
import { canSee, getBlockedIds, getConnectionIds } from '@/lib/privacy'

async function loadMembership(groupId: string) {
  const dbUser = await getCurrentDbUser()
  if (!dbUser) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const member = await prisma.groupMember.findFirst({ where: { groupId, userId: dbUser.id } })
  if (!member) return { error: NextResponse.json({ error: 'Access denied' }, { status: 403 }) }
  return { dbUser, member }
}

async function listMembers(groupId: string, viewerId: string) {
  const blocked = await getBlockedIds(viewerId)
  const members = await prisma.groupMember.findMany({
    where: { groupId },
    include: { user: { select: { id: true, clerkId: true, name: true, imageUrl: true, isOnline: true, lastSeen: true, bio: true, profilePhotoVisibility: true, aboutVisibility: true, lastSeenVisibility: true } } },
    orderBy: { joinedAt: 'asc' }
  })
  return members.map(m => {
    // Group members are connections, so only "Nobody" (or a block between you) hides these
    const visible = (v: Parameters<typeof canSee>[0]) => m.user.id === viewerId || (!blocked.has(m.user.id) && canSee(v, true))
    return {
    id: m.user.id,
    clerkId: m.user.clerkId,
    name: m.user.name,
    imageUrl: visible(m.user.profilePhotoVisibility) ? m.user.imageUrl : null,
    bio: visible(m.user.aboutVisibility) ? m.user.bio : null,
    isOnline: visible(m.user.lastSeenVisibility) ? m.user.isOnline : false,
    lastSeen: visible(m.user.lastSeenVisibility) ? m.user.lastSeen : null,
    role: m.role,
    joinedAt: m.joinedAt
    }
  })
}

async function notifyGroupChanged(groupId: string, extraClerkIds: string[] = []) {
  const clerkIds = await getChatMemberClerkIds(groupId)
  emitToUsers([...clerkIds, ...extraClerkIds], 'conversations:refresh', { id: groupId })
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: groupId } = await params
    const result = await loadMembership(groupId)
    if (result.error) return result.error
    return NextResponse.json({ members: await listMembers(groupId, result.dbUser.id), myRole: result.member.role, myId: result.dbUser.id })
  } catch (e) {
    console.error('Group members fetch error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Add members (admins only)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: groupId } = await params
    const result = await loadMembership(groupId)
    if (result.error) return result.error
    if (result.member.role !== 'ADMIN') return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

    const { userIds } = await req.json()
    const [connections, blocked] = await Promise.all([getConnectionIds(result.dbUser.id), getBlockedIds(result.dbUser.id)])
    const ids: string[] = (Array.isArray(userIds) ? Array.from(new Set(userIds.map(String))) : [])
      .filter(id => connections.has(id) && !blocked.has(id))
    if (ids.length === 0) return NextResponse.json({ error: 'You can only add people you already chat with' }, { status: 400 })

    await prisma.groupMember.createMany({
      data: ids.map(userId => ({ groupId, userId, role: 'MEMBER' as const })),
      skipDuplicates: true
    })
    await notifyGroupChanged(groupId)
    return NextResponse.json({ members: await listMembers(groupId, result.dbUser.id) })
  } catch (e) {
    console.error('Group add members error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Change a member's role (admins only): { userId, role: 'ADMIN' | 'MEMBER' }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: groupId } = await params
    const result = await loadMembership(groupId)
    if (result.error) return result.error
    if (result.member.role !== 'ADMIN') return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

    const { userId, role } = await req.json()
    if (!userId || !['ADMIN', 'MEMBER'].includes(role)) {
      return NextResponse.json({ error: 'userId and a valid role are required' }, { status: 400 })
    }
    if (role === 'MEMBER') {
      const adminCount = await prisma.groupMember.count({ where: { groupId, role: 'ADMIN' } })
      const target = await prisma.groupMember.findFirst({ where: { groupId, userId } })
      if (target?.role === 'ADMIN' && adminCount <= 1) {
        return NextResponse.json({ error: 'A group needs at least one admin' }, { status: 400 })
      }
    }

    await prisma.groupMember.updateMany({ where: { groupId, userId }, data: { role } })
    await notifyGroupChanged(groupId)
    return NextResponse.json({ members: await listMembers(groupId, result.dbUser.id) })
  } catch (e) {
    console.error('Group role change error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Remove a member (admins only): ?userId=...
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: groupId } = await params
    const result = await loadMembership(groupId)
    if (result.error) return result.error
    if (result.member.role !== 'ADMIN') return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

    const userId = new URL(req.url).searchParams.get('userId')
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
    if (userId === result.dbUser.id) return NextResponse.json({ error: 'Use "Exit group" to leave' }, { status: 400 })

    const removed = await prisma.user.findUnique({ where: { id: userId }, select: { clerkId: true } })
    await prisma.groupMember.deleteMany({ where: { groupId, userId } })
    if (removed) {
      evictFromChat([removed.clerkId], groupId)
      emitToUsers([removed.clerkId], 'conversation:removed', { id: groupId })
    }
    await notifyGroupChanged(groupId)
    return NextResponse.json({ members: await listMembers(groupId, result.dbUser.id) })
  } catch (e) {
    console.error('Group remove member error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
