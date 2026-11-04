import { NextResponse } from 'next/server'
import { getCurrentDbUser } from '@/lib/messages'

const STUN: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

let meteredCache: { at: number; servers: RTCIceServer[] } | null = null

/**
 * ICE servers for calls, read at request time so TURN can be changed without a rebuild.
 * Either set METERED_DOMAIN + METERED_API_KEY (Metered's free tier, credentials fetched and cached),
 * or a static TURN_URL / TURN_USERNAME / TURN_CREDENTIAL (comma-separate multiple URLs).
 * Without TURN, calls still work when both people are on networks that allow direct connections.
 */
export async function GET() {
  const me = await getCurrentDbUser()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const domain = process.env.METERED_DOMAIN
  const apiKey = process.env.METERED_API_KEY
  if (domain && apiKey) {
    if (meteredCache && Date.now() - meteredCache.at < 10 * 60 * 1000) {
      return NextResponse.json({ iceServers: meteredCache.servers, relay: true })
    }
    try {
      const r = await fetch(`https://${domain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`)
      if (r.ok) {
        const servers = (await r.json()) as RTCIceServer[]
        meteredCache = { at: Date.now(), servers: [...STUN, ...servers] }
        return NextResponse.json({ iceServers: meteredCache.servers, relay: true })
      }
      console.error('Metered TURN credentials request failed:', r.status)
    } catch (e) {
      console.error('Metered TURN credentials error:', e)
    }
  }

  const url = process.env.TURN_URL || process.env.NEXT_PUBLIC_TURN_URL
  if (url) {
    return NextResponse.json({
      iceServers: [
        ...STUN,
        {
          urls: url.split(',').map(u => u.trim()).filter(Boolean),
          username: process.env.TURN_USERNAME || process.env.NEXT_PUBLIC_TURN_USERNAME,
          credential: process.env.TURN_CREDENTIAL || process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
        },
      ],
      relay: true,
    })
  }

  return NextResponse.json({ iceServers: STUN, relay: false })
}
