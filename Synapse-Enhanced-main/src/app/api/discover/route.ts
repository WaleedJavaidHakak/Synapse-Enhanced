import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentDbUser } from '@/lib/messages'
import { getBlockedIds, getConnectionIds, getRelationships, profileSelect, toPublicProfile } from '@/lib/privacy'

const PAGE_SIZE = 24

// Browse people who chose to be discoverable. Results only include what each person allows.
export async function GET(req: NextRequest) {
  try {
    const me = await getCurrentDbUser()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const q = (searchParams.get('q') || '').trim().slice(0, 60)
    const onlineOnly = searchParams.get('online') === '1'
    const page = Math.max(0, parseInt(searchParams.get('page') || '0') || 0)

    const [blocked, connections] = await Promise.all([getBlockedIds(me.id), getConnectionIds(me.id)])

    const rows = await prisma.user.findMany({
      where: {
        id: { notIn: [me.id, ...blocked] },
        isDiscoverable: true,
        ...(onlineOnly ? { isOnline: true, lastSeenVisibility: 'EVERYONE' as const } : {}),
        ...(q ? {
          OR: [
            { name: { contains: q } },
            { interests: { contains: q } },
            { location: { contains: q } },
          ],
        } : {}),
      },
      select: profileSelect,
      // Stable order that reveals nothing private (sorting by online status would leak hidden presence,
      // and a moving sort makes pages overlap)
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE + 1,
    })

    const hasMore = rows.length > PAGE_SIZE
    const pageRows = rows.slice(0, PAGE_SIZE)
    const relationships = await getRelationships(me.id, pageRows.map(r => r.id))

    const people = pageRows.map(owner => {
      const profile = toPublicProfile(owner, { viewerId: me.id, isConnection: connections.has(owner.id) })
      // Hidden "about" never leaks through search: only name/interests/location are searchable
      return { ...profile, relationship: relationships.get(owner.id) || 'none' }
    })

    return NextResponse.json({ people, hasMore, page, discoverable: me.isDiscoverable })
  } catch (e) {
    console.error('Discover error:', e)
    return NextResponse.json({ error: 'Failed to load people' }, { status: 500 })
  }
}
