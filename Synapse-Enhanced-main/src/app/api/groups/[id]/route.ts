import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentDbUser } from '@/lib/messages'
import { emitToUsers, evictFromChat, getChatMemberClerkIds } from '@/lib/realtime'

async function requireAdmin(groupId: string) {
  const dbUser = await getCurrentDbUser()
  if (!dbUser) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const member = await prisma.groupMember.findFirst({ where: { groupId, userId: dbUser.id, role: 'ADMIN' } })
  if (!member) return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) }
  return { dbUser }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const dbUser = await getCurrentDbUser()
    if (!dbUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id: groupId } = await params

    const me = await prisma.groupMember.findFirst({ where: { groupId, userId: dbUser.id } })
    if (!me) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: { members: { include: { user: { select: { id: true, clerkId: true, name: true, imageUrl: true } } } } },
    })
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

    return NextResponse.json({
      conversation: {
        id: group.id,
        type: 'GROUP',
        name: group.name,
        description: group.description,
        imageUrl: group.imageUrl,
        myRole: me.role,
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
        participants: group.members.map(m => ({ id: m.user.id, clerkId: m.user.clerkId, name: m.user.name, imageUrl: m.user.imageUrl })),
      },
    })
  } catch (e) {
    console.error('Group fetch error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: groupId } = await params
    const result = await requireAdmin(groupId)
    if (result.error) return result.error

    const { name, imageUrl, description } = await req.json()
    if (name !== undefined && !String(name).trim()) {
      return NextResponse.json({ error: 'Group name cannot be empty' }, { status: 400 })
    }

    const updatedGroup = await prisma.group.update({
      where: { id: groupId },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(imageUrl !== undefined ? { imageUrl: String(imageUrl).trim() || null } : {}),
        ...(description !== undefined ? { description: String(description).trim() || null } : {}),
      },
      include: {
        members: { include: { user: { select: { id: true, clerkId: true, name: true, imageUrl: true } } } }
      }
    })

    emitToUsers(updatedGroup.members.map(m => m.user.clerkId), 'conversations:refresh', { id: groupId })

    return NextResponse.json({
      group: {
        id: updatedGroup.id,
        type: 'GROUP',
        name: updatedGroup.name,
        description: updatedGroup.description,
        imageUrl: updatedGroup.imageUrl,
        participants: updatedGroup.members.map((m) => ({
          id: m.user.id,
          clerkId: m.user.clerkId,
          name: m.user.name,
          imageUrl: m.user.imageUrl
        }))
      }
    })
  } catch (e) {
    console.error('Group update error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Admins can delete the group for everyone
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: groupId } = await params
    const result = await requireAdmin(groupId)
    if (result.error) return result.error

    const memberClerkIds = await getChatMemberClerkIds(groupId)
    await prisma.$transaction([
      prisma.groupMember.deleteMany({ where: { groupId } }),
      prisma.group.update({ where: { id: groupId }, data: { isActive: false } }),
    ])
    evictFromChat(memberClerkIds, groupId)
    emitToUsers(memberClerkIds, 'conversation:removed', { id: groupId })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Group delete error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
