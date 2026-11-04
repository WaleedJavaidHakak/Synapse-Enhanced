# Synapse — Real-time Messaging (WhatsApp-style)

A WhatsApp-style chat app built with **Next.js 15, React 19, Socket.IO, Prisma + MySQL and Clerk auth**.
One-to-one chats, groups with admins, media and voice notes, read receipts, presence and voice/video calls — all in real time.

---

## Next deploy steps (start here)

This release adds Discover, message requests, privacy settings, blocking/reporting, the new chat UI and faster
realtime. Deploying it is a normal redeploy: the database changes are **additive** (3 new tables, new columns with
defaults) and are applied automatically by `prisma db push` during the build/start. No existing data is changed.

### A. Render (current setup, uses `render.yaml`)

1. **Push to `main`.** Render redeploys automatically if auto-deploy is on; otherwise open the service →
   **Manual Deploy → Deploy latest commit**.
2. **Check environment variables** (service → *Environment*):

   | Variable | Needed? | Note |
   |----------|---------|------|
   | `DATABASE_URL` | ✅ | Must be reachable **during the build** (the build runs `prisma db push`). |
   | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ✅ | Baked in at build time. |
   | `CLERK_SECRET_KEY` | ✅ | Now also used by the realtime server to verify each user's session. If it's missing or wrong, chats load but nothing updates live (header shows *Session could not be verified*). |
   | `NEXT_PUBLIC_CLERK_SIGN_IN_URL` etc. | ✅ | Already set by `render.yaml`. |
   | `AI_PROVIDER=groq` + `GROQ_API_KEY` | optional | For ✨ AI. Create a **new** key at console.groq.com (keys expire/revoke). Default model is `llama-3.1-8b-instant`; override with `GROQ_MODEL`. |
   | `UPLOAD_STORAGE=database` | ✅ (set by `render.yaml`) | Keeps photos/voice notes in MySQL so they survive restarts on the free plan. |
   | `METERED_DOMAIN` + `METERED_API_KEY` | recommended | Calls between different networks (mobile data, offices). Free Metered account, see 8.7. Read at call time, no rebuild needed. |
   | `CLERK_WEBHOOK_SECRET` | optional | Only if you add the Clerk webhook (see 8.6). |
   | `NEXT_PUBLIC_SOCKET_URL` | ❌ | **Delete it** if present; the app connects to its own origin. |

   After changing any `NEXT_PUBLIC_*` value: **Manual Deploy → Clear build cache & deploy**.
3. **Clerk dashboard** (<https://dashboard.clerk.com>):
   - **Google sign-in**: *Configure → SSO connections → Google* must be **enabled**. With development keys
     (`pk_test_`) that's all. With production keys (`pk_live_`) also add your own Google OAuth Client ID/Secret and
     put Clerk's redirect URI into Google Cloud Console (see [Troubleshooting](#16-troubleshooting)).
   - **Production keys only**: add your domain under *Domains*. Clerk production needs a domain you own; the
     `onrender.com` subdomain works with development keys.
   - **Make sign-up reliable** (this is why "enter code → Continue → nothing happens" and Google can fail):
     - *Configure → Attack protection → **Bot sign-up protection***: Clerk then requires a hidden CAPTCHA on every
       sign-up, and ad blockers / Brave / strict tracking protection block it, so **Continue silently fails**
       (Clerk answers `captcha_missing_token`). Turn it **off**, or keep it on and tell users to allow
       `challenges.cloudflare.com`.
     - *Configure → User & authentication → **Username***: currently **required**. Google doesn't provide a
       username, so Google sign-ups get an extra "choose a username" step. Set it to **optional** (or turn it off);
       the app uses the person's real name anyway.
   - *Optional*: the webhook (8.6) now verifies signatures correctly and no longer overwrites names/photos.
4. **Verify after deploy**:
   - `https://<your-app>.onrender.com/health` → `{"status":"OK"}`
   - Sign up in a normal window and in an incognito window (try Google for one), then run the
     [testing checklist](#15-testing-checklist): Discover → request → accept → chat → block/unblock.
5. **Know the free-plan limits**: the service sleeps after ~15 min idle (first visit takes up to a minute; open chats
   reconnect on their own). Uploads are stored **in MySQL** (`UPLOAD_STORAGE=database`), so they survive restarts
   and redeploys; they count towards your database storage (max 25 MB per file). With a paid Render **Disk** you can
   switch to `UPLOAD_STORAGE=disk` + `UPLOAD_DIR=/var/data/uploads` instead.

### B. Railway

Follow [section 8](#8-deploy-online-on-railway-recommended). Same variables as the table above; `railway.json`
already runs the schema sync on start. Make sure the volume is mounted at `/data` with `UPLOAD_DIR=/data/uploads`.

### C. Before inviting real users

- [ ] Clerk **production** instance with your own domain, and your own Google OAuth credentials
- [ ] Uploads: database storage (default on Render) is fine to start; move to a disk/volume if your database fills up
- [ ] TURN credentials so calls work on mobile data
- [ ] Database backups enabled at your MySQL provider
- [ ] A fresh `GROQ_API_KEY` if you want the AI features
- [ ] Someone checks the `user_reports` table regularly (`npx prisma studio` or your DB console) and acts on reports

**Rolling back** is safe: the schema change is additive, so the previous commit runs fine against the updated database.

---

## Table of contents

**About the app**
1. [Features](#1-features)
2. [User roles: normal users and group admins](#2-user-roles-normal-users-and-group-admins)
3. [How it works](#3-how-it-works)
4. [Dependencies](#4-dependencies)

**Setup & deployment**

5. [Prerequisites](#5-prerequisites)
6. [Create a Clerk app (login)](#6-create-a-clerk-app-login)
7. [Run locally](#7-run-locally)
8. [Deploy online on Railway (recommended)](#8-deploy-online-on-railway-recommended)
9. [Using a different online database](#9-using-a-different-online-database)
10. [What about Vercel?](#10-what-about-vercel)

**Reference**

11. [Environment variables](#11-environment-variables)
12. [API reference](#12-api-reference)
13. [Realtime (Socket.IO) events](#13-realtime-socketio-events)
14. [Database schema](#14-database-schema)
15. [Testing checklist](#15-testing-checklist)
16. [Troubleshooting](#16-troubleshooting)
17. [Project structure & scripts](#17-project-structure--scripts)
18. [Known limitations](#18-known-limitations)

---

## 1. Features

### Accounts & profile
- Sign up / sign in with email, Google or any social login you enable in Clerk, handled by **Clerk**.
- On first sign-in the user is automatically created in the app database (no manual step, webhook optional).
  If the same email signs in through a new Clerk account (e.g. email first, Google later), it is linked to the
  existing profile instead of failing.
- **Profile** panel: photo, name, about, **interests**, **location** and phone. Each field saves on its own.
- Light / dark theme toggle (remembered per browser).

### Meet new people (Discover)
- **Discover** tab: browse people who chose to be discoverable, with search by name, interest or place and an
  **Online now** filter.
- Cards and profiles show **only what that person allows** (see Privacy below); hidden fields show 🔒 Hidden.
- From a profile you can:
  - **Message** directly, if they accept messages from everyone (or you already share a chat or group),
  - **Send a message request** with a short intro (up to 300 characters), if they accept requests,
  - see **"Not accepting new messages"** if they've turned new contacts off,
  - **Block** or **Report** them.
- **Requests** tab (badge shows how many are waiting): **Received** requests with their intro → Accept / Decline /
  Block; **Sent** requests → Cancel. Accepting opens the chat with their intro as the first message.
- Limits: 30 pending outgoing requests at a time; after a decline you can't re-request the same person for 7 days.

### Privacy & safety
- **Show me in Discover** on/off.
- **Who can message me**: Everyone · Message requests (default) · Only existing chats.
- **Who can see** my profile photo, about, last seen & online, phone, email: Everyone · My contacts · Nobody
  (defaults: photo/about/last seen = Everyone, phone/email = Nobody). "My contacts" = people you share a chat or group with.
- **Read receipts** on/off (off: you neither send nor see blue ticks).
- **Block** (they can't message, call, request or find you, and your presence is hidden from them) and **Report**
  (reason + details, optional block). Manage blocked contacts in Privacy.
- All rules are enforced **on the server**, including what the realtime connection sends, not just in the UI.

### Contacts & chat list
- **Contacts** lists only people you're connected with (a shared chat or group), with **New group** and
  **Find new people** shortcuts. Strangers never appear here and can't be added to groups.
- Chat list sorted by latest activity, showing last-message preview (📷 Photo, 🎤 Voice message, 📄 file name…),
  time, "You:" / sender prefix, **unread badges**, and **All / Unread / Groups** filters.
- Green dot for contacts who are online right now (if they allow it).
- **Search** across all your chats' messages from the sidebar.

### Messaging
- Messages appear **instantly** when you send them (🕓 while sending, then ✓); if sending fails you get
  **Tap to retry**. Recipients typically see the message within ~100 ms.
- WhatsApp-style composer: emoji, attach menu, ✨ AI, input that grows up to 5 lines, 🎤 that turns into ➤ when you type.
  Enter sends on desktop (Shift+Enter = new line); on phones Enter adds a line. Drafts are kept per chat.
- **Formatting**: `*bold*`, `_italic_`, `~strike~`, `` `code` ``; links are clickable; emoji-only messages show large.
- **Ticks** on your messages: ✓ sent · ✓✓ grey delivered (recipient is connected) · ✓✓ blue read (recipient opened the chat).
  Messages sent while someone is offline turn "delivered" as soon as they come online.
- **Typing indicator** ("typing…", or "Alex, Sam typing…" in groups).
- **Online / last seen** in the chat header ("last seen today at 14:32").
- Message menu (hover a message → ⌄): **Reply** (quoted), **React**, **Copy**, **Forward** (to any chat or group),
  **Edit** (your own text messages, within 15 minutes, shows "edited"), **Delete for everyone** (your own messages,
  shows "This message was deleted").
- **Reactions**: quick bar 👍 ❤️ 😂 😮 😢 🙏 or any emoji; tap a reaction again to remove yours.
- Date separators (Today / Yesterday / date), consecutive-message grouping, colored sender names in groups.
- Loads the latest 50 messages and older ones as you scroll up; "jump to latest" button.

### Media
- **Photos and videos**: pick several at once or **paste** an image; a full-screen preview lets you add a caption
  before sending. They appear in the chat immediately while uploading. Tap a photo to view it full screen and download.
- **Documents**: PDF, Word, Excel, PowerPoint, TXT, CSV, ZIP/RAR/7z, JSON, Markdown (download card with file size).
- **Voice notes**: tap 🎤 to record, then **Send** or **Cancel**; playback with progress/seek.
- Max **25 MB** per file. Executable/HTML/SVG/script files are rejected for safety.

### Groups
- Create a group from **Contacts → New group**: name, optional photo, pick members (from your contacts).
- Group chat with all messaging features (replies, reactions, media, voice notes, typing, edit/delete).
- **Group info** panel: photo, name, description, member list with online dots and admin badges.
- Admin tools (see [roles](#2-user-roles-normal-users-and-group-admins)): edit group, add participants,
  make/dismiss admin, remove members, delete group. Everyone can exit.

### Calls
- **Voice and video calls** from any chat header (📞 / 🎥) using WebRTC (peer-to-peer).
- The other side gets a full-screen **incoming call** with ringtone → Accept / Decline (auto-dismiss after 45 s).
- In call: mute, camera on/off, **screen share** (video calls), call timer, hang up.
- Caller is told when the call is declined; the call ends for both when either hangs up.

### Notifications
- Sound when a message arrives in a chat you don't have open.
- Desktop (browser) notifications when the tab is in the background — click to jump to the chat.
  The browser asks for permission on your first click in the app.

### AI assistant (optional, needs an API key)
- ✨ **Smart replies**: with an empty input, suggests 3 replies based on the last 20 messages of the chat.
- 🪄 **Rewrite**: with text typed, offers 3 rewritten variants (e.g. friendlier, more formal).
- 🌐 **Translate** your draft to any language before sending.
- Works with **Groq** (free tier) or **OpenAI**.

### Layout
- WhatsApp Web look: chat list on the left with tabs (Chats · Contacts · Discover · Requests · Profile), open chat or
  section on the right, doodle wallpaper, tailed bubbles, sticky date chips.
- Phone: the chat list, then the open chat or section full-screen with a ← back button.

---

## 2. User roles: normal users and group admins

There is **no global/super admin** in Synapse. Every signed-in account has the same app-level permissions.
Roles exist **per group**: each group member is either **Admin** or **Member**. Between two people, what you can
see and do depends on whether you're **connected** (share a chat or group) and on **their privacy settings**.

### Every signed-in user can

| Action | Notes |
|--------|-------|
| Edit own profile (name, about, interests, location, phone, photo) and privacy settings | |
| Browse Discover | Only people who are discoverable and haven't blocked you (and you haven't blocked) |
| Message a stranger | Directly if they allow *Everyone*; otherwise send a **request**; not at all if *Only existing chats* |
| Accept / decline requests sent to them | Accepting creates the 1:1 chat |
| Block and report anyone | Blocking is mutual in effect: neither side can message, call or find the other |
| Create groups | The creator automatically becomes the group's first **Admin**; members must be your contacts |
| Send text, emoji, photos, videos, documents, voice notes | In any chat/group they belong to |
| Reply, react, copy, forward any message they can see | Forward to any of their chats or groups |
| Edit **their own** text messages | Within 15 minutes of sending |
| Delete **their own** messages for everyone | Nobody (not even group admins) can delete other people's messages |
| Voice/video call any chat | |
| Read only chats/groups they are a member of | Enforced on every API call |

### Inside a group

| Permission | Member | Admin |
|------------|:------:|:-----:|
| Read and send messages, react, reply, forward | ✅ | ✅ |
| See group info and member list | ✅ | ✅ |
| Exit the group | ✅ | ✅ |
| Edit group name, photo and description | ❌ | ✅ |
| Add participants | ❌ | ✅ |
| Remove participants | ❌ | ✅ (anyone except themselves — admins leave via *Exit group*) |
| Make someone admin / dismiss as admin | ❌ | ✅ (a group always keeps at least one admin) |
| Delete the group for everyone | ❌ | ✅ |

**Automatic rules**
- If the **last admin exits**, the longest-standing remaining member is promoted to admin (like WhatsApp).
- If the **last member exits**, the group is deactivated.
- A removed member's chat disappears from their list immediately; added members see the group instantly.
- When an admin deletes a group, it disappears for everyone.

> The database also has a `MODERATOR` role value, but it is reserved and not used by the app today.

### What a stranger vs a contact can see about you

| Your setting | Stranger (Discover, requests) | Contact (shared chat/group) | Blocked person |
|--------------|-------------------------------|-----------------------------|----------------|
| *Everyone* | ✅ | ✅ | ❌ |
| *My contacts* | ❌ | ✅ | ❌ |
| *Nobody* | ❌ | ❌ | ❌ |

Applies separately to profile photo, about, last seen/online, phone and email. Your **name**, **interests** and
**location** are visible to anyone who can see your profile (leave interests/location empty to keep them private).
Reports are stored in the `user_reports` table for whoever operates the deployment to review.

---

## 3. How it works

### Architecture

```
                         ┌──────────────────────────── server.js (one Node process) ───────────────────────────┐
Browser ──HTTPS────────▶ │  Next.js 15 (pages + /api routes) ──▶ Prisma ORM ──▶ MySQL                           │
   ▲  │                  │        │ broadcasts via globalThis.__synapseIO                                      │
   │  └──WebSocket──────▶ │  Socket.IO server (messages, typing, presence, ticks, call signalling)               │
   │                     │  /uploads/*  → streams files from UPLOAD_DIR (with range support for audio/video)    │
   │                     │  /health     → health check for the host                                            │
   │                     └──────────────────────────────────────────────────────────────────────────────────────┘
   └── WebRTC (peer-to-peer audio/video, via STUN/TURN) ──▶ other browser
Clerk (external) — sign-in UI, sessions; middleware protects /chat and /api/*
```

- `server.js` is a **custom server**: Next.js and Socket.IO share one HTTP server and one process, so API routes can
  push realtime events directly (`src/lib/realtime.ts`).
- All writes go through **REST API routes** (validated, permission-checked); Socket.IO is used to **fan out** changes.
- Each socket joins rooms: `user:<clerkId>` (personal notifications), `conversation:<id>` / `group:<id>` (open chat),
  `rtc:<chatId>` (call signalling).

### Sign-in and user sync
1. Clerk handles sign-up/sign-in; `src/middleware.ts` blocks `/chat` and `/api/*` for signed-out users.
   API routes identify you with Clerk's `auth()` (local session-token check, no network call per request).
2. When the chat loads, `POST /api/users/sync` creates the user row (or links an existing one with the same email),
   retrying briefly if the session isn't ready yet. If it still fails, the app shows **Try again** instead of spinning.
3. The browser opens a Socket.IO connection and sends `authenticate` with its **Clerk session token**; the server
   verifies it (`@clerk/backend`) before trusting the identity, then joins the user's private room.
   Joining a chat room or call room additionally requires being a member of that chat.

### Sending a message
1. The composer adds the message to the screen immediately (optimistic, with a temporary `clientId`).
2. The browser calls `POST /api/conversations/:id/messages` (or `/api/groups/:id/messages`) with that `clientId`.
   The server checks membership and blocks, saves the message and **broadcasts it right away** (`broadcastNewMessage`):
   - `message:new` to everyone with that chat open (the sender's copy carries the `clientId`, so the optimistic
     bubble is swapped for the saved one without duplicates),
   - `conversation:activity` to every member (chat list, unread badge, notification),
   - if any recipient is connected, marks it **delivered** and emits `message:status` (✓✓ grey).
3. When a recipient has the chat open, their browser calls `POST /api/messages/read` → messages are marked read
   (unless the reader turned read receipts off), the reader's `lastReadAt` moves forward, and the sender's ticks turn blue.
4. Unread badges = messages from others newer than your `lastReadAt` in that chat.

### Discover, requests and privacy
1. `GET /api/discover` returns discoverable users minus blocks, each run through `toPublicProfile()`
   (`src/lib/privacy.ts`), which drops every field the owner hasn't allowed for this viewer.
2. Starting a 1:1 chat goes through `canStartDirectChat()` (`src/lib/conversations.ts`): existing chat → allowed;
   blocked → refused; target allows *Everyone* (or you share a group and they accept requests) → allowed;
   *Message requests* → you must `POST /api/requests`; *Only existing chats* → refused.
3. Accepting a request (`PATCH /api/requests/:id`) creates the chat and inserts the intro as its first message.
4. Blocks are checked when sending, requesting, calling, in Discover, in profiles and in presence.

### Edit / delete
`PATCH /api/messages/:id` (edit) and `DELETE /api/messages/:id` (delete for everyone) check that you are the sender,
update the row (delete is a *soft* delete: content and file are hidden, reply chains stay intact) and broadcast
`message:updated` so every open window updates instantly.

### Media uploads
1. `POST /api/upload` validates type/size and saves the file to `UPLOAD_DIR` with a random name.
2. The message is then created with the returned `/uploads/...` URL.
3. Voice notes go to `POST /api/conversations/:id/voice` (works for groups too).
4. `server.js` serves `/uploads/*` from `UPLOAD_DIR`, blocking path traversal and forcing downloads for unknown types.

### Presence
- Online = at least one open tab connected. Closing the last tab saves `lastSeen` and sends `user-offline`.
- Presence events go **only to people allowed to see them** (last-seen setting + blocks), computed per user in
  `server.js`. When someone changes privacy or blocks, everyone's visible online list is refreshed.
- The chat list and headers overlay this live presence on top of the data loaded from the API.

### Calls
1. Caller clicks 📞/🎥 → emits `call:invite`; the server rings every other member via their `user:` room (`call:incoming`).
2. Caller opens the call screen (camera/mic) and joins signalling room `rtc:<chatId>`.
3. Callee accepts → joins the same room → server emits `ready` → caller sends a WebRTC **offer**, callee **answers**,
   both exchange **ICE candidates** through Socket.IO.
4. Audio/video then flows **directly between browsers** (STUN, or a TURN relay if configured).
5. Decline → `call:declined` to the caller; hang-up → `webrtc:peer-left` ends it for the other side.

---

## 4. Dependencies

### Runtime requirements
| Requirement | Why |
|-------------|-----|
| **Node.js ≥ 20** | Runs `server.js` (Next.js + Socket.IO) |
| **MySQL 8** (or MySQL-compatible: TiDB, Aiven…) | All app data |
| **Clerk account** | Authentication |
| Modern browser (Chrome, Edge, Firefox, Safari) | WebRTC, MediaRecorder for voice notes, Notifications |
| HTTPS or `localhost` | Browsers only allow mic/camera on secure origins |

### External services
| Service | Required? | Used for |
|---------|-----------|----------|
| [Clerk](https://clerk.com) | ✅ | Sign-up/sign-in, sessions, profile photos |
| MySQL host (Railway / Aiven / TiDB / local) | ✅ | Database |
| [Railway](https://railway.com) | for deployment | Hosting the Node server + MySQL + volume |
| Google public STUN servers | built in | Finding a direct path for calls |
| TURN relay (e.g. [Metered](https://www.metered.ca/stun-turn)) | optional | Calls between different networks |
| [Groq](https://console.groq.com) or [OpenAI](https://platform.openai.com) | optional | AI smart replies / rewrite / translate |

### npm packages (`package.json`)

**Framework & server**
| Package | Purpose |
|---------|---------|
| `next` 15.4 | React framework (pages, API routes, build) |
| `react`, `react-dom` 19.1 | UI |
| `socket.io` / `socket.io-client` 4.8 | Realtime server and client |
| `@prisma/client` 6 + `prisma` (dev) | Database ORM and schema/migration CLI |
| `mysql2` | MySQL driver |

**Auth**
| Package | Purpose |
|---------|---------|
| `@clerk/nextjs`, `@clerk/themes` | Clerk auth components, middleware, server helpers |
| `@clerk/backend` | Verifies session tokens on the Socket.IO connection in `server.js` |
| `svix` | Verifies Clerk webhook signatures |

**UI**
| Package | Purpose |
|---------|---------|
| `tailwindcss` 4, `@tailwindcss/postcss`, `tw-animate-css` | Styling |
| `@radix-ui/*` (dialog, dropdown-menu, avatar, scroll-area, tabs, …) | Accessible UI primitives (shadcn/ui style components in `src/components/ui`) |
| `class-variance-authority`, `clsx`, `tailwind-merge` | Component class helpers |
| `lucide-react` | Icons |
| `framer-motion` | Animations |
| `emoji-picker-react` | Emoji picker for messages and reactions |
| `sonner` | Toast notifications |
| `date-fns` | Date formatting ("last seen", separators) |
| `next-themes` | Theme helpers |
| `zustand`, `axios` | Installed utilities (state store, HTTP client) |

**Dev tooling**: `typescript`, `@types/*`, `eslint`, `eslint-config-next`.

Everything is installed with `npm install` — no global packages needed.

---

## 5. Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Node.js | 20 or newer | `node -v` |
| npm | 10 or newer | `npm -v` |
| Git | any | `git --version` |
| MySQL 8 | local install **or** Docker **or** an online MySQL | see 7.2 |

Accounts (all have free tiers): **Clerk** (required), **Railway** (to deploy), Groq (optional), Metered (optional).

---

## 6. Create a Clerk app (login)

1. Go to <https://dashboard.clerk.com> → **Create application**.
2. Name it `Synapse`, enable **Email** (and optionally Google), click **Create**.
3. Open **Configure → API Keys** and copy the **Publishable key** (`pk_test_...`) and **Secret key** (`sk_test_...`).
4. (Recommended) enable **Username** under user/authentication settings so people get nice display names.

That's all Clerk needs locally. Deployment adds one step (8.6).

---

## 7. Run locally

### 7.1 Clone and install

```bash
git clone <this-repo-url> synapse
cd synapse
npm install
```

> `npm install` also runs `prisma generate`. If it seems frozen at the end on `prisma -v`, see [Troubleshooting](#16-troubleshooting).

### 7.2 Start a MySQL database

Pick **one**:

**A) Docker (easiest)**
```bash
docker run -d --name synapse-mysql -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=synapse -e MYSQL_DATABASE=whatsapp_clone mysql:8
```
URL: `mysql://root:synapse@localhost:3306/whatsapp_clone`

**B) MySQL installed locally** — `mysql://root:YOUR_PASSWORD@localhost:3306/whatsapp_clone`
(the database is created automatically in 7.4).

> URL-encode special characters in passwords (`@` → `%40`, `#` → `%23`, `:` → `%3A`).

**C) An online database** — see [section 9](#9-using-a-different-online-database) (use the provider's *public* URL).

### 7.3 Create your `.env` file

```bash
# macOS / Linux / Git Bash
cp .env.example .env
# Windows PowerShell
Copy-Item .env.example .env
```

Fill in at least:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
DATABASE_URL=mysql://root:synapse@localhost:3306/whatsapp_clone
```

Use **`.env`** (not only `.env.local`) — the Prisma CLI only reads `.env`.

### 7.4 Create the database tables

```bash
npx prisma db push
```

Expected: `Your database is now in sync with your Prisma schema.`

### 7.5 Start the app

```bash
npm run dev
```

Open **<http://localhost:3000>** and sign up.

> Use **`http://localhost:3000`**, not `http://192.168.x.x:3000` — mic/camera only work on localhost or HTTPS.

Production build locally: `npm run build` then `npm start`.

---

## 8. Deploy online on Railway (recommended)

Railway runs everything — web server, WebSockets, file storage and MySQL — in one project. The repo includes
`railway.json`:

- build: `npm run build`
- start: `npm run start:railway` (creates/updates DB tables, then starts `server.js` in production)
- health check: `/health`

### 8.1 Push the code to GitHub
Push this repository to your GitHub account (private is fine).

### 8.2 Create the project and database
1. <https://railway.com/new> → **Deploy from GitHub repo** → pick the repo. (The first build may fail until env vars are set — expected.)
2. In the same project: **+ Create → Database → Add MySQL**.

### 8.3 Add a volume for uploaded files
App service (not MySQL) → **Settings → Volumes → + Add Volume** (or right-click → **Attach Volume**), mount path **`/data`**.
Without it, uploads are lost on every redeploy.

### 8.4 Set the environment variables
App service → **Variables → Raw Editor**:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/chat
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/chat
DATABASE_URL=${{MySQL.MYSQL_URL}}
UPLOAD_DIR=/data/uploads
NODE_ENV=production

# optional – AI
AI_PROVIDER=groq
GROQ_API_KEY=

# optional – calls across networks (8.7)
NEXT_PUBLIC_TURN_URL=
NEXT_PUBLIC_TURN_USERNAME=
NEXT_PUBLIC_TURN_CREDENTIAL=
```

- `${{MySQL.MYSQL_URL}}` is a Railway reference variable — type it exactly (use your MySQL service's name if it isn't `MySQL`).
- **Don't** set `NEXT_PUBLIC_SOCKET_URL` or `PORT`.
- `NEXT_PUBLIC_*` values are baked in at build time → **redeploy** after changing them.

### 8.5 Get a public URL and deploy
1. App service → **Settings → Networking → Generate Domain** (e.g. `https://synapse-production-xxxx.up.railway.app`).
2. **Deploy**. Logs should show `Your database is now in sync…` then `[READY] Server started`.
3. `https://<your-domain>/health` → `{"status":"OK",...}`.

### 8.6 Clerk for your domain
- **Development keys (`pk_test_`)** work on the Railway domain as-is — fine for testing with friends.
- **Real production**: create a Clerk **Production instance**, add a domain you own (also add it in Railway under
  *Networking → Custom Domain*), complete Clerk's DNS steps, then switch Railway to the `pk_live_` / `sk_live_` keys and redeploy.

Optional webhook (syncs profile edits made in Clerk; the app also syncs on every login):
Clerk → **Webhooks → Add endpoint** → `https://<your-domain>/api/webhooks/clerk`, events `user.created`,
`user.updated`, `user.deleted` → put the **Signing secret** in Railway as `CLERK_WEBHOOK_SECRET` → redeploy.

### 8.7 Calls across networks (TURN)
Same Wi-Fi usually works out of the box. For mobile data / different networks you need a TURN relay.
The call screen asks the server (`GET /api/turn`) for ICE servers when a call starts, so this is **runtime
configuration: just set the variables and restart, no rebuild**.

**Option 1: Metered (recommended, free tier)**
1. Sign up at <https://www.metered.ca/stun-turn> and create a TURN app; note its domain (e.g. `yourapp.metered.live`)
   and an **API key**.
2. Set on the server:
   ```env
   METERED_DOMAIN=yourapp.metered.live
   METERED_API_KEY=<api key>
   ```
   Short-lived credentials are fetched and cached automatically.

**Option 2: any TURN server with fixed credentials**
```env
TURN_URL=turn:turn.example.com:3478,turns:turn.example.com:5349
TURN_USERNAME=<username>
TURN_CREDENTIAL=<credential>
```
(The older `NEXT_PUBLIC_TURN_*` names still work.)

**Done** — share the Railway URL.

---

## 9. Using a different online database

Any MySQL 8–compatible database works; set `DATABASE_URL`. Tables are created on start (`start:railway`), or run
`npx prisma db push` with that URL in `.env`.

| Provider | Free tier | `DATABASE_URL` format |
|----------|-----------|------------------------|
| **Railway MySQL** (recommended) | trial credits | `${{MySQL.MYSQL_URL}}` inside Railway; the *public* URL from the MySQL service's **Connect** tab for local use |
| [Aiven for MySQL](https://aiven.io/mysql) | yes | `mysql://avnadmin:PASS@HOST:PORT/defaultdb?sslaccept=strict` |
| [TiDB Cloud Serverless](https://tidbcloud.com) | yes | `mysql://USER:PASS@HOST:4000/whatsapp_clone?sslaccept=strict` |

PostgreSQL providers (Neon, Supabase) are **not** drop-in: the schema uses `provider = "mysql"`.

---

## 10. What about Vercel?

**Vercel cannot run this app on its own.** It runs code as short-lived serverless functions, so:
- there's no always-on process for **Socket.IO** → no live messages, typing, presence, ticks or call ringing;
- its filesystem is temporary → **uploaded files are lost**.

Use Railway (section 8). Moving to Vercel would require splitting the realtime server into a separate service and
storing files in object storage (S3/R2), which this codebase doesn't do today.

---

## 11. Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ✅ | Clerk publishable key |
| `CLERK_SECRET_KEY` | ✅ | Clerk secret key (API routes and realtime session verification) |
| `DATABASE_URL` | ✅ | MySQL connection string |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `..._SIGN_UP_URL` | recommended | `/sign-in`, `/sign-up` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` / `..._SIGN_UP_...` | recommended | `/chat` |
| `UPLOAD_STORAGE` | optional | `disk` or `database`. Default: `database` in production when `UPLOAD_DIR` isn't set, otherwise `disk`. `database` stores files in MySQL (served at `/media/:id`) for hosts without a persistent disk |
| `UPLOAD_DIR` | with disk storage | Upload folder; use a persistent volume (`/data/uploads`). Default `public/uploads` |
| `CLERK_WEBHOOK_SECRET` | optional | Only with the Clerk webhook |
| `METERED_DOMAIN` / `METERED_API_KEY` | optional | Metered TURN (auto-rotating credentials) for calls across networks |
| `TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL` | optional | Any TURN server with fixed credentials (comma-separate URLs). `NEXT_PUBLIC_TURN_*` also accepted |
| `AI_PROVIDER` | optional | `groq` or `openai` |
| `GROQ_API_KEY` / `GROQ_MODEL` | optional | Groq (model default `llama-3.1-8b-instant`) |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | optional | OpenAI (model default `gpt-4o-mini`) |
| `PORT` | auto | Set by the host; 3000 locally |

---

## 12. API reference

All routes require a signed-in Clerk session and check chat membership.

| Method & path | What it does |
|---------------|--------------|
| `POST /api/users/sync` | Create/update the current user from Clerk |
| `GET /api/users/profile[?userId=]` · `PUT /api/users/profile` | Own full profile, or someone else's privacy-filtered profile + relationship, block state, shared groups and pending request · update own name/bio/interests/location/phone/photo |
| `GET/PUT /api/users/privacy` | Read/update privacy settings |
| `GET /api/users/search?q=` | Your **contacts** (people you share a chat or group with) |
| `GET /api/discover?q=&online=1&page=` | Discoverable people (privacy-filtered) with relationship badges |
| `GET /api/requests` · `POST /api/requests` | Incoming/outgoing pending requests · send a request `{ receiverId, message }` (opens the chat directly if they accept everyone) |
| `PATCH /api/requests/:id` | `{ action: 'accept' | 'decline' | 'cancel' }` |
| `GET/POST/DELETE /api/blocks` | List blocked · block `{ userId }` · unblock `?userId=` |
| `POST /api/reports` | Report `{ userId, reason, details?, block? }` |
| `GET /api/conversations` · `POST /api/conversations` | List my 1:1 chats with unread counts · open/create a chat (`{ participantId }`) |
| `GET/POST /api/conversations/:id/messages` | Messages (`?limit=&before=` for paging) · send a message |
| `POST /api/conversations/:id/voice` | Upload a voice note (chat **or** group id) |
| `GET /api/conversations/search?q=` | Search your chats and groups by name or message text |
| `GET /api/groups` · `POST /api/groups` | List my groups · create a group (`{ name, memberIds, imageUrl?, description? }`) |
| `GET/PATCH/DELETE /api/groups/:id` | Group details · edit (admin) · delete (admin) |
| `GET/POST/PATCH/DELETE /api/groups/:id/members` | List · add (`{ userIds }`) · change role (`{ userId, role }`) · remove (`?userId=`) — admin for writes |
| `POST /api/groups/:id/leave` | Exit a group |
| `GET/POST /api/groups/:id/messages` | Group messages · send |
| `PATCH/DELETE /api/messages/:id` | Edit · delete for everyone (sender only) |
| `POST /api/messages/read` | Mark a chat read (`{ conversationId }`) |
| `POST /api/upload` | Upload a file (multipart `file`) → `{ url, name, size, kind }` |
| `GET /media/:id` | Serve a database-stored upload (safe types inline, everything else downloads; supports range requests) |
| `GET /api/turn` | ICE/TURN servers for the call screen, from server env |
| `POST /api/ai/reply` · `/api/ai/assist` · `/api/ai/translate` | AI smart replies · rewrite · translate |
| `POST /api/webhooks/clerk` | Clerk webhook (optional) |
| `GET /health` | Health check (served by `server.js`) |

---

## 13. Realtime (Socket.IO) events

| Direction | Event | Purpose |
|-----------|-------|---------|
| client → server | `authenticate` `{ token }` | Prove identity with a Clerk session token; marks user online, delivers pending messages, replies `authenticated` |
| client → server | `presence:list` | Re-request the online list you're allowed to see |
| client → server | `join-conversation` / `group:join` (+ leave) | Subscribe to an open chat |
| client → server | `typing:start` / `typing:stop` | Typing indicator |
| client → server | `reaction:toggle` | Add/remove a reaction |
| client → server | `call:invite` / `call:cancel` / `call:decline` | Ring, cancel, decline calls |
| client ↔ server | `webrtc:join` / `webrtc:offer` / `webrtc:answer` / `webrtc:ice-candidate` / `webrtc:leave` | Call signalling |
| server → client | `message:new` · `message:updated` · `message:status` · `reaction:update` | Chat window updates (new, edited/deleted, ticks, reactions) |
| server → client | `conversation:activity` · `conversation:preview` · `conversations:refresh` · `conversation:removed` | Chat list updates |
| server → client | `online-users` · `user-online` · `user-offline` · `presence:refresh` | Presence (privacy-filtered per viewer) |
| server → client | `requests:updated` · `blocks:updated` · `privacy:updated` | Requests badge/toasts, block changes, your settings changed in another tab |
| server → client | `call:incoming` · `call:cancelled` · `call:declined` · `ready` · `webrtc:peer-left` | Calls |

---

## 14. Database schema

Defined in `prisma/schema.prisma` (MySQL). Main tables:

| Table | Holds |
|-------|-------|
| `users` | Profile (name, email, photo, bio, phone), `isOnline`, `lastSeen`, linked to Clerk by `clerkId` |
| `conversations` | 1:1 chats |
| `conversation_users` | Who is in each 1:1 chat + their `lastReadAt` (unread counts) |
| `groups` | Group name, description, photo, creator, `isActive` |
| `group_members` | Group membership, `role` (ADMIN / MEMBER), `lastReadAt` |
| `messages` | Content, `type` (TEXT, IMAGE, VIDEO, FILE, VOICE, AUDIO…), file info, reply link, `isEdited`, `isDeleted`, `isDelivered`, `isRead` — belongs to a conversation **or** a group |
| `message_reads` | Per-user read records |
| `message_reactions` | Emoji reactions per user |
| `chat_requests` | Message requests: sender, receiver, intro, status (PENDING/ACCEPTED/DECLINED) |
| `user_blocks` | Who blocked whom |
| `user_reports` | Reports with reason and details, for the operator to review |

Privacy settings live on `users` (`isDiscoverable`, `messagePermission`, `profilePhotoVisibility`, `aboutVisibility`,
`lastSeenVisibility`, `phoneVisibility`, `emailVisibility`, `readReceipts`) along with `interests` and `location`.

`contacts`, `user_settings`, `message_status` and `user_presence` exist in the schema but are reserved for future use.
Schema changes are applied with `npx prisma db push` (also run automatically on Railway start).

---

## 15. Testing checklist

Use two accounts at once — a normal window and an **Incognito/Private** window (or two devices on the deployed URL).

- [ ] Sign up as user A and user B (try **Continue with Google** for one of them)
- [ ] A opens **Discover** → finds B → **Send message request** with an intro
- [ ] B gets a toast and a badge on **Requests** → Accept → the chat opens with A's intro; both now see each other in **Contacts**
- [ ] B sets *Last seen* to **Nobody** in Privacy → A no longer sees B online; B turns off *Show me in Discover* → B disappears from Discover
- [ ] Block from the chat menu → the input is replaced by "You blocked this contact"; unblock restores it
- [ ] Send text → B sees it live; A's ticks go ✓ → ✓✓ grey → ✓✓ blue when B opens the chat
- [ ] "typing…" shows in the other window
- [ ] Message menu: reply, react, copy, forward, edit, delete for everyone
- [ ] Send a photo, a PDF and a voice note
- [ ] Create a group → add a member, make admin, change photo, remove member, exit, delete
- [ ] Voice and video call → other side rings → accept → mute, share screen, hang up
- [ ] Close B → A sees "last seen…"; unread badges appear for chats not open
- [ ] Edit profile name/photo/interests in **Profile**; paste an image into the composer; send `*bold*` text and a link

---

## 16. Troubleshooting

| Problem | Fix |
|---------|-----|
| `npm install` hangs on `prisma -v` | Prisma's telemetry check is blocked. Ctrl+C, then run `npx prisma generate` with `CHECKPOINT_DISABLE=1` (PowerShell: `$env:CHECKPOINT_DISABLE=1`). |
| `Environment variable not found: DATABASE_URL` | Create **`.env`** (Prisma doesn't read `.env.local`). |
| `P1001: Can't reach database server` | MySQL not running, wrong host/port, or an internal URL used from outside — use the **public** URL. |
| `Access denied for user` | Wrong credentials; URL-encode special characters in the password. |
| Stuck on "Loading your chats…" | Check server logs — usually DB unreachable or wrong Clerk keys. |
| Red "Disconnected" / no live updates | Don't set `NEXT_PUBLIC_SOCKET_URL`; ensure WebSockets aren't blocked by a proxy. |
| Mic/camera don't work | Use `http://localhost:3000` or the **https** URL, and allow permissions. |
| Calls ring but never connect | Users on different networks → configure TURN (8.7). |
| Uploads disappear after deploy | Attach a volume and set `UPLOAD_DIR=/data/uploads`. |
| Port 3000 in use | Stop the other process or set `PORT=3001`. |
| Clerk "invalid host" / redirect loop in production | Your domain isn't configured in the Clerk instance whose keys you use (8.6). |
| Google sign-in fails or loops | Development keys (`pk_test_`) use Clerk's shared Google app: enable Google under **Configure → SSO connections** and it works on any domain. **Production** keys (`pk_live_`) need your own Google OAuth client: create one in Google Cloud Console, add the **Authorized redirect URI** Clerk shows you (in the Google connection settings), paste the Client ID/Secret into Clerk. Also add your site under Clerk **Domains**. |
| Entered the email code (or picked a Google account), pressed Continue, nothing happens | Clerk's **Bot sign-up protection** is on and its CAPTCHA was blocked (ad blocker, Brave shields, strict tracking protection). Clerk rejects the sign-up with `captcha_missing_token`. Turn it off in *Configure → Attack protection*, or allow `challenges.cloudflare.com`. With Google, a required **username** adds one more step; make username optional. If you get in but stay on "Loading your chats…", the account sync failed: you'll see a **Try again** screen and the server log shows `User sync error`. |
| AI buttons say "unavailable" | Set `AI_PROVIDER` and a **valid** `GROQ_API_KEY` (or `OPENAI_API_KEY`). The server log shows `AI provider error` with `invalid_api_key` when the key is expired. |
| Messages only appear after refreshing; header says *Session could not be verified* | `CLERK_SECRET_KEY` on the server doesn't match the publishable key's Clerk instance. Use the pair from the same Clerk app/instance and redeploy. |

---

## 17. Project structure & scripts

```
server.js                 Custom server: Next.js + Socket.IO + /uploads + /health
railway.json              Railway build/start/health-check config
.env.example              Template for your .env
prisma/schema.prisma      Database schema
src/
  middleware.ts           Clerk route protection
  app/
    page.tsx              Landing page (redirects to /chat when signed in)
    chat/page.tsx         The chat app
    sign-in, sign-up      Clerk auth pages
    api/                  REST API (see section 12)
  components/
    chat/                 ChatApp, Sidebar, ConversationList, ChatWindow, MessageBubble,
                          Composer, ContactsPanel, CreateGroupModal, GroupInfoDrawer, UserProfile, VoiceMessage…
    call/                 CallModal (WebRTC), IncomingCallDialog
    people/               DiscoverPanel, RequestsPanel, PrivacySettings, PersonProfileDialog
    ui/                   Reusable UI components (shadcn/Radix based)
  contexts/               Theme and profile contexts
  hooks/                  useSocket (Socket.IO client), useUserSync
  lib/                    prisma client, realtime broadcasts, message helpers, privacy rules, conversation rules, storage path
```

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start locally (development) |
| `npm run build` | Generate Prisma client + production build |
| `npm start` | Run the production build |
| `npm run start:railway` | Sync DB schema, then start in production (used by Railway) |
| `npx prisma db push` | Create/update database tables |
| `npx prisma studio` | Browse the database in your browser |
| `npm run lint` | Lint |

---

## 18. Known limitations

- **Group read receipts**: a group message turns blue when *any* member reads it (not all members).
- **Group calls** ring every member, but calls are 1-to-1: the caller connects with the first person who answers.
- Discover shows anyone who is discoverable; there's no matching algorithm, distance search or age verification.
- Reports are stored but there is no admin dashboard yet; review them in the database (`user_reports`).
- No end-to-end encryption; messages are stored in your MySQL database.
- Uploads are stored on the server's disk/volume (one server instance); there's no S3/CDN integration.
