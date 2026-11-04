'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import EmojiPicker, { Theme as EmojiTheme } from 'emoji-picker-react'
import {
  FileText, Image as ImageIcon, Languages, Mic, Paperclip, Send, Smile, Sparkles, Trash2, Wand2, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTheme } from '@/contexts/ThemeContext'
import type { ChatMessage } from './MessageBubble'

export interface ComposerProps {
  conversationId: string
  disabled?: boolean
  /** Shown instead of the input when you can't message this chat (e.g. blocked) */
  lockedReason?: React.ReactNode
  replyTo: ChatMessage | null
  onClearReply: () => void
  onTyping: (typing: boolean) => void
  onSendText: (text: string) => void
  onSendFiles: (files: File[], caption: string) => void
  onSendVoice: (blob: Blob, durationSeconds: number) => void
}

const MAX_TEXTAREA_PX = 128
const isTouch = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

function replySnippet(m: ChatMessage) {
  if (m.type === 'TEXT') return m.content
  if (m.type === 'IMAGE') return '📷 Photo'
  if (m.type === 'VIDEO') return '🎥 Video'
  if (m.type === 'VOICE' || m.type === 'AUDIO') return '🎤 Voice message'
  return `📄 ${m.fileName || 'Document'}`
}

function formatDuration(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function Composer({
  conversationId, disabled, lockedReason, replyTo, onClearReply, onTyping, onSendText, onSendFiles, onSendVoice,
}: ComposerProps) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const [text, setText] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [showAttach, setShowAttach] = useState(false)
  const [showAi, setShowAi] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiItems, setAiItems] = useState<Array<{ label?: string; text: string }>>([])
  const [translateTo, setTranslateTo] = useState('')
  const [preview, setPreview] = useState<{ files: File[]; urls: string[] } | null>(null)
  const [caption, setCaption] = useState('')
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mediaInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const typingIdle = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordSecondsRef = useRef(0)
  const discardRecording = useRef(false)

  // Drafts survive switching chats (per-chat, in this tab only)
  const drafts = useRef<Map<string, string>>((globalThis as any).__synapseDrafts ||= new Map())
  useEffect(() => {
    setText(drafts.current.get(conversationId) || '')
    setPreview(null)
    setShowAi(false)
    return () => { onTyping(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])
  useEffect(() => { drafts.current.set(conversationId, text) }, [conversationId, text])

  // Focus the input when replying, like WhatsApp
  useEffect(() => { if (replyTo) textareaRef.current?.focus() }, [replyTo])

  const resize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`
    el.style.overflowY = el.scrollHeight > MAX_TEXTAREA_PX ? 'auto' : 'hidden'
  }, [])
  useEffect(resize, [text, resize])

  // Close popovers on outside click / Escape
  useEffect(() => {
    if (!showEmoji && !showAttach && !showAi) return
    const close = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowEmoji(false); setShowAttach(false); setShowAi(false)
      }
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setShowEmoji(false); setShowAttach(false); setShowAi(false) } }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [showEmoji, showAttach, showAi])

  const signalTyping = (hasText: boolean) => {
    if (typingIdle.current) clearTimeout(typingIdle.current)
    onTyping(hasText)
    if (hasText) typingIdle.current = setTimeout(() => onTyping(false), 2500)
  }

  const send = () => {
    const value = text.trim()
    if (!value || disabled) return
    onSendText(value)
    setText('')
    drafts.current.delete(conversationId)
    if (typingIdle.current) clearTimeout(typingIdle.current)
    onTyping(false)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Desktop: Enter sends, Shift+Enter new line. Phones: Enter is a new line, use the send button.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !isTouch()) {
      e.preventDefault()
      send()
    }
  }

  const openPreview = (files: File[]) => {
    const media = files.filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
    if (media.length === 0) return
    setPreview({ files: media.slice(0, 10), urls: media.slice(0, 10).map(f => URL.createObjectURL(f)) })
    setCaption(text.trim())
  }

  const closePreview = () => {
    preview?.urls.forEach(u => URL.revokeObjectURL(u))
    setPreview(null)
    setCaption('')
  }

  const sendPreview = () => {
    if (!preview) return
    onSendFiles(preview.files, caption.trim())
    if (caption.trim() === text.trim()) setText('')
    preview.urls.forEach(u => URL.revokeObjectURL(u))
    setPreview(null)
    setCaption('')
  }

  // Paste an image straight from the clipboard
  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files || [])
    if (files.some(f => f.type.startsWith('image/'))) {
      e.preventDefault()
      openPreview(files)
    }
  }

  const startRecording = async () => {
    if (disabled) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ''
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      const chunks: BlobPart[] = []
      discardRecording.current = false
      recordSecondsRef.current = 0
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        if (discardRecording.current || recordSecondsRef.current < 1) return
        onSendVoice(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }), recordSecondsRef.current)
      }
      recorder.start()
      recorderRef.current = recorder
      setRecording(true)
      setRecordSeconds(0)
      recordTimer.current = setInterval(() => {
        recordSecondsRef.current += 1
        setRecordSeconds(recordSecondsRef.current)
      }, 1000)
    } catch {
      toast.error('Microphone access is needed to record voice messages')
    }
  }

  const stopRecording = (discard: boolean) => {
    discardRecording.current = discard
    if (recordTimer.current) clearInterval(recordTimer.current)
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    recorderRef.current = null
    setRecording(false)
  }

  // Leaving the chat mid-recording: discard it and release the microphone
  useEffect(() => () => {
    if (recordTimer.current) clearInterval(recordTimer.current)
    discardRecording.current = true
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }, [])

  const runAi = async (mode: 'suggest' | 'rewrite' | 'translate') => {
    setAiLoading(true)
    setAiItems([])
    try {
      let res: Response
      if (mode === 'suggest') {
        res = await fetch('/api/ai/reply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId, numSuggestions: 3 }) })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setAiItems((data.suggestions || []).map((t: string) => ({ text: t })))
      } else if (mode === 'rewrite') {
        res = await fetch('/api/ai/assist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, conversationId, numVariants: 3 }) })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setAiItems(data.variants || [])
      } else {
        res = await fetch('/api/ai/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, targetLanguage: translateTo || 'English' }) })
        const data = await res.json()
        if (!res.ok || !data.translated) throw new Error(data.error)
        setText(data.translated)
        setShowAi(false)
      }
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'AI assistant is unavailable right now')
    } finally {
      setAiLoading(false)
    }
  }

  const bar = dark ? 'bg-[#202c33]' : 'bg-[#f0f2f5]'
  const pill = dark ? 'bg-[#2a3942] text-[#e9edef] placeholder:text-[#8696a0]' : 'bg-white text-[#111b21] placeholder:text-[#667781]'
  const icon = dark ? 'text-[#8696a0] hover:text-[#e9edef]' : 'text-[#54656f] hover:text-[#111b21]'
  const panel = dark ? 'bg-[#233138] text-[#e9edef] border-[#2a3942]' : 'bg-white text-[#111b21] border-slate-200'
  const hasText = text.trim().length > 0

  if (lockedReason) {
    return <div className={`${bar} px-4 py-3 text-center text-sm ${dark ? 'text-[#8696a0]' : 'text-[#667781]'}`}>{lockedReason}</div>
  }

  return (
    <div className={`${bar} relative px-2 sm:px-3 py-2`} ref={popoverRef}>
      {replyTo && (
        <div className={`mb-2 flex items-stretch gap-2 rounded-lg ${dark ? 'bg-[#1d282f]' : 'bg-[#e9edef]'} overflow-hidden`}>
          <div className="w-1 bg-emerald-500" />
          <div className="min-w-0 flex-1 py-1.5">
            <div className="text-xs font-semibold text-emerald-600">{replyTo.sender?.name || 'Message'}</div>
            <div className={`truncate text-sm ${dark ? 'text-[#8696a0]' : 'text-[#667781]'}`}>{replySnippet(replyTo)}</div>
          </div>
          <button type="button" onClick={onClearReply} className={`px-3 ${icon}`} aria-label="Cancel reply">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {recording ? (
        <div className="flex items-center gap-3 h-11">
          <button type="button" onClick={() => stopRecording(true)} className={`p-2 rounded-full ${icon}`} aria-label="Discard recording">
            <Trash2 className="h-5 w-5" />
          </button>
          <div className="flex flex-1 items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className={`text-sm tabular-nums ${dark ? 'text-[#e9edef]' : 'text-[#111b21]'}`}>{formatDuration(recordSeconds)}</span>
            <span className={`text-sm ${dark ? 'text-[#8696a0]' : 'text-[#667781]'}`}>Recording…</span>
          </div>
          <button
            type="button"
            onClick={() => stopRecording(false)}
            className="h-11 w-11 flex-shrink-0 rounded-full bg-[#00a884] text-white flex items-center justify-center hover:bg-[#06cf9c] transition-colors"
            aria-label="Send voice message"
          >
            <Send className="h-5 w-5 translate-x-[1px]" />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-1.5 sm:gap-2">
          <div className={`flex flex-1 min-w-0 items-end rounded-3xl ${pill} pl-1 pr-1 shadow-sm`}>
            <button
              type="button"
              onClick={() => { setShowEmoji(v => !v); setShowAttach(false); setShowAi(false) }}
              className={`p-2.5 flex-shrink-0 ${icon}`}
              aria-label="Emoji"
              disabled={disabled}
            >
              <Smile className="h-6 w-6" />
            </button>
            <textarea
              ref={textareaRef}
              rows={1}
              value={text}
              onChange={e => { setText(e.target.value); signalTyping(e.target.value.length > 0) }}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              placeholder={disabled ? 'Connecting…' : 'Type a message'}
              disabled={disabled}
              aria-label="Message"
              className={`flex-1 min-w-0 resize-none bg-transparent py-2.5 text-[15px] leading-6 outline-none ${pill}`}
              style={{ maxHeight: MAX_TEXTAREA_PX }}
            />
            <button
              type="button"
              onClick={() => { setShowAi(v => !v); setShowAttach(false); setShowEmoji(false); setAiItems([]) }}
              className={`p-2.5 flex-shrink-0 ${icon}`}
              aria-label="AI assistant"
              disabled={disabled}
            >
              <Sparkles className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => { setShowAttach(v => !v); setShowEmoji(false); setShowAi(false) }}
              className={`p-2.5 flex-shrink-0 ${icon} transition-transform ${showAttach ? 'rotate-45' : ''}`}
              aria-label="Attach"
              disabled={disabled}
            >
              <Paperclip className="h-5 w-5" />
            </button>
          </div>

          <button
            type="button"
            onClick={hasText ? send : startRecording}
            disabled={disabled}
            className="h-11 w-11 flex-shrink-0 rounded-full bg-[#00a884] text-white flex items-center justify-center hover:bg-[#06cf9c] disabled:opacity-50 transition-colors"
            aria-label={hasText ? 'Send' : 'Record voice message'}
          >
            {hasText ? <Send className="h-5 w-5 translate-x-[1px]" /> : <Mic className="h-5 w-5" />}
          </button>
        </div>
      )}

      <input
        ref={mediaInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={e => { openPreview(Array.from(e.target.files || [])); e.target.value = '' }}
      />
      <input
        ref={docInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.zip,.rar,.7z,.json,.md,audio/*"
        multiple
        className="hidden"
        onChange={e => { const f = Array.from(e.target.files || []); if (f.length) onSendFiles(f, ''); e.target.value = '' }}
      />

      {showAttach && (
        <div className={`absolute bottom-full right-16 mb-2 w-56 rounded-2xl border p-2 shadow-xl z-30 ${panel} animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-150`}>
          <button type="button" onClick={() => { setShowAttach(false); mediaInputRef.current?.click() }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-black/5 dark:hover:bg-white/5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#007bfc]"><ImageIcon className="h-4 w-4 text-white" /></span>
            Photos & videos
          </button>
          <button type="button" onClick={() => { setShowAttach(false); docInputRef.current?.click() }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-black/5 dark:hover:bg-white/5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#7f66ff]"><FileText className="h-4 w-4 text-white" /></span>
            Document
          </button>
        </div>
      )}

      {showEmoji && (
        <div className="absolute bottom-full left-2 mb-2 z-30 animate-in fade-in-0 slide-in-from-bottom-2 duration-150">
          <EmojiPicker
            theme={dark ? EmojiTheme.DARK : EmojiTheme.LIGHT}
            width={Math.min(350, typeof window !== 'undefined' ? window.innerWidth - 24 : 350)}
            height={400}
            lazyLoadEmojis
            onEmojiClick={d => {
              const el = textareaRef.current
              const start = el?.selectionStart ?? text.length
              const end = el?.selectionEnd ?? text.length
              const next = text.slice(0, start) + d.emoji + text.slice(end)
              setText(next)
              requestAnimationFrame(() => {
                el?.focus()
                el?.setSelectionRange(start + d.emoji.length, start + d.emoji.length)
              })
            }}
          />
        </div>
      )}

      {showAi && (
        <div className={`absolute bottom-full right-2 mb-2 w-[min(420px,calc(100vw-1rem))] rounded-2xl border p-3 shadow-xl z-30 ${panel} animate-in fade-in-0 slide-in-from-bottom-2 duration-150`}>
          <div className="mb-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => runAi('suggest')} className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs hover:bg-black/5 dark:hover:bg-white/5">
              <Sparkles className="h-3.5 w-3.5" /> Suggest replies
            </button>
            <button type="button" disabled={!hasText} onClick={() => runAi('rewrite')} className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/5">
              <Wand2 className="h-3.5 w-3.5" /> Rewrite draft
            </button>
          </div>
          <div className="mb-2 flex items-center gap-2">
            <Languages className="h-4 w-4 flex-shrink-0 opacity-70" />
            <input
              value={translateTo}
              onChange={e => setTranslateTo(e.target.value)}
              placeholder="Translate draft to… (e.g. Hindi)"
              className={`flex-1 min-w-0 rounded-full border px-3 py-1.5 text-xs bg-transparent outline-none`}
            />
            <button type="button" disabled={!hasText} onClick={() => runAi('translate')} className="rounded-full bg-[#00a884] px-3 py-1.5 text-xs text-white disabled:opacity-40">
              Translate
            </button>
          </div>
          {aiLoading && <div className="py-3 text-center text-xs opacity-70">Thinking…</div>}
          {aiItems.length > 0 && (
            <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
              {aiItems.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { setText(item.text); setShowAi(false); textareaRef.current?.focus() }}
                  className="rounded-xl border px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                >
                  {item.text}
                  {item.label && <div className="mt-0.5 text-[10px] uppercase tracking-wide opacity-60">{item.label}</div>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {preview && (
        <div className={`fixed inset-0 z-50 flex flex-col ${dark ? 'bg-[#0b141a]' : 'bg-[#e9edef]'}`} role="dialog" aria-label="Send media">
          <div className="flex items-center gap-3 px-4 py-3">
            <button type="button" onClick={closePreview} className={`rounded-full p-2 ${icon}`} aria-label="Cancel">
              <X className="h-6 w-6" />
            </button>
            <span className={`text-sm ${dark ? 'text-[#e9edef]' : 'text-[#111b21]'}`}>
              {preview.files.length} {preview.files.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          <div className="flex flex-1 min-h-0 items-center justify-center p-4">
            {preview.files[0].type.startsWith('video/') ? (
              <video src={preview.urls[0]} controls className="max-h-full max-w-full rounded-lg" />
            ) : (
              <img src={preview.urls[0]} alt="Preview" className="max-h-full max-w-full rounded-lg object-contain" />
            )}
          </div>
          {preview.files.length > 1 && (
            <div className="flex justify-center gap-2 px-4 pb-2 overflow-x-auto">
              {preview.urls.map((u, i) => (
                preview.files[i].type.startsWith('video/')
                  ? <video key={u} src={u} className="h-14 w-14 rounded-md object-cover" />
                  : <img key={u} src={u} alt="" className="h-14 w-14 rounded-md object-cover" />
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 px-4 pb-4 pt-2 max-w-3xl w-full mx-auto">
            <input
              autoFocus
              value={caption}
              onChange={e => setCaption(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendPreview() } }}
              placeholder="Add a caption…"
              className={`flex-1 min-w-0 rounded-full px-4 py-3 text-[15px] outline-none ${pill}`}
            />
            <button
              type="button"
              onClick={sendPreview}
              className="h-12 w-12 flex-shrink-0 rounded-full bg-[#00a884] text-white flex items-center justify-center hover:bg-[#06cf9c]"
              aria-label="Send"
            >
              <Send className="h-5 w-5 translate-x-[1px]" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
