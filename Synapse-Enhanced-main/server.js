// `node server.js --prod` runs production mode on every OS (no inline NODE_ENV needed)
if (process.argv.includes('--prod')) process.env.NODE_ENV = 'production'

const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const { Server } = require('socket.io')
const { PrismaClient } = require('@prisma/client')
const { verifyToken } = require('@clerk/backend')

const dev = process.env.NODE_ENV !== 'production'
const hostname = 'localhost'
const port = process.env.PORT || 3000

const os = require('os')

const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
}

function time() {
  return new Date().toISOString()
}

const log = {
  info: (...args) => console.log(`${ANSI.cyan}[INFO]${ANSI.reset} ${ANSI.dim}${time()}${ANSI.reset} -`, ...args),
  warn: (...args) => console.warn(`${ANSI.yellow}[WARN]${ANSI.reset} ${ANSI.dim}${time()}${ANSI.reset} -`, ...args),
  error: (...args) => console.error(`${ANSI.red}[ERROR]${ANSI.reset} ${ANSI.dim}${time()}${ANSI.reset} -`, ...args),
  ready: (...args) => console.log(`${ANSI.green}[READY]${ANSI.reset} ${ANSI.dim}${time()}${ANSI.reset} -`, ...args)
}
function getLocalIP() {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const interface of interfaces[name]) {
      const { address, family, internal } = interface
      if (family === 'IPv4' && !internal) {
        return address
      }
    }
  }
  return 'localhost'
}

const localIP = getLocalIP()

function displayNetworkInfo() {
  log.info('Network information:')
  log.info(`Local:   http://localhost:${port}`)
  log.info(`Network: http://${localIP}:${port}`)
  log.info(`Socket:  ws://${localIP}:${port}`)
  log.info(`Health:  http://${localIP}:${port}/health`)
  log.info(`Info:    http://${localIP}:${port}/server-info`)
}

// Uploaded media is served from UPLOAD_DIR (a persistent volume in production) rather than
// public/, because a production Next build does not serve files added to public/ after the build.
const fs = require('fs')
const path = require('path')
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'public', 'uploads'))
const MIME_TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
  '.avif': 'image/avif', '.heic': 'image/heic', '.bmp': 'image/bmp',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.aac': 'audio/aac',
  '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.json': 'application/json'
}

function serveUpload(req, res) {
  let relative
  try {
    relative = decodeURIComponent(req.url.split('?')[0].slice('/uploads/'.length))
  } catch {
    res.statusCode = 400
    return res.end('Bad Request')
  }
  const filePath = path.resolve(UPLOAD_DIR, relative)
  if (!filePath.startsWith(UPLOAD_DIR + path.sep)) {
    res.statusCode = 403
    return res.end('Forbidden')
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.statusCode = 404
      return res.end('Not found')
    }
    const ext = path.extname(filePath).toLowerCase()
    const type = MIME_TYPES[ext] || 'application/octet-stream'
    res.setHeader('Content-Type', type)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.setHeader('Accept-Ranges', 'bytes')
    if (type === 'application/octet-stream') res.setHeader('Content-Disposition', 'attachment')

    // Range requests let audio/video players seek
    const range = req.headers.range
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range)
      const start = match && match[1] ? parseInt(match[1], 10) : 0
      const end = match && match[2] ? Math.min(parseInt(match[2], 10), stat.size - 1) : stat.size - 1
      if (start >= stat.size || start > end) {
        res.statusCode = 416
        res.setHeader('Content-Range', `bytes */${stat.size}`)
        return res.end()
      }
      res.statusCode = 206
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`)
      res.setHeader('Content-Length', end - start + 1)
      if (req.method === 'HEAD') return res.end()
      return fs.createReadStream(filePath, { start, end }).pipe(res)
    }
    res.setHeader('Content-Length', stat.size)
    if (req.method === 'HEAD') return res.end()
    fs.createReadStream(filePath).pipe(res)
  })
}

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()
const prisma = new PrismaClient()

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      if (!req.url || typeof req.url !== 'string') {
        res.statusCode = 400
        return res.end('Bad Request')
      }
      
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
      
      if (req.method === 'OPTIONS') {
        res.statusCode = 200
        return res.end()
      }
      
      if (req.url === '/health') {
        res.setHeader('Content-Type', 'application/json')
        return res.end(JSON.stringify({
          status: 'OK',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          activeUsers: activeUsers.size,
          socketConnections: io.engine.clientsCount
        }))
      }
      
      if (req.url === '/server-info') {
        res.setHeader('Content-Type', 'application/json')
        return res.end(JSON.stringify({
          server: 'WhatsApp Clone Server',
          version: '1.0.0',
          localUrl: `http://localhost:${port}`,
          networkUrl: `http://${localIP}:${port}`,
          socketUrl: `ws://${localIP}:${port}`,
          development: dev,
          activeUsers: activeUsers.size,
          socketConnections: io.engine.clientsCount
        }))
      }
      
      if (req.url.startsWith('/uploads/') && (req.method === 'GET' || req.method === 'HEAD')) {
        return serveUpload(req, res)
      }

      const parsedUrl = parse(req.url, true)
      await handle(req, res, parsedUrl)
    } catch (error) {
      log.error('Request handling error:', error)
      res.statusCode = 500
      res.end('Internal Server Error')
    }
  })

  const io = new Server(httpServer, {
    cors: {
      origin: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3001',
        `http://${localIP}:3000`,
        `http://${localIP}:3001`,
        'http://192.168.0.1:3000',
        'http://192.168.0.2:3000',
        'http://192.168.0.100:3000',
        'http://192.168.0.101:3000',
        'http://192.168.0.102:3000',
        'http://192.168.0.103:3000',
        'http://192.168.0.104:3000',
        'http://192.168.0.105:3000',
        'http://192.168.1.1:3000',
        'http://192.168.1.100:3000',
        'http://192.168.1.101:3000',
        'http://192.168.1.102:3000',
        'http://192.168.1.103:3000',
        'http://192.168.1.104:3000',
        'http://192.168.1.105:3000',
        'http://10.0.0.1:3000',
        'http://10.0.0.100:3000',
        'http://10.0.0.101:3000',
        'http://10.0.0.102:3000',
        'http://10.0.0.103:3000',
        'http://10.0.0.104:3000',
        'http://10.0.0.105:3000',
        ...(dev ? ['*'] : [])
      ],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization']
    }
  })

  const activeUsers = new Map() // clerkId -> { dbUserId, userName, userImage, sockets: Set<socketId> }
  globalThis.__synapseIO = io
  // Lets API routes know who is connected right now (for delivered ticks)
  globalThis.__synapseIsOnline = clerkId => (activeUsers.get(clerkId)?.sockets.size || 0) > 0

  io.engine.on('connection_error', err => {
    log.error('Socket.io connection error:', err)
  })

  httpServer.on('error', (err) => {
    log.error('HTTP Server error:', err)
  })

  const chatRooms = id => [`conversation:${id}`, `group:${id}`]

  function previewForMessage(m) {
    if (m.isDeleted) return 'This message was deleted'
    switch (m.type) {
      case 'IMAGE': return '📷 Photo'
      case 'VIDEO': return '🎥 Video'
      case 'VOICE':
      case 'AUDIO': return '🎤 Voice message'
      case 'FILE':
      case 'DOCUMENT': return `📄 ${m.fileName || 'Document'}`
      default: return m.content
    }
  }

  // Members of a chat (direct conversation or group) as { id, clerkId }
  async function getChatMembers(chatId) {
    const [convUsers, groupMembers] = await Promise.all([
      prisma.conversationUser.findMany({ where: { conversationId: chatId }, select: { user: { select: { id: true, clerkId: true } } } }),
      prisma.groupMember.findMany({ where: { groupId: chatId }, select: { user: { select: { id: true, clerkId: true } } } })
    ])
    return [...convUsers, ...groupMembers].map(m => m.user)
  }

  // Privacy-aware presence. Each connected user's entry caches what is needed to decide who may
  // see them online: their lastSeen visibility, their connections (dbId -> clerkId) and blocks.
  async function loadPrivacy(entry) {
    if (!entry.dbUserId) return
    const id = entry.dbUserId
    const [me, convs, groups, blocks] = await Promise.all([
      prisma.user.findUnique({ where: { id }, select: { lastSeenVisibility: true, profilePhotoVisibility: true, name: true, imageUrl: true } }),
      prisma.conversationUser.findMany({ where: { userId: id }, select: { conversationId: true } }),
      prisma.groupMember.findMany({ where: { userId: id }, select: { groupId: true } }),
      prisma.userBlock.findMany({ where: { OR: [{ blockerId: id }, { blockedId: id }] }, select: { blockerId: true, blockedId: true } })
    ])
    const peers = await Promise.all([
      convs.length ? prisma.conversationUser.findMany({ where: { conversationId: { in: convs.map(c => c.conversationId) }, userId: { not: id } }, select: { user: { select: { id: true, clerkId: true } } } }) : [],
      groups.length ? prisma.groupMember.findMany({ where: { groupId: { in: groups.map(g => g.groupId) }, userId: { not: id } }, select: { user: { select: { id: true, clerkId: true } } } }) : []
    ])
    entry.connections = new Map(peers.flat().map(p => [p.user.id, p.user.clerkId]))
    entry.blocked = new Set(blocks.map(b => (b.blockerId === id ? b.blockedId : b.blockerId)))
    entry.lastSeenVisibility = me ? me.lastSeenVisibility : 'NOBODY'
    entry.profilePhotoVisibility = me ? me.profilePhotoVisibility : 'NOBODY'
    if (me) {
      entry.userName = me.name
      entry.userImage = me.imageUrl
    }
  }

  function canSeePresence(subject, viewerDbId) {
    if (!subject || !subject.dbUserId || !viewerDbId) return false
    if (subject.dbUserId === viewerDbId) return true
    if (subject.blocked && subject.blocked.has(viewerDbId)) return false
    if (subject.lastSeenVisibility === 'EVERYONE') return true
    if (subject.lastSeenVisibility === 'CONNECTIONS') return !!subject.connections && subject.connections.has(viewerDbId)
    return false
  }

  function onlineListFor(viewerDbId) {
    return Array.from(activeUsers.entries())
      .filter(([, info]) => info.sockets.size > 0 && canSeePresence(info, viewerDbId))
      .map(([id, info]) => ({ userId: id, dbUserId: info.dbUserId, isOnline: true }))
  }

  // Send a presence event only to the connected users allowed to see this subject
  function emitPresence(subjectClerkId, subject, event, payload) {
    activeUsers.forEach((viewer, viewerClerkId) => {
      if (viewerClerkId === subjectClerkId) return
      if (canSeePresence(subject, viewer.dbUserId)) io.to(`user:${viewerClerkId}`).emit(event, payload)
    })
  }

  // API routes call this after privacy, block or connection changes
  // Accepts one clerk id or a list (e.g. everyone in a group that just changed)
  globalThis.__synapseRefreshPrivacy = async clerkIds => {
    const ids = Array.isArray(clerkIds) ? clerkIds : [clerkIds]
    await Promise.all(ids.map(async id => {
      const entry = activeUsers.get(id)
      if (!entry) return
      try { await loadPrivacy(entry) } catch (e) { log.error('Privacy refresh error:', e) }
    }))
    // Everyone re-requests their visible online list so changes apply immediately
    io.emit('presence:refresh')
  }

  // Messages sent while this user was offline become "delivered" once they connect
  async function markPendingDelivered(dbUserId) {
    const [convs, groups] = await Promise.all([
      prisma.conversationUser.findMany({ where: { userId: dbUserId }, select: { conversationId: true } }),
      prisma.groupMember.findMany({ where: { userId: dbUserId }, select: { groupId: true } })
    ])
    const conversationIds = convs.map(c => c.conversationId)
    const groupIds = groups.map(g => g.groupId)
    if (!conversationIds.length && !groupIds.length) return
    const pending = await prisma.message.findMany({
      where: {
        isDelivered: false,
        senderId: { not: dbUserId },
        OR: [{ conversationId: { in: conversationIds } }, { groupId: { in: groupIds } }]
      },
      select: { id: true, conversationId: true, groupId: true },
      take: 1000
    })
    if (!pending.length) return
    const deliveredAt = new Date()
    await prisma.message.updateMany({ where: { id: { in: pending.map(m => m.id) } }, data: { isDelivered: true, deliveredAt } })
    const byChat = new Map()
    pending.forEach(m => {
      const chatId = m.conversationId || m.groupId
      if (!byChat.has(chatId)) byChat.set(chatId, [])
      byChat.get(chatId).push(m.id)
    })
    byChat.forEach((messageIds, chatId) => {
      io.to(chatRooms(chatId)).emit('message:status', { conversationId: chatId, messageIds, isDelivered: true, deliveredAt })
    })
  }

  io.on('connection', socket => {
    // Room joins can arrive while authenticate is still verifying the token; they wait for it
    let resolveAuth
    const authReady = new Promise(resolve => { resolveAuth = resolve })
    const whenAuthed = () => Promise.race([authReady, new Promise(resolve => setTimeout(resolve, 10000))])
    async function isMember(chatId) {
      await whenAuthed()
      if (!socket.dbUserId || !chatId) return false
      const members = await getChatMembers(chatId)
      return members.some(m => m.id === socket.dbUserId)
    }

    // Simple WebRTC signaling using Socket.IO on the same server
    socket.on('webrtc:join', async ({ roomId } = {}) => {
      if (!roomId) return
      // Call signalling rooms are named after the chat; only its members may join
      if (!(await isMember(roomId))) return
      socket.join(`rtc:${roomId}`)
      const room = io.sockets.adapter.rooms.get(`rtc:${roomId}`)
      const size = room ? room.size : 0
      if (size >= 2) {
        io.to(`rtc:${roomId}`).emit('ready')
      }
    })

    socket.on('webrtc:leave', ({ roomId } = {}) => {
      if (!roomId || !socket.rooms.has(`rtc:${roomId}`)) return
      socket.leave(`rtc:${roomId}`)
      socket.to(`rtc:${roomId}`).emit('webrtc:peer-left')
    })

    socket.on('webrtc:offer', ({ roomId, sdp } = {}) => {
      if (!roomId || !sdp || !socket.rooms.has(`rtc:${roomId}`)) return
      socket.to(`rtc:${roomId}`).emit('webrtc:offer', { sdp })
    })

    socket.on('webrtc:answer', ({ roomId, sdp } = {}) => {
      if (!roomId || !sdp || !socket.rooms.has(`rtc:${roomId}`)) return
      socket.to(`rtc:${roomId}`).emit('webrtc:answer', { sdp })
    })

    socket.on('webrtc:ice-candidate', ({ roomId, candidate } = {}) => {
      if (!roomId || !candidate || !socket.rooms.has(`rtc:${roomId}`)) return
      socket.to(`rtc:${roomId}`).emit('webrtc:ice-candidate', { candidate })
    })

    socket.on('webrtc:screen-share-start', ({ roomId } = {}) => {
      if (!roomId || !socket.rooms.has(`rtc:${roomId}`)) return
      socket.to(`rtc:${roomId}`).emit('webrtc:screen-share-start')
    })

    socket.on('webrtc:screen-share-stop', ({ roomId } = {}) => {
      if (!roomId || !socket.rooms.has(`rtc:${roomId}`)) return
      socket.to(`rtc:${roomId}`).emit('webrtc:screen-share-stop')
    })

    log.info(`Socket connected: ${socket.id}`)

    // The browser proves who it is with its Clerk session token; never trust a bare user id
    socket.on('authenticate', async data => {
      let userId = null
      try {
        const payload = await verifyToken((data && data.token) || '', { secretKey: process.env.CLERK_SECRET_KEY })
        userId = payload.sub
      } catch (e) {
        return socket.emit('auth-error', { message: 'Session could not be verified' })
      }
      if (!userId) return socket.emit('auth-error', { message: 'Invalid session' })
      if (socket.userId && socket.userId !== userId) return socket.emit('auth-error', { message: 'Socket already bound to another user' })
      let dbUserId = null
      try {
        const dbUser = await prisma.user.findUnique({ where: { clerkId: userId }, select: { id: true } })
        dbUserId = dbUser ? dbUser.id : null
      } catch (e) {
        log.error('Presence lookup error:', e)
      }
      // The socket may have closed while we were awaiting; never register a dead socket as online
      if (socket.disconnected) return

      socket.userId = userId
      socket.dbUserId = dbUserId
      socket.join(`user:${userId}`)

      const existing = activeUsers.get(userId)
      // A brand-new account may authenticate before its DB row exists; the client re-authenticates
      // once synced, and that is when others should first hear about it.
      const wasVisible = !!existing && existing.sockets.size > 0 && !!existing.dbUserId
      const entry = existing || { sockets: new Set() }
      entry.sockets.add(socket.id)
      entry.dbUserId = dbUserId || entry.dbUserId
      activeUsers.set(userId, entry)
      try { await loadPrivacy(entry) } catch (e) { log.error('Privacy load error:', e) }
      if (socket.disconnected) return // disconnect handler already cleaned up

      socket.emit('authenticated', { dbUserId: entry.dbUserId })
      socket.emit('online-users', onlineListFor(entry.dbUserId))
      if (!wasVisible && entry.dbUserId) {
        emitPresence(userId, entry, 'user-online', { userId, dbUserId: entry.dbUserId })
      }

      if (dbUserId) {
        prisma.user.update({ where: { id: dbUserId }, data: { isOnline: true, lastSeen: new Date() } })
          .then(() => {
            // Every tab closed while we were writing: don't leave the account marked online
            if ((activeUsers.get(userId)?.sockets.size || 0) === 0) {
              return prisma.user.update({ where: { id: dbUserId }, data: { isOnline: false, lastSeen: new Date() } })
            }
          })
          .catch(e => log.error('Presence update error:', e))
      }
      resolveAuth()
      if (dbUserId) markPendingDelivered(dbUserId).catch(e => log.error('Delivery update error:', e))
    })

    socket.on('presence:list', () => {
      const entry = socket.userId && activeUsers.get(socket.userId)
      if (entry) socket.emit('online-users', onlineListFor(entry.dbUserId))
    })

    socket.on('join-conversation', async convId => {
      if (convId && (await isMember(convId))) socket.join(`conversation:${convId}`)
    })
    socket.on('leave-conversation', convId => {
      if (convId) socket.leave(`conversation:${convId}`)
    })
    socket.on('group:join', async groupId => {
      if (groupId && (await isMember(groupId))) socket.join(`group:${groupId}`)
    })
    socket.on('group:leave', groupId => {
      if (groupId) socket.leave(`group:${groupId}`)
    })

    // New messages are broadcast by the API route that saves them (src/lib/realtime.ts broadcastNewMessage),
    // so there is no client round trip before others see a message.

    socket.on('reaction:toggle', async (data, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {}
      try {
        const { conversationId, messageId, emoji } = data || {}
        if (!conversationId || !messageId || !emoji) return reply({ ok: false, error: 'Invalid payload' })
        if (!socket.userId) return reply({ ok: false, error: 'Unauthorized' })

        const currentDbUser = await prisma.user.findUnique({ where: { clerkId: socket.userId } })
        if (!currentDbUser) return reply({ ok: false, error: 'User not found' })

        const members = await getChatMembers(conversationId)
        if (!members.some(m => m.id === currentDbUser.id)) return reply({ ok: false, error: 'Access denied' })
        // The message must belong to this chat (otherwise a member of one chat could react in another)
        const target = await prisma.message.findUnique({ where: { id: messageId }, select: { conversationId: true, groupId: true, isDeleted: true } })
        if (!target || (target.conversationId !== conversationId && target.groupId !== conversationId)) return reply({ ok: false, error: 'Message not found' })
        if (target.isDeleted) return reply({ ok: false, error: 'Message was deleted' })
        const isDirect = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { id: true } })
        if (isDirect) {
          const other = members.find(m => m.id !== currentDbUser.id)
          const blockedBetween = other && await prisma.userBlock.findFirst({
            where: { OR: [{ blockerId: currentDbUser.id, blockedId: other.id }, { blockerId: other.id, blockedId: currentDbUser.id }] },
            select: { id: true }
          })
          if (blockedBetween) return reply({ ok: false, error: "You can't react in this chat" })
        }

        const existing = await prisma.messageReaction.findUnique({
          where: { messageId_userId_emoji: { messageId, userId: currentDbUser.id, emoji } }
        })
        if (existing) {
          await prisma.messageReaction.delete({ where: { id: existing.id } })
        } else {
          await prisma.messageReaction.create({ data: { messageId, userId: currentDbUser.id, emoji } })
        }

        const reactions = await prisma.messageReaction.findMany({
          where: { messageId },
          select: { id: true, emoji: true, userId: true }
        })
        io.to(chatRooms(conversationId)).emit('reaction:update', { messageId, reactions })
        reply({ ok: true, reactions })
      } catch (e) {
        log.error('reaction:toggle error', e)
        reply({ ok: false, error: 'Server error' })
      }
    })

    socket.on('typing:start', data => {
      const { conversationId, userId, userName } = data || {}
      const inRoom = conversationId && (socket.rooms.has(`conversation:${conversationId}`) || socket.rooms.has(`group:${conversationId}`))
      if (inRoom && userId === socket.dbUserId) {
        socket.to(chatRooms(conversationId)).emit('typing:start', { conversationId, userId, userName })
      }
    })

    socket.on('typing:stop', data => {
      const { conversationId, userId } = data || {}
      if (conversationId && userId) {
        socket.to(chatRooms(conversationId)).emit('typing:stop', { conversationId, userId })
      }
    })

    // Calls: ring the other members of the chat on their personal rooms
    socket.on('call:invite', async ({ conversationId, callType, chatName, isGroup } = {}) => {
      if (!conversationId || !socket.userId) return
      try {
        const members = await getChatMembers(conversationId)
        if (!members.some(m => m.clerkId === socket.userId)) return
        const caller = activeUsers.get(socket.userId) || {}
        const callerBlocked = caller.blocked || new Set()
        members
          .filter(m => m.clerkId !== socket.userId && !callerBlocked.has(m.id))
          .forEach(m => io.to(`user:${m.clerkId}`).emit('call:incoming', {
            conversationId,
            callType,
            isGroup: !!isGroup,
            chatName,
            fromClerkId: socket.userId,
            fromName: caller.userName || 'Someone',
            fromImage: caller.profilePhotoVisibility === 'NOBODY' ? null : caller.userImage || null
          }))
      } catch (e) {
        log.error('call:invite error', e)
      }
    })

    socket.on('call:cancel', async ({ conversationId } = {}) => {
      if (!conversationId || !socket.userId) return
      try {
        const members = await getChatMembers(conversationId)
        if (!members.some(m => m.clerkId === socket.userId)) return
        members
          .filter(m => m.clerkId !== socket.userId)
          .forEach(m => io.to(`user:${m.clerkId}`).emit('call:cancelled', { conversationId }))
      } catch (e) {
        log.error('call:cancel error', e)
      }
    })

    socket.on('call:decline', async ({ conversationId, toClerkId } = {}) => {
      if (!conversationId || !toClerkId || !socket.userId) return
      try {
        const members = await getChatMembers(conversationId)
        if (!members.some(m => m.clerkId === socket.userId) || !members.some(m => m.clerkId === toClerkId)) return
        io.to(`user:${toClerkId}`).emit('call:declined', { conversationId, byClerkId: socket.userId })
      } catch (e) {
        log.error('call:decline error', e)
      }
    })

    // Answered on one device: stop ringing on this user's other tabs/devices, and tell the caller
    socket.on('call:answered', async ({ conversationId, toClerkId } = {}) => {
      if (!conversationId || !socket.userId) return
      try {
        const members = await getChatMembers(conversationId)
        if (!members.some(m => m.clerkId === socket.userId)) return
        socket.to(`user:${socket.userId}`).emit('call:cancelled', { conversationId })
        if (toClerkId && members.some(m => m.clerkId === toClerkId)) {
          io.to(`user:${toClerkId}`).emit('call:answered', { conversationId, byClerkId: socket.userId })
        }
      } catch (e) {
        log.error('call:answered error', e)
      }
    })

    socket.on('disconnect', async () => {
      const uid = socket.userId
      log.info(`Socket disconnected: ${socket.id} (User: ${uid || 'Unknown'})`)
      if (!uid) return
      const entry = activeUsers.get(uid)
      if (entry) entry.sockets.delete(socket.id)
      // Only go offline once the user's last tab disconnects
      if (entry && entry.sockets.size > 0) return
      activeUsers.delete(uid)
      const lastSeen = new Date()
      try {
        await prisma.user.updateMany({ where: { clerkId: uid }, data: { isOnline: false, lastSeen } })
      } catch (e) {
        log.error('User disconnect update error:', e)
      }
      if (entry && entry.dbUserId) {
        emitPresence(uid, entry, 'user-offline', { userId: uid, dbUserId: entry.dbUserId, lastSeen })
      }
    })
  })

  const shutdown = async () => {
    io.emit('server-shutdown', { message: 'Shutting down' })
    await io.close()
    await prisma.$disconnect()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  httpServer.listen(port, '0.0.0.0', err => {
    if (err) throw err
    log.ready('Server started')
    log.info(`Environment: ${dev ? 'development' : 'production'}`)
    displayNetworkInfo()
  })
})
