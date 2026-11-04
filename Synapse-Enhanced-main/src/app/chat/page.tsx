import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ChatApp } from '@/components/chat/ChatApp'

export default async function ChatPage() {
  // Local session check (no network call). Middleware already protects this route.
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  return (
    <ErrorBoundary>
      <div className="h-[100dvh] bg-gray-100">
        <ChatApp />
      </div>
    </ErrorBoundary>
  )
}
