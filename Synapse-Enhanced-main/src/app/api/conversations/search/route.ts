import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentDbUser } from '@/lib/messages'
import { canSee, getBlockedIds } from '@/lib/privacy'
import { previewForMessage } from '@/lib/realtime'

/**
 * Sidebar search: your chats (1:1 and groups) whose name or messages match the query.
 * Each result has the same shape as the chat list, with the latest matching message as preview.
 */
export async function GET(req: NextRequest) {
  try {
    const me = await getCurrentDbUser()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const q = (new URL(req.url).searchParams.get('q') || '').trim().slice(0, 100)
    if (!q) return NextResponse.json({ conversations: [], total: 0, query: '' })

    const messageMatch = {
      isDeleted: false,
      OR: [{ content: { contains: q } }, { fileName: { contains: q } }],
    }
    const senderSelect = { select: { id: true, name: true } }
    const userSelect = { select: { id: true, name: true, imageUrl: true, profilePhotoVisibility: true } }

    const [directs, groups, blocked] = await Promise.all([
      prisma.conversationUser.findMany({
        where: { userId: me.id },
        select: {
          conversation: {
            select: {
              id: true,
              updatedAt: true,
              users: { select: { userId: true, user: userSelect } },
              messages: { where: messageMatch, include: { sender: senderSelect }, orderBy: { createdAt: 'desc' }, take: 1 },
              _count: { select: { messages: { where: messageMatch } } },
            },
          },
        },
      }),
      prisma.groupMember.findMany({
        where: { userId: me.id, group: { isActive: true } },
        select: {
          group: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
              updatedAt: true,
              members: { select: { user: { select: { id: true, name: true, imageUrl: true } } } },
              messages: { where: messageMatch, include: { sender: senderSelect }, orderBy: { createdAt: 'desc' }, take: 1 },
              _count: { select: { messages: { where: messageMatch } } },
            },
          },
        },
      }),
      getBlockedIds(me.id),
    ])

    const lower = q.toLowerCase()
    type Result = {
      id: string; type: 'DIRECT' | 'GROUP'; name: string; imageUrl: string | null; isBlocked?: boolean
      lastMessage: { content: string; timestamp: Date; senderId: string; senderName: string; messageId: string } | null
      unreadCount: number; isOnline: boolean; participants: Array<{ id: string; name: string }>; matchCount: number
    }
    const results: Result[] = []

    for (const { conversation: c } of directs) {
      const other = c.users.find(u => u.userId !== me.id)?.user
      if (!other) continue
      const nameMatches = other.name.toLowerCase().includes(lower)
      const hit = c.messages[0]
      if (!hit && !nameMatches) continue
      const isBlocked = blocked.has(other.id)
      results.push({
        id: c.id,
        type: 'DIRECT',
        name: other.name,
        imageUrl: !isBlocked && canSee(other.profilePhotoVisibility, true) ? other.imageUrl : null,
        isBlocked,
        lastMessage: hit ? { content: previewForMessage(hit), timestamp: hit.createdAt, senderId: hit.senderId, senderName: hit.sender.name, messageId: hit.id } : null,
        unreadCount: 0,
        isOnline: false,
        participants: c.users.map(u => ({ id: u.user.id, name: u.user.name })),
        matchCount: c._count.messages,
      })
    }

    for (const { group: g } of groups) {
      const nameMatches = g.name.toLowerCase().includes(lower)
      const hit = g.messages[0]
      if (!hit && !nameMatches) continue
      results.push({
        id: g.id,
        type: 'GROUP',
        name: g.name,
        imageUrl: g.imageUrl,
        lastMessage: hit ? { content: previewForMessage(hit), timestamp: hit.createdAt, senderId: hit.senderId, senderName: hit.sender.name, messageId: hit.id } : null,
        unreadCount: 0,
        isOnline: false,
        participants: g.members.map(m => ({ id: m.user.id, name: m.user.name })),
        matchCount: g._count.messages,
      })
    }

    results.sort((a, b) => new Date(b.lastMessage?.timestamp || 0).getTime() - new Date(a.lastMessage?.timestamp || 0).getTime())
    return NextResponse.json({ conversations: results.slice(0, 50), total: results.length, query: q })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
