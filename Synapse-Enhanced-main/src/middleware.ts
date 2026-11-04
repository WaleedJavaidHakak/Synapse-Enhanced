import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/socket',
  '/api/webhook(.*)',
  '/api/upload(.*)',
  // Database-stored uploads: unguessable links, same as /uploads on disk
  '/media(.*)'
  // '/api/uploadthing(.*)'
])

export default clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) {
    return
  }
  
  await auth.protect()
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
