import { join } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { prisma } from '@/lib/prisma'

/**
 * Where uploaded files live on disk. Locally this is public/uploads; in production set
 * UPLOAD_DIR to a persistent volume (e.g. a Railway Volume mounted at /data/uploads).
 * server.js serves everything under this directory at /uploads/*.
 */
export function uploadRoot() {
  return process.env.UPLOAD_DIR || join(process.cwd(), 'public', 'uploads')
}

/**
 * "disk" writes to UPLOAD_DIR (fast; needs a persistent disk in production).
 * "database" stores the bytes in MySQL so files survive restarts on hosts with no persistent disk
 * (e.g. Render's free plan). Default: database in production unless UPLOAD_DIR is set, disk otherwise.
 */
export function storageMode(): 'disk' | 'database' {
  const explicit = (process.env.UPLOAD_STORAGE || '').toLowerCase()
  if (explicit === 'disk' || explicit === 'database') return explicit
  return process.env.NODE_ENV === 'production' && !process.env.UPLOAD_DIR ? 'database' : 'disk'
}

/** Save an uploaded file and return the URL the app should reference. */
export async function saveUpload(opts: {
  buffer: Buffer
  storedName: string
  originalName: string
  mimeType: string
  ownerId: string
  subdir?: string
}): Promise<string> {
  if (storageMode() === 'database') {
    const row = await prisma.mediaFile.create({
      data: {
        ownerId: opts.ownerId,
        mimeType: opts.mimeType || 'application/octet-stream',
        fileName: opts.originalName.slice(0, 255),
        size: opts.buffer.length,
        data: opts.buffer,
      },
      select: { id: true },
    })
    return `/media/${row.id}`
  }
  const dir = opts.subdir ? join(uploadRoot(), opts.subdir) : uploadRoot()
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, opts.storedName), opts.buffer)
  return `/uploads/${opts.subdir ? `${opts.subdir}/` : ''}${opts.storedName}`
}
