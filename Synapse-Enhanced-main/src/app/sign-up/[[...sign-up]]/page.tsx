import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Synapse
          </h1>
          <p className="text-gray-600 mb-8">
            Create your account to start messaging
          </p>
        </div>
        
        <SignUp
          routing="path"
          path="/sign-up"
          signInUrl="/sign-in"
          fallbackRedirectUrl="/chat"
          appearance={{
            elements: {
              card: "shadow-lg border-0",
              headerTitle: "hidden", 
              headerSubtitle: "hidden",
            }
          }}
        />
      </div>
    </div>
  )
}
