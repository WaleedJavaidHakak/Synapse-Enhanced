import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentDbUser } from '@/lib/messages'
import { getBlockedIds, getConnectionIds, profileSelect, toPublicProfile } from '@/lib/privacy'

// "Contacts": people you already share a chat or group with. Strangers are found through Discover instead.
export async function GET(req: NextRequest) {
  try {
    const me = await getCurrentDbUser()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const query = (searchParams.get('q') || '').trim().slice(0, 60)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50') || 50, 100)

    const [connections, blocked] = await Promise.all([getConnectionIds(me.id), getBlockedIds(me.id)])
    const ids = [...connections].filter(id => !blocked.has(id))
    if (ids.length === 0) return NextResponse.json({ users: [], total: 0, query })

    const rows = await prisma.user.findMany({
      where: { id: { in: ids }, ...(query ? { name: { contains: query } } : {}) },
      select: profileSelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit,
    })

    const users = rows.map(u => {
      const p = toPublicProfile(u, { viewerId: me.id, isConnection: true })
      return { ...p, isOnline: !!p.isOnline }
    })
    return NextResponse.json({ users, total: users.length, query })
  } catch (error) {
    console.error('User search error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
