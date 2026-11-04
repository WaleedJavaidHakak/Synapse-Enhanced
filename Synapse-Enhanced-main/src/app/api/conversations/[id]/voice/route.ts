import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentDbUser, messageInclude, scrubMessage } from '@/lib/messages'
import { broadcastNewMessage, getChatAccess } from '@/lib/realtime'
import { saveUpload } from '@/lib/storage'

const MAX_VOICE_BYTES = 25 * 1024 * 1024
import { directChatBlockState } from '@/lib/conversations'

// Voice notes for both direct conversations and groups (the id can be either).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentDbUser = await getCurrentDbUser()
    if (!currentDbUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: chatId } = await params
    const kind = await getChatAccess(chatId, currentDbUser.id)
    if (!kind) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    if (kind === 'DIRECT') {
      const block = await directChatBlockState(chatId, currentDbUser.id)
      if (block.blockedByMe || block.blockedMe) return NextResponse.json({ error: "You can't send messages to this chat" }, { status: 403 })
    }

    const formData = await req.formData()
    const audioFile = formData.get('audio') as File | null
    const durationRaw = formData.get('duration') as string | null
    const replyToId = (formData.get('replyToId') as string | null) || null
    const clientId = (formData.get('clientId') as string | null) || undefined

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
    }
    if (audioFile.size > MAX_VOICE_BYTES) {
      return NextResponse.json({ error: 'Voice message is too long' }, { status: 400 })
    }

    // Chrome/Firefox record WebM/Ogg, Safari records MP4; keep the real format so playback works everywhere
    const mime = audioFile.type.split(';')[0]
    const ext = mime === 'audio/mp4' || mime === 'video/mp4' ? '.m4a' : mime === 'audio/ogg' ? '.ogg' : mime === 'audio/mpeg' ? '.mp3' : '.webm'
    const filename = `voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`
    const fileUrl = await saveUpload({
      buffer: Buffer.from(await audioFile.arrayBuffer()),
      storedName: filename,
      originalName: filename,
      mimeType: ext === '.m4a' ? 'audio/mp4' : ext === '.ogg' ? 'audio/ogg' : ext === '.mp3' ? 'audio/mpeg' : 'audio/webm',
      ownerId: currentDbUser.id,
      subdir: 'voice',
    })

    const duration = durationRaw && !Number.isNaN(Number(durationRaw)) ? Math.round(Number(durationRaw)) : null

    const message = await prisma.message.create({
      data: {
        content: 'Voice message',
        type: 'VOICE',
        ...(kind === 'GROUP' ? { groupId: chatId } : { conversationId: chatId }),
        senderId: currentDbUser.id,
        fileUrl,
        fileName: filename,
        fileSize: audioFile.size,
        duration,
        replyToId,
      },
      include: messageInclude
    })

    if (kind === 'GROUP') {
      await prisma.group.update({ where: { id: chatId }, data: { updatedAt: new Date() } })
    } else {
      await prisma.conversation.update({ where: { id: chatId }, data: { updatedAt: new Date() } })
    }

    void broadcastNewMessage(message, clientId).catch(e => console.error('Broadcast error:', e))
    return NextResponse.json({ message: { ...scrubMessage(message), conversationId: chatId, clientId }, success: true })
  } catch (error) {
    console.error('Voice message error:', error)
    return NextResponse.json({ error: 'Failed to save voice message' }, { status: 500 })
  }
}
