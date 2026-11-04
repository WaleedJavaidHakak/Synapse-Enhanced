'use client'

interface TypingIndicatorProps {
  isTyping: boolean
  userName?: string
}

export function TypingIndicator({ isTyping, userName }: TypingIndicatorProps) {
  if (!isTyping) return null

  return (
    <div className="flex items-end gap-2 mb-3">
      <div className="w-8 h-8 rounded-full bg-gray-300 flex-shrink-0"></div>
      <div className="bg-white text-gray-900 border border-gray-200 rounded-2xl rounded-bl-md px-4 py-2 shadow-sm">
        <div className="text-xs font-semibold text-blue-600 mb-1">
          {userName || 'Someone'}
        </div>
        <div className="flex items-center space-x-1">
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
          <span className="text-xs text-gray-500 ml-2">typing...</span>
        </div>
      </div>
    </div>
  )
} 