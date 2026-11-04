import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { extname } from 'path';
import { saveUpload } from '@/lib/storage';

const MAX_BYTES = 25 * 1024 * 1024;

const DOCUMENT_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.rtf', '.zip', '.rar', '.7z', '.json', '.md',
]);

// Executable/markup types are never served back from /public, even if renamed.
const BLOCKED_EXTENSIONS = new Set(['.html', '.htm', '.svg', '.js', '.mjs', '.exe', '.bat', '.cmd', '.sh', '.php']);

function classify(file: File): 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' | null {
  const ext = extname(file.name).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) return null;
  if (file.type.startsWith('image/') && file.type !== 'image/svg+xml') return 'IMAGE';
  if (file.type.startsWith('video/')) return 'VIDEO';
  if (file.type.startsWith('audio/')) return 'AUDIO';
  if (DOCUMENT_EXTENSIONS.has(ext)) return 'FILE';
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth()
    const user = clerkUserId ? { id: clerkUserId } : null;
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const kind = classify(file);
    if (!kind) {
      return NextResponse.json({ error: 'This file type is not supported' }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File size must be less than 25MB' }, { status: 400 });
    }

    const ext = extname(file.name).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.bin';
    const storedName = `${Date.now()}-${Math.random().toString(36).substring(2, 12)}${ext}`;
    const url = await saveUpload({
      buffer: Buffer.from(await file.arrayBuffer()),
      storedName,
      originalName: file.name,
      mimeType: file.type,
      ownerId: user.id,
    });

    return NextResponse.json({
      success: true,
      url,
      name: file.name,
      size: file.size,
      type: file.type,
      kind,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
