import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { prisma } from '@/lib/prisma'

// Optional Clerk webhook. The app works without it (users are synced on every login via /api/users/sync);
// it only keeps emails current and hides deleted accounts.
type ClerkUserEvent = {
  type: 'user.created' | 'user.updated' | 'user.deleted' | string
  data: {
    id: string
    email_addresses?: Array<{ id: string; email_address: string }>
    primary_email_address_id?: string | null
    first_name?: string | null
    last_name?: string | null
    username?: string | null
    image_url?: string | null
  }
}

function primaryEmail(d: ClerkUserEvent['data']) {
  const list = d.email_addresses || []
  return (list.find(e => e.id === d.primary_email_address_id) || list[0])?.email_address || ''
}

export async function POST(req: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'Webhook not configured' }, { status: 501 })

  const svixId = req.headers.get('svix-id')
  const svixTimestamp = req.headers.get('svix-timestamp')
  const svixSignature = req.headers.get('svix-signature')
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 })
  }

  // Svix signs the exact raw bytes, so verify the raw text (re-serialised JSON would not match)
  const raw = await req.text()
  let evt: ClerkUserEvent
  try {
    evt = new Webhook(secret).verify(raw, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkUserEvent
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    const d = evt.data
    if (evt.type === 'user.created') {
      const email = primaryEmail(d) || `${d.id}@users.synapse.local`
      const existing = await prisma.user.findFirst({ where: { OR: [{ clerkId: d.id }, { email }] }, select: { id: true } })
      if (!existing) {
        await prisma.user.create({
          data: {
            clerkId: d.id,
            email,
            name: [d.first_name, d.last_name].filter(Boolean).join(' ') || d.username || email.split('@')[0] || 'Synapse user',
            imageUrl: d.image_url || null,
          },
        })
      }
    } else if (evt.type === 'user.updated') {
      // Only the email comes from Clerk; name and photo are edited in the app and must not be overwritten
      const email = primaryEmail(d)
      if (email) {
        const taken = await prisma.user.findFirst({ where: { email, NOT: { clerkId: d.id } }, select: { id: true } })
        if (!taken) await prisma.user.updateMany({ where: { clerkId: d.id }, data: { email } })
      }
    } else if (evt.type === 'user.deleted') {
      // Keep messages intact for the other people in those chats, but hide the account everywhere
      await prisma.user.updateMany({
        where: { clerkId: d.id },
        data: {
          name: 'Deleted account',
          imageUrl: null,
          bio: '',
          phone: null,
          interests: null,
          location: null,
          isDiscoverable: false,
          messagePermission: 'NOBODY',
          isOnline: false,
        },
      })
    }
  } catch (e) {
    console.error('Clerk webhook handling error:', evt.type, e)
    return NextResponse.json({ error: 'Webhook handling failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
