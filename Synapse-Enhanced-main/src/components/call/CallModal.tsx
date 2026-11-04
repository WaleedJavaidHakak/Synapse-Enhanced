'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuth } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Mic, MicOff, Video as VideoIcon, VideoOff, MonitorUp, MonitorX, PhoneOff } from 'lucide-react'

export type CallRole = 'caller' | 'callee'

type CallModalProps = {
  isOpen: boolean
  onClose: () => void
  roomId: string
  audioOnly?: boolean
  role: CallRole
  peerName?: string
  peerImage?: string | null
}

type Status = 'starting' | 'ringing' | 'connecting' | 'connected' | 'ended' | 'error'

// STUN works on the same network; calls across mobile data/strict NATs need a TURN relay.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  ...(process.env.NEXT_PUBLIC_TURN_URL
    ? [{
        urls: process.env.NEXT_PUBLIC_TURN_URL.split(',').map(u => u.trim()),
        username: process.env.NEXT_PUBLIC_TURN_USERNAME,
        credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
      }]
    : []),
]

function formatDuration(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function CallModal({ isOpen, onClose, roomId, audioOnly, role, peerName, peerImage }: CallModalProps) {
  const [status, setStatus] = useState<Status>('starting')
  const [errorText, setErrorText] = useState('')
  const [micEnabled, setMicEnabled] = useState(true)
  const [camEnabled, setCamEnabled] = useState(!audioOnly)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const { getToken } = useAuth()
  const getTokenRef = useRef(getToken)
  getTokenRef.current = getToken

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([])
  const endedRef = useRef(false)
  // Fetched per call from /api/turn so TURN can be configured on the server without a rebuild
  const iceRef = useRef<RTCIceServer[]>(ICE_SERVERS)

  const attachRemote = useCallback(() => {
    const stream = remoteStreamRef.current
    if (!stream) return
    if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== stream) remoteVideoRef.current.srcObject = stream
    if (remoteAudioRef.current && remoteAudioRef.current.srcObject !== stream) remoteAudioRef.current.srcObject = stream
  }, [])

  const teardown = useCallback(() => {
    if (endedRef.current) return
    endedRef.current = true
    try {
      socketRef.current?.emit('webrtc:leave', { roomId })
      socketRef.current?.disconnect()
    } catch {}
    socketRef.current = null
    try { pcRef.current?.close() } catch {}
    pcRef.current = null
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = null
    screenStreamRef.current?.getTracks().forEach(t => t.stop())
    screenStreamRef.current = null
    remoteStreamRef.current = null
    pendingIceRef.current = []
  }, [roomId])

  const hangUp = useCallback(() => {
    teardown()
    setStatus('ended')
    onClose()
  }, [teardown, onClose])

  const flushIce = useCallback(async () => {
    const pc = pcRef.current
    if (!pc || !pc.remoteDescription) return
    const queued = pendingIceRef.current
    pendingIceRef.current = []
    for (const c of queued) {
      try { await pc.addIceCandidate(c) } catch {}
    }
  }, [])

  const createPeer = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: iceRef.current })
    localStreamRef.current?.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!))

    pc.onicecandidate = (e) => {
      if (e.candidate) socketRef.current?.emit('webrtc:ice-candidate', { roomId, candidate: e.candidate.toJSON() })
    }
    pc.ontrack = (e) => {
      if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream()
      if (!remoteStreamRef.current.getTracks().includes(e.track)) remoteStreamRef.current.addTrack(e.track)
      attachRemote()
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setStatus('connected')
      if (pc.connectionState === 'failed') {
        setErrorText('Connection failed. Both devices may need to be on the same network.')
        setStatus('error')
      }
    }
    pcRef.current = pc
    return pc
  }, [roomId, attachRemote])

  // Start media + signaling when the modal opens
  useEffect(() => {
    if (!isOpen) return
    endedRef.current = false
    setStatus('starting')
    setSeconds(0)
    setErrorText('')
    setIsScreenSharing(false)
    setMicEnabled(true)
    setCamEnabled(!audioOnly)
    let cancelled = false

    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: audioOnly ? false : { width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        localStreamRef.current = stream
        if (localVideoRef.current) localVideoRef.current.srcObject = stream
      } catch {
        setErrorText(audioOnly ? 'Microphone permission is required for calls.' : 'Camera and microphone permission is required for video calls.')
        setStatus('error')
        return
      }

      try {
        const turn = await fetch('/api/turn').then(r => (r.ok ? r.json() : null))
        if (turn?.iceServers?.length) iceRef.current = turn.iceServers
      } catch {}
      if (cancelled) {
        // Closed while loading: release the camera/mic we already opened
        localStreamRef.current?.getTracks().forEach(t => t.stop())
        localStreamRef.current = null
        return
      }

      const s = io(window.location.origin, { transports: ['websocket', 'polling'], forceNew: true })
      socketRef.current = s
      setStatus(role === 'caller' ? 'ringing' : 'connecting')

      // The signalling socket must prove who it is before it may join the chat's call room
      s.on('connect', async () => {
        s.emit('authenticate', { token: await getTokenRef.current() })
        s.emit('webrtc:join', { roomId })
      })

      // Both peers are in the room; the caller makes the offer
      s.on('ready', async () => {
        if (role !== 'caller' || pcRef.current) return
        setStatus('connecting')
        const pc = createPeer()
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        s.emit('webrtc:offer', { roomId, sdp: offer.sdp })
      })

      s.on('webrtc:offer', async ({ sdp }: { sdp: string }) => {
        const pc = pcRef.current || createPeer()
        await pc.setRemoteDescription({ type: 'offer', sdp })
        await flushIce()
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        s.emit('webrtc:answer', { roomId, sdp: answer.sdp })
      })

      s.on('webrtc:answer', async ({ sdp }: { sdp: string }) => {
        const pc = pcRef.current
        if (!pc || pc.signalingState !== 'have-local-offer') return
        await pc.setRemoteDescription({ type: 'answer', sdp })
        await flushIce()
      })

      s.on('webrtc:ice-candidate', async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
        const pc = pcRef.current
        if (!pc || !pc.remoteDescription) {
          pendingIceRef.current.push(candidate)
          return
        }
        try { await pc.addIceCandidate(candidate) } catch {}
      })

      s.on('webrtc:peer-left', () => {
        teardown()
        setStatus('ended')
        setTimeout(onClose, 1200)
      })
    })()

    return () => {
      cancelled = true
      teardown()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, roomId, audioOnly, role])

  // Call timer
  useEffect(() => {
    if (status !== 'connected') return
    const t = setInterval(() => setSeconds(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [status])

  // Video elements may mount after streams arrive
  useEffect(() => {
    attachRemote()
    if (localVideoRef.current && localStreamRef.current && localVideoRef.current.srcObject !== localStreamRef.current) {
      localVideoRef.current.srcObject = screenStreamRef.current || localStreamRef.current
    }
  })

  const toggleMic = () => {
    const track = localStreamRef.current?.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setMicEnabled(track.enabled)
  }

  const toggleCam = () => {
    const track = localStreamRef.current?.getVideoTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setCamEnabled(track.enabled)
  }

  const stopScreenShare = useCallback(async () => {
    const camTrack = localStreamRef.current?.getVideoTracks()[0]
    const sender = pcRef.current?.getSenders().find(s => s.track?.kind === 'video')
    if (sender && camTrack) await sender.replaceTrack(camTrack)
    screenStreamRef.current?.getTracks().forEach(t => t.stop())
    screenStreamRef.current = null
    if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current
    socketRef.current?.emit('webrtc:screen-share-stop', { roomId })
    setIsScreenSharing(false)
  }, [roomId])

  const toggleScreenShare = async () => {
    if (isScreenSharing) return stopScreenShare()
    const sender = pcRef.current?.getSenders().find(s => s.track?.kind === 'video')
    if (!sender) return
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      const screenTrack = display.getVideoTracks()[0]
      await sender.replaceTrack(screenTrack)
      screenStreamRef.current = display
      if (localVideoRef.current) localVideoRef.current.srcObject = display
      screenTrack.onended = () => { stopScreenShare() }
      socketRef.current?.emit('webrtc:screen-share-start', { roomId })
      setIsScreenSharing(true)
    } catch {}
  }

  const statusLabel = {
    starting: 'Starting…',
    ringing: 'Ringing…',
    connecting: 'Connecting…',
    connected: formatDuration(seconds),
    ended: 'Call ended',
    error: errorText || 'Call failed',
  }[status]

  const avatar = (
    <div className="flex flex-col items-center gap-3">
      <img
        src={peerImage || '/default-avatar.svg'}
        alt={peerName || 'Contact'}
        className={`h-28 w-28 rounded-full object-cover ring-4 ring-white/10 ${status === 'ringing' ? 'animate-pulse' : ''}`}
      />
      <div className="text-xl font-semibold text-white">{peerName || 'Contact'}</div>
      <div className="text-sm text-white/70">{statusLabel}</div>
    </div>
  )

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) hangUp() }}>
      <DialogContent className="max-w-3xl border-0 bg-slate-900 p-0 overflow-hidden text-white [&>button]:text-white">
        <DialogTitle className="sr-only">{audioOnly ? 'Voice call' : 'Video call'} with {peerName}</DialogTitle>
        <audio ref={remoteAudioRef} autoPlay />
        <div className="relative w-full aspect-video bg-gradient-to-br from-[#075E54] to-slate-900">
          {!audioOnly && (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className={`absolute inset-0 h-full w-full object-cover ${status === 'connected' ? 'opacity-100' : 'opacity-0'}`}
            />
          )}
          {(audioOnly || status !== 'connected') && (
            <div className="absolute inset-0 flex items-center justify-center">{avatar}</div>
          )}
          {!audioOnly && status === 'connected' && (
            <div className="absolute left-3 top-3 rounded-md bg-black/50 px-2 py-1 text-xs">{peerName} · {statusLabel}</div>
          )}
          {!audioOnly && (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute bottom-3 right-3 h-28 w-40 rounded-lg object-cover ring-2 ring-white/20 bg-black"
            />
          )}
        </div>
        <div className="flex items-center justify-center gap-3 p-4">
          <Button variant="secondary" size="icon" className="h-12 w-12 rounded-full" onClick={toggleMic} title={micEnabled ? 'Mute' : 'Unmute'}>
            {micEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5 text-red-500" />}
          </Button>
          {!audioOnly && (
            <Button variant="secondary" size="icon" className="h-12 w-12 rounded-full" onClick={toggleCam} title={camEnabled ? 'Turn camera off' : 'Turn camera on'}>
              {camEnabled ? <VideoIcon className="h-5 w-5" /> : <VideoOff className="h-5 w-5 text-red-500" />}
            </Button>
          )}
          {!audioOnly && (
            <Button
              variant="secondary"
              size="icon"
              className="h-12 w-12 rounded-full"
              onClick={toggleScreenShare}
              disabled={status !== 'connected'}
              title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
            >
              {isScreenSharing ? <MonitorX className="h-5 w-5" /> : <MonitorUp className="h-5 w-5" />}
            </Button>
          )}
          <Button size="icon" className="h-12 w-12 rounded-full bg-red-600 hover:bg-red-700" onClick={hangUp} title="End call">
            <PhoneOff className="h-5 w-5 text-white" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
