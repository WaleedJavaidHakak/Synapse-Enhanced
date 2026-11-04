import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentDbUser } from '@/lib/messages'

const REASONS = ['spam', 'harassment', 'inappropriate', 'fake_profile', 'scam', 'other'] as const

// Report a user: { userId, reason, details?, block? }. Reports are stored for whoever runs the deployment to review.
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentDbUser()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { userId, reason, details, block } = await req.json()
    if (!userId || userId === me.id) return NextResponse.json({ error: 'Invalid user' }, { status: 400 })
    if (!REASONS.includes(reason)) return NextResponse.json({ error: 'Choose a reason' }, { status: 400 })
    if (!(await prisma.user.findUnique({ where: { id: userId }, select: { id: true } }))) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // One report per reporter/target per day is plenty
    const recent = await prisma.userReport.findFirst({
      where: { reporterId: me.id, reportedId: userId, createdAt: { gt: new Date(Date.now() - 24 * 3600 * 1000) } },
      select: { id: true },
    })
    if (!recent) {
      await prisma.userReport.create({
        data: { reporterId: me.id, reportedId: userId, reason, details: details ? String(details).slice(0, 1000) : null },
      })
    }

    if (block) {
      await prisma.userBlock.upsert({
        where: { blockerId_blockedId: { blockerId: me.id, blockedId: userId } },
        update: {},
        create: { blockerId: me.id, blockedId: userId },
      })
      await prisma.chatRequest.deleteMany({
        where: { status: 'PENDING', OR: [{ senderId: me.id, receiverId: userId }, { senderId: userId, receiverId: me.id }] },
      })
      ;(globalThis as any).__synapseRefreshPrivacy?.(me.clerkId)
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Report error:', e)
    return NextResponse.json({ error: 'Failed to submit report' }, { status: 500 })
  }
}
