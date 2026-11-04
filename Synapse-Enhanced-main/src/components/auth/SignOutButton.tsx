'use client'

import { useAuth, useClerk } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface SignOutButtonProps {
  variant?: 'default' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function SignOutButton({ 
  variant = 'ghost', 
  size = 'sm',
  className = ''
}: SignOutButtonProps) {
  const { signOut } = useClerk()
  const { isLoaded } = useAuth()
  const router = useRouter()

  const handleSignOut = async () => {
    if (!isLoaded) return

    try {
      localStorage.removeItem('whatsapp-clone-data')
      sessionStorage.clear()

      await signOut({
        redirectUrl: '/'
      })

      toast.success('Signed out successfully')
      router.push('/')
      router.refresh()

    } catch (error) {
      console.error('Sign out error:', error)
      toast.error('Failed to sign out')
    }
  }

  return (
    <Button
      variant={variant}
      size={size as any}
      onClick={handleSignOut}
      disabled={!isLoaded}
      className={className}
    >
      Sign out
    </Button>
  )
}
