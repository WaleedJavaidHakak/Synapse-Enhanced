# Deploy Synapse on Render Free

Synapse requires a Node web service because its custom server hosts Next.js and Socket.IO together.

## Requirements

- GitHub repository connected to Render
- MySQL-compatible database (for example, Aiven MySQL)
- Clerk publishable key
- Clerk secret key

## Deployment

1. Open Render.
2. Select **New → Blueprint**.
3. Select `WaleedJavaidHakak/Synapse-Enhanced`.
4. Select branch `main`.
5. Review the `render.yaml` configuration.
6. Supply the required environment variables:
   - `DATABASE_URL`
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
7. Apply the Blueprint.
8. Wait for the build and deployment.

## Environment

The Blueprint configures:
- Node runtime
- Free web service
- Prisma database synchronization during build
- Next.js production build
- Socket.IO custom server
- Health check at `/health`
- Temporary uploads at `/tmp/uploads`

## Important Free Plan Limitations

- Free services sleep after inactivity and may take time to wake up.
- No persistent disk is included.
- Uploaded files stored under `/tmp/uploads` can disappear after restarts or redeployments.
- Aiven MySQL is an external database and must allow connections from Render.
- The build runs `prisma db push`, so `DATABASE_URL` must be available and the database reachable during the build. Keep the database credentials private.

## Verify Deployment

Open:

`https://YOUR-RENDER-DOMAIN/health`

A healthy service should return JSON indicating `status: OK`.

Then test:
- Sign up and sign in
- User synchronization
- One-to-one messaging
- Group messaging
- Socket.IO real-time updates
- File uploads
