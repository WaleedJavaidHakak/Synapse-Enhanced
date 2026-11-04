import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentDbUser } from '@/lib/messages'
import { emitToUsers } from '@/lib/realtime'

const VISIBILITY = ['EVERYONE', 'CONNECTIONS', 'NOBODY'] as const
const PERMISSIONS = ['EVERYONE', 'REQUESTS', 'NOBODY'] as const
const VISIBILITY_FIELDS = ['profilePhotoVisibility', 'aboutVisibility', 'lastSeenVisibility', 'phoneVisibility', 'emailVisibility'] as const

const privacySelect = {
  isDiscoverable: true,
  readReceipts: true,
  messagePermission: true,
  profilePhotoVisibility: true,
  aboutVisibility: true,
  lastSeenVisibility: true,
  phoneVisibility: true,
  emailVisibility: true,
} as const

export async function GET() {
  const me = await getCurrentDbUser()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const settings = await prisma.user.findUnique({ where: { id: me.id }, select: privacySelect })
  const blockedCount = await prisma.userBlock.count({ where: { blockerId: me.id } })
  return NextResponse.json({ settings, blockedCount })
}

export async function PUT(req: NextRequest) {
  try {
    const me = await getCurrentDbUser()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json()

    const data: Record<string, unknown> = {}
    for (const field of VISIBILITY_FIELDS) {
      if (body[field] === undefined) continue
      if (!VISIBILITY.includes(body[field])) return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 })
      data[field] = body[field]
    }
    if (body.messagePermission !== undefined) {
      if (!PERMISSIONS.includes(body.messagePermission)) return NextResponse.json({ error: 'Invalid messagePermission' }, { status: 400 })
      data.messagePermission = body.messagePermission
    }
    if (body.isDiscoverable !== undefined) data.isDiscoverable = !!body.isDiscoverable
    if (body.readReceipts !== undefined) data.readReceipts = !!body.readReceipts

    const settings = await prisma.user.update({ where: { id: me.id }, data, select: privacySelect })
    // server.js caches presence visibility per connected user; tell it to reload
    ;(globalThis as any).__synapseRefreshPrivacy?.(me.clerkId)
    emitToUsers([me.clerkId], 'privacy:updated', settings)
    return NextResponse.json({ settings })
  } catch (e) {
    console.error('Privacy update error:', e)
    return NextResponse.json({ error: 'Failed to update privacy settings' }, { status: 500 })
  }
}
