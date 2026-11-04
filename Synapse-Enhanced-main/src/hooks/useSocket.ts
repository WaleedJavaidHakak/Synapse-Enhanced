'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuth, useUser } from '@clerk/nextjs'
import { io, Socket } from 'socket.io-client'

/**
 * One Socket.IO connection per signed-in user. It depends only on the user id, so Clerk
 * refreshing its user object never tears down the connection (which used to drop live events).
 */
export const useSocket = () => {
  const { user, isLoaded } = useUser()
  const { getToken } = useAuth()
  const getTokenRef = useRef(getToken)
  getTokenRef.current = getToken
  const userId = user?.id
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!isLoaded || !userId) return

    // Socket.IO runs inside server.js, so it always lives on the same origin as the page
    const s = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    })
    socketRef.current = s
    ;(window as any).appSocket = s

    // Fires on the first connect and on every reconnect; the server needs to know who we are each time
    s.on('connect', async () => {
      setIsConnected(true)
      setConnectionError(null)
      // A fresh session token proves who we are; the server verifies it with Clerk
      s.emit('authenticate', { token: await getTokenRef.current() })
    })
    s.on('auth-error', (e: { message?: string }) => setConnectionError(e?.message || 'Could not verify your session'))
    s.on('authenticated', () => setConnectionError(null))
    s.on('connect_error', (error) => {
      setIsConnected(false)
      setConnectionError(`Connection failed: ${error.message}`)
    })
    s.on('disconnect', (reason) => {
      setIsConnected(false)
      if (reason !== 'io client disconnect') setConnectionError(`Disconnected: ${reason}`)
      // The server closed us on purpose (e.g. redeploy): reconnect manually, Socket.IO won't
      if (reason === 'io server disconnect') s.connect()
    })

    // Reconnect immediately when the tab comes back or the network returns
    const wake = () => { if (!s.connected) s.connect() }
    window.addEventListener('online', wake)
    document.addEventListener('visibilitychange', wake)

    setSocket(s)
    return () => {
      window.removeEventListener('online', wake)
      document.removeEventListener('visibilitychange', wake)
      s.removeAllListeners()
      s.disconnect()
      if ((window as any).appSocket === s) (window as any).appSocket = null
      socketRef.current = null
      setSocket(null)
      setIsConnected(false)
    }
  }, [isLoaded, userId])

  /** Re-identify this socket, e.g. once a new account's database row exists. */
  const reauthenticate = useCallback(async () => {
    const s = socketRef.current
    if (s?.connected && userId) s.emit('authenticate', { token: await getTokenRef.current() })
  }, [userId])

  return { socket, isConnected, connectionError, isLoading: !isLoaded, reauthenticate }
}
