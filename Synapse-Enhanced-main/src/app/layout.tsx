
import './globals.css'
import { ClerkProvider } from '@clerk/nextjs'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { ProfileProvider } from '@/contexts/ProfileContext'
import { Toaster } from '@/components/ui/sonner'

export const metadata = {
  title: 'Synapse',
  description: 'A real-time messaging app using Next.js, Shadcn, Clerk, Sockets and SQL',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

  if (!publishableKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY. Check your deployment environment variables.'
    )
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/chat"
      signUpFallbackRedirectUrl="/chat"
      appearance={{
        elements: {
          card: 'shadow-lg border-0',
          headerTitle: 'hidden',
          headerSubtitle: 'hidden',
        },
      }}
    >
      <html lang="en" suppressHydrationWarning>
        <head>
          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function() {
                  try {
                    var theme = localStorage.getItem('whatsapp-theme');
                    var initialTheme = theme || 'light';
                    document.documentElement.classList.toggle('dark', initialTheme === 'dark');
                    document.documentElement.setAttribute('data-theme', initialTheme);
                  } catch (e) {
                    document.documentElement.classList.remove('dark');
                    document.documentElement.setAttribute('data-theme', 'light');
                  }
                })();
              `,
            }}
          />
        </head>
        <body>
          <ThemeProvider>
            <ProfileProvider>
              {children}
              <Toaster position="top-right" richColors />
            </ProfileProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
