import { prisma } from '@/lib/prisma'

export type Visibility = 'EVERYONE' | 'CONNECTIONS' | 'NOBODY'
export type Relationship = 'self' | 'connected' | 'request_sent' | 'request_received' | 'none'

/**
 * "Connections" are people you already talk to: you share a 1:1 chat or a group.
 * Privacy settings set to CONNECTIONS ("My contacts") reveal data only to them.
 */
export async function getConnectionIds(userId: string): Promise<Set<string>> {
  const [convs, groups] = await Promise.all([
    prisma.conversationUser.findMany({ where: { userId }, select: { conversationId: true } }),
    prisma.groupMember.findMany({ where: { userId }, select: { groupId: true } }),
  ])
  const [convPeers, groupPeers] = await Promise.all([
    convs.length
      ? prisma.conversationUser.findMany({
          where: { conversationId: { in: convs.map(c => c.conversationId) }, userId: { not: userId } },
          select: { userId: true },
        })
      : [],
    groups.length
      ? prisma.groupMember.findMany({
          where: { groupId: { in: groups.map(g => g.groupId) }, userId: { not: userId } },
          select: { userId: true },
        })
      : [],
  ])
  return new Set([...convPeers, ...groupPeers].map(p => p.userId))
}

export async function areConnected(a: string, b: string) {
  if (a === b) return true
  const shared = await prisma.conversationUser.findFirst({
    where: { userId: a, conversation: { type: 'DIRECT', users: { some: { userId: b } } } },
    select: { id: true },
  })
  if (shared) return true
  const sharedGroup = await prisma.groupMember.findFirst({
    where: { userId: a, group: { isActive: true, members: { some: { userId: b } } } },
    select: { id: true },
  })
  return !!sharedGroup
}

/** Users that `userId` must not see or interact with: anyone they blocked or who blocked them. */
export async function getBlockedIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  })
  return new Set(rows.map(r => (r.blockerId === userId ? r.blockedId : r.blockerId)))
}

export async function getBlockState(me: string, other: string) {
  const rows = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: me, blockedId: other }, { blockerId: other, blockedId: me }] },
    select: { blockerId: true },
  })
  return {
    blockedByMe: rows.some(r => r.blockerId === me),
    blockedMe: rows.some(r => r.blockerId === other),
  }
}

export function canSee(visibility: Visibility | undefined, isConnection: boolean, isSelf = false) {
  if (isSelf) return true
  if (visibility === 'EVERYONE') return true
  if (visibility === 'CONNECTIONS') return isConnection
  return false
}

type ProfileSource = {
  id: string
  name: string
  imageUrl: string | null
  bio: string
  phone: string | null
  email: string
  interests: string | null
  location: string | null
  isOnline: boolean
  lastSeen: Date
  createdAt: Date
  profilePhotoVisibility: Visibility
  aboutVisibility: Visibility
  lastSeenVisibility: Visibility
  phoneVisibility: Visibility
  emailVisibility: Visibility
  messagePermission: 'EVERYONE' | 'REQUESTS' | 'NOBODY'
}

export const profileSelect = {
  id: true,
  name: true,
  imageUrl: true,
  bio: true,
  phone: true,
  email: true,
  interests: true,
  location: true,
  isOnline: true,
  lastSeen: true,
  createdAt: true,
  isDiscoverable: true,
  profilePhotoVisibility: true,
  aboutVisibility: true,
  lastSeenVisibility: true,
  phoneVisibility: true,
  emailVisibility: true,
  messagePermission: true,
} as const

/** Strip everything the owner hasn't chosen to show this viewer. Blocked viewers see only the name. */
export function toPublicProfile(owner: ProfileSource, opts: { viewerId: string; isConnection: boolean; blocked?: boolean }) {
  const self = owner.id === opts.viewerId
  const c = opts.isConnection
  if (opts.blocked && !self) {
    return {
      id: owner.id, name: owner.name, imageUrl: null, bio: null, phone: null, email: null,
      interests: null, location: null, isOnline: null, lastSeen: null, joinedAt: null, messagePermission: 'NOBODY' as const,
    }
  }
  const showPresence = canSee(owner.lastSeenVisibility, c, self)
  return {
    id: owner.id,
    name: owner.name,
    imageUrl: canSee(owner.profilePhotoVisibility, c, self) ? owner.imageUrl : null,
    bio: canSee(owner.aboutVisibility, c, self) ? owner.bio : null,
    phone: canSee(owner.phoneVisibility, c, self) ? owner.phone : null,
    email: canSee(owner.emailVisibility, c, self) && !owner.email.endsWith('@users.synapse.local') ? owner.email : null,
    interests: owner.interests,
    location: owner.location,
    isOnline: showPresence ? owner.isOnline : null,
    lastSeen: showPresence ? owner.lastSeen : null,
    joinedAt: owner.createdAt,
    messagePermission: owner.messagePermission,
  }
}

/** Relationship between viewer and each target, for buttons like "Message" / "Request sent" / "Accept". */
export async function getRelationships(viewerId: string, targetIds: string[]): Promise<Map<string, Relationship>> {
  const result = new Map<string, Relationship>()
  if (targetIds.length === 0) return result
  const [directs, requests] = await Promise.all([
    prisma.conversationUser.findMany({
      where: {
        userId: { in: targetIds },
        conversation: { type: 'DIRECT', users: { some: { userId: viewerId } } },
      },
      select: { userId: true },
    }),
    prisma.chatRequest.findMany({
      where: {
        status: 'PENDING',
        OR: [
          { senderId: viewerId, receiverId: { in: targetIds } },
          { receiverId: viewerId, senderId: { in: targetIds } },
        ],
      },
      select: { senderId: true, receiverId: true },
    }),
  ])
  for (const id of targetIds) result.set(id, id === viewerId ? 'self' : 'none')
  for (const r of requests) {
    if (r.senderId === viewerId) result.set(r.receiverId, 'request_sent')
    else result.set(r.senderId, 'request_received')
  }
  for (const d of directs) result.set(d.userId, 'connected')
  return result
}
