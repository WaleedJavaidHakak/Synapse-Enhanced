import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentDbUser } from '@/lib/messages'
import { areConnected, getBlockState, getRelationships, profileSelect, toPublicProfile } from '@/lib/privacy'

const LIMITS = { name: 60, bio: 300, phone: 30, interests: 300, location: 100 }

function clean(value: unknown, max: number) {
  if (value === undefined) return undefined
  if (value === null) return null
  return String(value).trim().slice(0, max)
}

export async function PUT(req: NextRequest) {
  try {
    const me = await getCurrentDbUser()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const name = clean(body.name, LIMITS.name)
    if (name !== undefined && !name) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })

    const imageUrl = body.imageUrl === undefined ? undefined : (String(body.imageUrl || '').trim() || null)
    if (imageUrl && !/^(\/uploads\/|\/media\/|https:\/\/)/.test(imageUrl)) {
      return NextResponse.json({ error: 'Invalid image' }, { status: 400 })
    }

    const updatedUser = await prisma.user.update({
      where: { id: me.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(body.bio !== undefined ? { bio: clean(body.bio, LIMITS.bio) || '' } : {}),
        ...(body.phone !== undefined ? { phone: clean(body.phone, LIMITS.phone) || null } : {}),
        ...(body.interests !== undefined ? { interests: clean(body.interests, LIMITS.interests) || null } : {}),
        ...(body.location !== undefined ? { location: clean(body.location, LIMITS.location) || null } : {}),
        ...(imageUrl !== undefined ? { imageUrl } : {}),
      }
    })

    return NextResponse.json({ success: true, user: updatedUser })
  } catch (error) {
    console.error('Profile update error:', error)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const me = await getCurrentDbUser()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const userId = new URL(req.url).searchParams.get('userId')
    if (!userId || userId === me.id) {
      return NextResponse.json({ user: me })
    }

    const owner = await prisma.user.findUnique({ where: { id: userId }, select: profileSelect })
    if (!owner) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const [connected, blockState, relationships, sharedGroups, pendingRequest] = await Promise.all([
      areConnected(me.id, owner.id),
      getBlockState(me.id, owner.id),
      getRelationships(me.id, [owner.id]),
      prisma.group.findMany({
        where: { isActive: true, AND: [{ members: { some: { userId: me.id } } }, { members: { some: { userId: owner.id } } }] },
        select: { id: true, name: true, imageUrl: true },
        take: 20,
      }),
      prisma.chatRequest.findFirst({
        where: { status: 'PENDING', OR: [{ senderId: me.id, receiverId: owner.id }, { senderId: owner.id, receiverId: me.id }] },
        select: { id: true, message: true, senderId: true, createdAt: true },
      }),
    ])

    // Someone who blocked you never reveals details, even if you block them back
    if (blockState.blockedMe) {
      return NextResponse.json({
        user: toPublicProfile(owner, { viewerId: me.id, isConnection: false, blocked: true }),
        relationship: 'none',
        blockedByMe: blockState.blockedByMe,
        canMessage: false,
        sharedGroups: [],
      })
    }

    const relationship = relationships.get(owner.id) || 'none'
    const sharesGroup = sharedGroups.length > 0
    const canMessage = !blockState.blockedByMe && (
      relationship === 'connected' ||
      owner.messagePermission === 'EVERYONE' ||
      (sharesGroup && owner.messagePermission !== 'NOBODY')
    )

    return NextResponse.json({
      user: toPublicProfile(owner, { viewerId: me.id, isConnection: connected }),
      relationship,
      blockedByMe: blockState.blockedByMe,
      canMessage,
      canRequest: !canMessage && !blockState.blockedByMe && owner.messagePermission === 'REQUESTS' && relationship === 'none',
      sharedGroups,
      request: pendingRequest
        ? { id: pendingRequest.id, message: pendingRequest.message, createdAt: pendingRequest.createdAt, direction: pendingRequest.senderId === me.id ? 'outgoing' : 'incoming' }
        : null,
    })
  } catch (error) {
    console.error('Profile fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 })
  }
}
