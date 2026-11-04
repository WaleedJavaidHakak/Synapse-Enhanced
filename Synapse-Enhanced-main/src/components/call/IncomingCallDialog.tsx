'use client'

import { useEffect } from 'react'
import { Phone, PhoneOff, Video } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export interface IncomingCall {
  conversationId: string
  callType: 'audio' | 'video'
  isGroup: boolean
  chatName?: string
  fromClerkId: string
  fromName: string
  fromImage?: string | null
}

// Two-tone ring generated with WebAudio so no audio asset is needed.
function startRingtone() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    const ctx: AudioContext = new Ctx()
    const ring = () => {
      const now = ctx.currentTime
      ;[0, 0.4].forEach(offset => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.frequency.value = offset === 0 ? 440 : 480
        gain.gain.setValueAtTime(0.0001, now + offset)
        gain.gain.exponentialRampToValueAtTime(0.15, now + offset + 0.05)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.35)
        osc.connect(gain).connect(ctx.destination)
        osc.start(now + offset)
        osc.stop(now + offset + 0.4)
      })
    }
    ring()
    const timer = setInterval(ring, 2000)
    return () => { clearInterval(timer); ctx.close().catch(() => {}) }
  } catch {
    return () => {}
  }
}

export function IncomingCallDialog({ call, onAccept, onDecline }: {
  call: IncomingCall | null
  onAccept: () => void
  onDecline: () => void
}) {
  useEffect(() => {
    if (!call) return
    return startRingtone()
  }, [call])

  // Stop ringing after 45s, like a missed call
  useEffect(() => {
    if (!call) return
    const t = setTimeout(onDecline, 45_000)
    return () => clearTimeout(t)
  }, [call, onDecline])

  return (
    <Dialog open={!!call} onOpenChange={(o) => { if (!o) onDecline() }}>
      <DialogContent className="max-w-sm border-0 bg-gradient-to-b from-[#075E54] to-slate-900 text-white [&>button]:hidden">
        <DialogTitle className="sr-only">Incoming call</DialogTitle>
        {call && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="text-sm text-white/70">
              Incoming {call.callType === 'video' ? 'video' : 'voice'} call{call.isGroup && call.chatName ? ` · ${call.chatName}` : ''}
            </div>
            <img src={call.fromImage || '/default-avatar.svg'} alt={call.fromName} className="h-24 w-24 rounded-full object-cover ring-4 ring-white/10 animate-pulse" />
            <div className="text-xl font-semibold">{call.fromName}</div>
            <div className="mt-4 flex items-center gap-10">
              <div className="flex flex-col items-center gap-2">
                <Button size="icon" className="h-14 w-14 rounded-full bg-red-600 hover:bg-red-700" onClick={onDecline} aria-label="Decline">
                  <PhoneOff className="h-6 w-6 text-white" />
                </Button>
                <span className="text-xs text-white/70">Decline</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Button size="icon" className="h-14 w-14 rounded-full bg-[#25D366] hover:bg-[#1ebe57]" onClick={onAccept} aria-label="Accept">
                  {call.callType === 'video' ? <Video className="h-6 w-6 text-white" /> : <Phone className="h-6 w-6 text-white" />}
                </Button>
                <span className="text-xs text-white/70">Accept</span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
