'use client'

import { format } from 'date-fns'
import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import EmojiPicker, { Theme as EmojiTheme } from 'emoji-picker-react'
import {
  AlertCircle, Ban, Check, CheckCheck, ChevronDown, Clock, Copy, CornerUpLeft, Download, FileText, Forward, Pencil, RotateCw,
  SmilePlus, Trash2, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { VoiceMessage } from './VoiceMessage'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { useTheme } from '@/contexts/ThemeContext'

export interface Reaction {
  id: string
  emoji: string
  userId: string
}

export interface ChatMessage {
  id: string
  clientId?: string
  content: string
  type: 'TEXT' | 'IMAGE' | 'FILE' | 'DOCUMENT' | 'VOICE' | 'AUDIO' | 'VIDEO' | string
  conversationId: string
  createdAt: string
  fileUrl?: string | null
  fileName?: string | null
  fileSize?: number | null
  duration?: number | null
  isEdited?: boolean
  isDeleted?: boolean
  isDelivered?: boolean
  isRead?: boolean
  /** Optimistic copy still being saved */
  pending?: boolean
  /** Optimistic copy that failed to save; can be retried */
  failed?: boolean
  sender: {
    id: string
    clerkId?: string
    name: string
    imageUrl?: string | null
  }
  replyTo?: {
    id: string
    content: string
    type?: string
    fileName?: string | null
    sender?: { name?: string }
  } | null
  reactions?: Reaction[]
}

interface Props {
  message: ChatMessage
  isOwn: boolean
  showSender: boolean
  /** First bubble of a run from the same sender gets the WhatsApp "tail" corner */
  showTail: boolean
  currentUserId: string | null
  hideReadReceipts?: boolean
  onReply: (message: ChatMessage) => void
  onForward: (message: ChatMessage) => void
  onEdit: (message: ChatMessage) => void
  onDelete: (message: ChatMessage) => void
  onReact: (message: ChatMessage, emoji: string) => void
  onRetry: (message: ChatMessage) => void
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']
const EDIT_WINDOW_MS = 15 * 60 * 1000

// Stable color per sender name, like WhatsApp group chats
const SENDER_COLORS = ['text-emerald-600', 'text-sky-600', 'text-violet-600', 'text-rose-600', 'text-amber-600', 'text-teal-600', 'text-fuchsia-600']
function senderColor(name: string) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return SENDER_COLORS[h % SENDER_COLORS.length]
}

function formatBytes(bytes?: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function replyPreview(r: NonNullable<ChatMessage['replyTo']>) {
  switch (r.type) {
    case 'IMAGE': return '📷 Photo'
    case 'VIDEO': return '🎥 Video'
    case 'VOICE':
    case 'AUDIO': return '🎤 Voice message'
    case 'FILE':
    case 'DOCUMENT': return `📄 ${r.fileName || r.content || 'Document'}`
    default: return r.content
  }
}

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g
const FORMAT_RE = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`)/g

// WhatsApp-style *bold* _italic_ ~strike~ `mono`, without ever injecting HTML
function renderFormatted(text: string, keyPrefix: string): ReactNode[] {
  return text.split(FORMAT_RE).map((part, i) => {
    const key = `${keyPrefix}-${i}`
    if (part.length > 2) {
      const inner = part.slice(1, -1)
      if (part.startsWith('*') && part.endsWith('*')) return <strong key={key}>{inner}</strong>
      if (part.startsWith('_') && part.endsWith('_')) return <em key={key}>{inner}</em>
      if (part.startsWith('~') && part.endsWith('~')) return <s key={key}>{inner}</s>
      if (part.startsWith('`') && part.endsWith('`')) return <code key={key} className="rounded bg-black/10 px-1 font-mono text-[0.85em]">{inner}</code>
    }
    return part
  })
}

function renderText(text: string, linkClass: string): ReactNode[] {
  return text.split(URL_RE).map((part, i) =>
    i % 2 === 1
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className={`underline break-all ${linkClass}`}>{part}</a>
      : <span key={i}>{renderFormatted(part, String(i))}</span>
  )
}

const EMOJI_ONLY_RE = /^(?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*\s*){1,3}$/u

function MessageBubble({
  message, isOwn, showSender, showTail, currentUserId, hideReadReceipts, onReply, onForward, onEdit, onDelete, onReact, onRetry,
}: Props) {
  const { theme } = useTheme()
  const [showPicker, setShowPicker] = useState(false)
  const [showQuick, setShowQuick] = useState(false)
  const [viewer, setViewer] = useState(false)
  const pickerRef = useRef<HTMLDivElement | null>(null)
  const dark = theme === 'dark'
  const time = format(new Date(message.createdAt), 'HH:mm')
  const deleted = !!message.isDeleted
  const local = message.pending || message.failed

  useEffect(() => {
    if (!showPicker && !showQuick) return
    const onDocClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false)
        setShowQuick(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [showPicker, showQuick])

  const react = (emoji: string) => {
    onReact(message, emoji)
    setShowPicker(false)
    setShowQuick(false)
  }

  const bubbleColor = isOwn
    ? (dark ? 'bg-[#005c4b] text-[#e9edef]' : 'bg-[#d9fdd3] text-[#111b21]')
    : (dark ? 'bg-[#202c33] text-[#e9edef]' : 'bg-white text-[#111b21]')
  const metaColor = dark ? 'text-white/60' : 'text-[#667781]'
  const linkClass = dark ? 'text-sky-300' : 'text-sky-700'

  let ticks: ReactNode = null
  if (isOwn && !deleted) {
    if (message.failed) ticks = <AlertCircle className="h-3.5 w-3.5 text-red-500" aria-label="Not sent" />
    else if (message.pending) ticks = <Clock className={`h-3.5 w-3.5 ${metaColor}`} aria-label="Sending" />
    else if (message.isRead && !hideReadReceipts) ticks = <CheckCheck className="h-4 w-4 text-[#53bdeb]" aria-label="Read" />
    else if (message.isDelivered || (message.isRead && hideReadReceipts)) ticks = <CheckCheck className={`h-4 w-4 ${metaColor}`} aria-label="Delivered" />
    else ticks = <Check className={`h-4 w-4 ${metaColor}`} aria-label="Sent" />
  }

  const canEdit = isOwn && !deleted && !local && message.type === 'TEXT' && Date.now() - new Date(message.createdAt).getTime() < EDIT_WINDOW_MS

  const reactionGroups = Object.values(
    (message.reactions || []).reduce((acc: Record<string, { emoji: string; count: number; mine: boolean }>, r) => {
      acc[r.emoji] ||= { emoji: r.emoji, count: 0, mine: false }
      acc[r.emoji].count += 1
      if (r.userId === currentUserId) acc[r.emoji].mine = true
      return acc
    }, {})
  )

  const isVisualMedia = !deleted && (message.type === 'IMAGE' || message.type === 'VIDEO') && !!message.fileUrl
  const caption = isVisualMedia && message.content && message.content !== message.fileName && message.content !== 'Image' ? message.content : ''
  const emojiOnly = !deleted && message.type === 'TEXT' && EMOJI_ONLY_RE.test(message.content.trim())

  const meta = (
    <span className={`flex items-center gap-1 text-[11px] leading-none whitespace-nowrap ${metaColor}`}>
      {message.isEdited && !deleted && <span>edited</span>}
      {time}
      {ticks}
    </span>
  )

  const tailCorner = showTail ? (isOwn ? 'rounded-tr-none' : 'rounded-tl-none') : ''

  return (
    <div className={`group flex w-full ${isOwn ? 'justify-end' : 'justify-start'} ${showTail ? 'mt-2' : 'mt-0.5'} ${reactionGroups.length ? 'mb-4' : ''} animate-in fade-in-0 duration-150`}>
      <div className={`relative max-w-[85%] sm:max-w-[65%] min-w-0 flex items-start gap-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
        <div className={`relative min-w-0 rounded-lg shadow-sm ${tailCorner} ${emojiOnly ? 'bg-transparent shadow-none' : bubbleColor} ${isVisualMedia ? 'p-1' : 'px-2 pt-1.5 pb-1'} ${message.failed ? 'ring-1 ring-red-400' : ''}`}>
          {showSender && (
            <div className={`text-[13px] font-semibold mb-0.5 ${isVisualMedia ? 'px-1.5 pt-0.5' : ''} ${senderColor(message.sender.name)}`}>{message.sender.name}</div>
          )}

          {!deleted && message.replyTo && (
            <div className={`mb-1 rounded-md border-l-4 border-emerald-500 px-2 py-1 text-xs ${dark ? 'bg-black/20' : 'bg-black/5'}`}>
              <div className="font-semibold text-emerald-600">{message.replyTo.sender?.name || 'Message'}</div>
              <div className="line-clamp-2 opacity-80 break-words">{replyPreview(message.replyTo)}</div>
            </div>
          )}

          {deleted ? (
            <div className={`flex items-center gap-1.5 text-sm italic pr-14 ${metaColor}`}>
              <Ban className="h-3.5 w-3.5 flex-shrink-0" /> {isOwn ? 'You deleted this message' : 'This message was deleted'}
              <span className="absolute bottom-1 right-2">{meta}</span>
            </div>
          ) : (
            <>
              {isVisualMedia && (
                <div className="relative overflow-hidden rounded-md bg-black/5">
                  {message.type === 'IMAGE' ? (
                    <button type="button" className="block" onClick={() => setViewer(true)} aria-label="Open photo">
                      <img
                        src={message.fileUrl!}
                        alt={message.fileName || 'Photo'}
                        loading="lazy"
                        className={`block w-[min(300px,70vw)] max-h-[360px] object-cover ${message.pending ? 'opacity-60' : ''}`}
                      />
                    </button>
                  ) : (
                    <video src={message.fileUrl!} controls preload="metadata" className="block w-[min(300px,70vw)] max-h-[360px] bg-black" />
                  )}
                  {!caption && message.type === 'IMAGE' && (
                    // Time sits on the photo with a soft gradient, like WhatsApp
                    <span className="pointer-events-none absolute bottom-0 right-0 left-0 flex justify-end bg-gradient-to-t from-black/50 to-transparent px-2 pb-1.5 pt-6 [&_*]:!text-white">
                      {meta}
                    </span>
                  )}
                </div>
              )}

              {(message.type === 'VOICE' || message.type === 'AUDIO') && message.fileUrl && (
                <VoiceMessage fileUrl={message.fileUrl} content={message.content} fileSize={message.fileSize ?? undefined} isOwn={isOwn} />
              )}

              {(message.type === 'FILE' || message.type === 'DOCUMENT') && message.fileUrl && (
                <a
                  href={message.fileUrl}
                  download={message.fileName || undefined}
                  className={`flex items-center gap-3 rounded-md p-2 mb-1 w-[min(280px,70vw)] ${dark ? 'bg-black/20' : 'bg-black/5'}`}
                >
                  <FileText className="h-8 w-8 flex-shrink-0 text-rose-500" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{message.fileName || 'Document'}</div>
                    <div className={`text-xs ${metaColor}`}>{formatBytes(message.fileSize)}</div>
                  </div>
                  <Download className={`h-4 w-4 flex-shrink-0 ${metaColor}`} />
                </a>
              )}

              {message.type === 'TEXT' && (
                emojiOnly ? (
                  <div className="text-4xl leading-tight">{message.content}</div>
                ) : (
                  // The invisible spacer reserves room for the time so it never overlaps the last line
                  <div className="text-[14.2px] leading-[19px] whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {renderText(message.content, linkClass)}
                    <span className="inline-block w-[68px]" aria-hidden />
                  </div>
                )
              )}

              {caption && (
                <div className="px-1.5 pt-1 text-[14.2px] leading-[19px] whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {renderText(caption, linkClass)}
                  <span className="inline-block w-[68px]" aria-hidden />
                </div>
              )}

              {(!isVisualMedia || caption) && (
                <span className={`${emojiOnly ? 'flex justify-end mt-0.5' : 'absolute bottom-1 right-2'}`}>{meta}</span>
              )}
              {(message.type === 'FILE' || message.type === 'DOCUMENT' || message.type === 'VOICE' || message.type === 'AUDIO') && <div className="h-3" />}
            </>
          )}

          {message.failed && (
            <button
              type="button"
              onClick={() => onRetry(message)}
              className="mt-1 flex items-center gap-1 text-xs font-medium text-red-500 hover:underline"
            >
              <RotateCw className="h-3 w-3" /> Not sent. Tap to retry
            </button>
          )}

          {reactionGroups.length > 0 && (
            <div className={`absolute -bottom-4 ${isOwn ? 'right-2' : 'left-2'} flex gap-1 z-10`}>
              {reactionGroups.map(({ emoji, count, mine }) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => react(emoji)}
                  title={mine ? 'Remove your reaction' : 'React'}
                  className={`text-xs px-1.5 py-0.5 rounded-full shadow border ${dark ? 'bg-[#233138] border-[#0b141a]' : 'bg-white border-[#efeae2]'} ${mine ? 'ring-1 ring-emerald-500' : ''}`}
                >
                  {emoji}{count > 1 ? ` ${count}` : ''}
                </button>
              ))}
            </div>
          )}

          {!deleted && !local && (
            <div className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity z-10">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={`rounded-full p-0.5 shadow-sm ${isVisualMedia ? 'bg-black/40 text-white' : isOwn ? (dark ? 'bg-[#005c4b]' : 'bg-[#d9fdd3]') : (dark ? 'bg-[#202c33]' : 'bg-white')}`}
                    aria-label="Message options"
                  >
                    <ChevronDown className={`h-4 w-4 ${isVisualMedia ? 'text-white' : metaColor}`} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={isOwn ? 'end' : 'start'}>
                  <DropdownMenuItem onClick={() => onReply(message)}>
                    <CornerUpLeft className="mr-2 h-4 w-4" /> Reply
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowQuick(true)}>
                    <SmilePlus className="mr-2 h-4 w-4" /> React
                  </DropdownMenuItem>
                  {message.type === 'TEXT' && (
                    <DropdownMenuItem onClick={() => { navigator.clipboard?.writeText(message.content); toast.success('Copied') }}>
                      <Copy className="mr-2 h-4 w-4" /> Copy
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => onForward(message)}>
                    <Forward className="mr-2 h-4 w-4" /> Forward
                  </DropdownMenuItem>
                  {canEdit && (
                    <DropdownMenuItem onClick={() => onEdit(message)}>
                      <Pencil className="mr-2 h-4 w-4" /> Edit
                    </DropdownMenuItem>
                  )}
                  {isOwn && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => onDelete(message)}>
                        <Trash2 className="mr-2 h-4 w-4" /> Delete for everyone
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {!deleted && !local && (
          <button
            type="button"
            onClick={() => setShowQuick(v => !v)}
            className={`self-center flex-shrink-0 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity ${dark ? 'text-slate-400 hover:bg-white/10' : 'text-slate-500 hover:bg-black/5'}`}
            aria-label="React"
          >
            <SmilePlus className="h-4 w-4" />
          </button>
        )}

        {(showQuick || showPicker) && (
          <div ref={pickerRef} className={`absolute z-40 bottom-full mb-1 ${isOwn ? 'right-0' : 'left-0'}`}>
            {showPicker ? (
              <EmojiPicker
                theme={dark ? EmojiTheme.DARK : EmojiTheme.LIGHT}
                width={300}
                height={360}
                onEmojiClick={(d) => react(d.emoji)}
              />
            ) : (
              <div className={`flex items-center gap-1 rounded-full px-2 py-1 shadow-lg border ${dark ? 'bg-[#233138] border-slate-700' : 'bg-white border-slate-200'}`}>
                {QUICK_REACTIONS.map(e => (
                  <button key={e} type="button" className="text-xl hover:scale-125 transition-transform" onClick={() => react(e)}>{e}</button>
                ))}
                <button type="button" className={`ml-1 rounded-full h-7 w-7 text-lg ${dark ? 'bg-slate-700 text-white' : 'bg-slate-100'}`} onClick={() => setShowPicker(true)} aria-label="More emojis">+</button>
              </div>
            )}
          </div>
        )}
      </div>

      {viewer && message.fileUrl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4" onClick={() => setViewer(false)} role="dialog" aria-label="Photo viewer">
          <button type="button" className="absolute right-4 top-4 rounded-full p-2 text-white hover:bg-white/10" aria-label="Close">
            <X className="h-6 w-6" />
          </button>
          <a
            href={message.fileUrl}
            download={message.fileName || undefined}
            onClick={e => e.stopPropagation()}
            className="absolute right-16 top-4 rounded-full p-2 text-white hover:bg-white/10"
            aria-label="Download"
          >
            <Download className="h-6 w-6" />
          </a>
          <img src={message.fileUrl} alt={message.fileName || 'Photo'} className="max-h-full max-w-full object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}

// Long chats re-render often (typing, status ticks); skip bubbles whose message didn't change
export default memo(MessageBubble)
