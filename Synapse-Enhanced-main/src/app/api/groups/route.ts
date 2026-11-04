import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentDbUser } from '@/lib/messages'
import { emitToUsers, previewForMessage } from '@/lib/realtime'
import { getBlockedIds, getConnectionIds } from '@/lib/privacy'

export async function GET() {
  try {
    const dbUser = await getCurrentDbUser()
    if (!dbUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const groupMembers = await prisma.groupMember.findMany({
      where: { userId: dbUser.id, group: { isActive: true } },
      include: {
        group: {
          include: {
            members: { include: { user: { select: { id: true, clerkId: true, name: true, imageUrl: true } } } },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { sender: { select: { id: true, name: true } } },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    })

    const unreadCounts = await Promise.all(groupMembers.map(gm =>
      prisma.message.count({
        where: {
          groupId: gm.groupId,
          senderId: { not: dbUser.id },
          isDeleted: false,
          createdAt: { gt: gm.lastReadAt },
        },
      })
    ))

    const groups = groupMembers.map((gm, index) => {
      const g = gm.group
      const last = g.messages[0]
      return {
        id: g.id,
        type: 'GROUP' as const,
        name: g.name,
        description: g.description,
        imageUrl: g.imageUrl,
        myRole: gm.role,
        lastMessage: last
          ? {
              content: previewForMessage(last),
              timestamp: last.createdAt,
              senderId: last.senderId,
              senderName: last.sender?.name || 'Unknown',
            }
          : null,
        unreadCount: unreadCounts[index],
        isOnline: false,
        updatedAt: g.updatedAt,
        participants: g.members.map((m) => ({ id: m.user.id, clerkId: m.user.clerkId, name: m.user.name, imageUrl: m.user.imageUrl })),
      }
    })

    return NextResponse.json({ groups })
  } catch (e) {
    console.error('Groups list error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const dbUser = await getCurrentDbUser()
    if (!dbUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { name, imageUrl, description, memberIds } = await req.json()
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Group name required' }, { status: 400 })
    }

    // Only people you already talk to can be added; strangers must accept a request first
    const [connections, blocked] = await Promise.all([getConnectionIds(dbUser.id), getBlockedIds(dbUser.id)])
    const uniqueMemberIds: string[] = (Array.isArray(memberIds) ? Array.from(new Set(memberIds.map(String))) : [])
      .filter(id => connections.has(id) && !blocked.has(id))
    if (!uniqueMemberIds.includes(dbUser.id)) uniqueMemberIds.push(dbUser.id)

    const group = await prisma.group.create({
      data: {
        name: name.trim(),
        imageUrl: imageUrl || null,
        description: description || null,
        creatorId: dbUser.id,
        members: {
          create: uniqueMemberIds.map((uid) => ({ userId: uid, role: uid === dbUser.id ? 'ADMIN' : 'MEMBER' })),
        },
      },
      include: {
        members: { include: { user: { select: { id: true, clerkId: true, name: true, imageUrl: true } } } },
      },
    })

    emitToUsers(
      // Includes the creator so their presence cache learns the new connections too
      group.members.map(m => m.user.clerkId),
      'conversations:refresh',
      { id: group.id }
    )

    return NextResponse.json({
      group: {
        id: group.id,
        type: 'GROUP',
        name: group.name,
        description: group.description,
        imageUrl: group.imageUrl,
        myRole: 'ADMIN',
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
        participants: group.members.map((m) => ({ id: m.user.id, clerkId: m.user.clerkId, name: m.user.name, imageUrl: m.user.imageUrl })),
      },
    })
  } catch (e) {
    console.error('Group create error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
