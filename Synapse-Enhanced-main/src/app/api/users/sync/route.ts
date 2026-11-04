import { NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'

// Creates or links the app's user row for the signed-in Clerk user. Runs on every app load,
// so it must never fail for a legitimately signed-in person.
export async function POST() {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const primaryEmail =
      user.emailAddresses.find(e => e.id === user.primaryEmailAddressId)?.emailAddress ||
      user.emailAddresses[0]?.emailAddress ||
      ''
    // email is unique in the schema; accounts without one (some OAuth/phone sign-ups) get a stable placeholder
    const email = primaryEmail || `${user.id}@users.synapse.local`
    // Real names read better in chats and Discover; the username is the fallback
    const clerkName =
      user.fullName ||
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.username ||
      primaryEmail.split('@')[0] ||
      'Synapse user'

    const existing = await prisma.user.findUnique({ where: { clerkId: user.id } })
    if (existing) {
      // Keep the name/photo the user chose in the app; only fill gaps and refresh presence
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: {
          ...(existing.email !== email && !(await emailTaken(email, existing.id)) ? { email } : {}),
          ...(existing.name ? {} : { name: clerkName }),
          ...(existing.imageUrl ? {} : { imageUrl: user.imageUrl }),
          isOnline: true,
          lastSeen: new Date(),
        },
      })
      return NextResponse.json({ user: updated })
    }

    // Same email under a different Clerk id: the person re-created their account or switched Clerk
    // instances (dev → prod, email → Google). Relink instead of failing on the unique email.
    const byEmail = primaryEmail ? await prisma.user.findUnique({ where: { email } }) : null
    if (byEmail) {
      const relinked = await prisma.user.update({
        where: { id: byEmail.id },
        data: { clerkId: user.id, isOnline: true, lastSeen: new Date() },
      })
      return NextResponse.json({ user: relinked })
    }

    const created = await prisma.user.create({
      data: {
        clerkId: user.id,
        name: clerkName,
        email,
        imageUrl: user.imageUrl,
        phone: user.phoneNumbers[0]?.phoneNumber || null,
        isOnline: true,
        lastSeen: new Date(),
      },
    })
    return NextResponse.json({ user: created })
  } catch (error) {
    console.error('User sync error:', error)
    return NextResponse.json(
      { error: 'Could not set up your account', details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined },
      { status: 500 }
    )
  }
}

async function emailTaken(email: string, exceptUserId: string) {
  const other = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  return !!other && other.id !== exceptUserId
}
