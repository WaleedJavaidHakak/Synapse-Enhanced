import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

// Serves uploads stored in the database (UPLOAD_STORAGE=database). Ids are unguessable cuids,
// the same model as /uploads/* links on disk.

// Only these are rendered inline; anything else is downloaded so a forged content type can never
// run HTML or script on this origin.
const INLINE_TYPES = /^(image\/(jpeg|png|gif|webp|avif|heic|bmp)|video\/(mp4|webm|quicktime|x-matroska)|audio\/(mpeg|mp4|ogg|wav|webm|aac|x-m4a)|application\/pdf)$/

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const file = await prisma.mediaFile.findUnique({ where: { id }, select: { mimeType: true, fileName: true, size: true, data: true } })
  if (!file) return new Response('Not found', { status: 404 })

  const mime = file.mimeType.split(';')[0].trim().toLowerCase()
  const inline = INLINE_TYPES.test(mime)
  const headers: Record<string, string> = {
    'Content-Type': inline ? mime : 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=31536000, immutable',
    'Accept-Ranges': 'bytes',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'",
  }

  const bytes = Buffer.from(file.data)
  const range = req.headers.get('range')
  if (range) {
    // Range requests let audio/video players seek (and Safari requires them for media)
    const match = /bytes=(\d*)-(\d*)/.exec(range)
    const start = match && match[1] ? parseInt(match[1], 10) : 0
    const end = match && match[2] ? Math.min(parseInt(match[2], 10), bytes.length - 1) : bytes.length - 1
    if (start >= bytes.length || start > end) {
      return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${bytes.length}` } })
    }
    return new Response(bytes.subarray(start, end + 1), {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': String(end - start + 1) },
    })
  }
  return new Response(bytes, { status: 200, headers: { ...headers, 'Content-Length': String(bytes.length) } })
}
