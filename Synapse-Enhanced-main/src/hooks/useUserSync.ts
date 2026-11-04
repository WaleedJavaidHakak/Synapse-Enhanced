'use client'

import { useEffect, useState, useCallback } from 'react'
import { useUser } from '@clerk/nextjs'

export interface DbUser {
  id: string
  clerkId: string
  name: string
  email: string
  imageUrl?: string
  phone?: string
  bio?: string
  interests?: string | null
  location?: string | null
  isOnline: boolean
  lastSeen: string
  isDiscoverable?: boolean
  readReceipts?: boolean
  profilePhotoVisibility?: 'EVERYONE' | 'CONNECTIONS' | 'NOBODY'
  aboutVisibility?: 'EVERYONE' | 'CONNECTIONS' | 'NOBODY'
  lastSeenVisibility?: 'EVERYONE' | 'CONNECTIONS' | 'NOBODY'
  phoneVisibility?: 'EVERYONE' | 'CONNECTIONS' | 'NOBODY'
  emailVisibility?: 'EVERYONE' | 'CONNECTIONS' | 'NOBODY'
  messagePermission?: 'EVERYONE' | 'REQUESTS' | 'NOBODY'
}

// One sync per signed-in user per page load, shared by every component that calls the hook.
let inflight: { clerkId: string; promise: Promise<DbUser> } | null = null
const listeners = new Set<(u: DbUser) => void>()

async function requestSync(attempts = 3): Promise<DbUser> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch('/api/users/sync', { method: 'POST' })
      const data = await response.json().catch(() => ({}))
      if (response.ok && data.user) return data.user
      lastError = new Error(data.error || `Sync failed (${response.status})`)
    } catch (e) {
      lastError = e
    }
    // Brief backoff: right after sign-up the session cookie can lag behind the redirect
    await new Promise(r => setTimeout(r, 600 * (i + 1)))
  }
  throw lastError
}

export function publishDbUser(user: DbUser) {
  listeners.forEach(l => l(user))
}

export function useUserSync() {
  const { user, isLoaded } = useUser()
  const [dbUser, setDbUser] = useState<DbUser | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listeners.add(setDbUser)
    return () => { listeners.delete(setDbUser) }
  }, [])

  const syncUser = useCallback(async (force = false) => {
    if (!isLoaded || !user) return
    if (force || !inflight || inflight.clerkId !== user.id) {
      inflight = { clerkId: user.id, promise: requestSync() }
    }
    const current = inflight
    setIsLoading(true)
    setError(null)
    try {
      setDbUser(await current.promise)
    } catch (e) {
      if (inflight === current) inflight = null
      setError(e instanceof Error ? e.message : 'Could not set up your account')
    } finally {
      setIsLoading(false)
    }
  }, [user?.id, isLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  const refreshUser = useCallback(async () => {
    if (!isLoaded || !user) return
    try {
      const response = await fetch('/api/users/profile')
      const data = await response.json()
      if (data.user) publishDbUser(data.user)
    } catch (e) {
      console.error('User refresh error:', e)
    }
  }, [user, isLoaded])

  useEffect(() => {
    syncUser()
  }, [syncUser])

  return { user, isLoaded, dbUser, isLoading, error, refreshUser, syncUser }
}
