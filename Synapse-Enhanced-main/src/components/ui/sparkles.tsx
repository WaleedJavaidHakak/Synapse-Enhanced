'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface SparklesProps {
  children: React.ReactNode
  className?: string
  count?: number
  duration?: number
  size?: 'sm' | 'md' | 'lg'
}

export function Sparkles({ 
  children, 
  className, 
  count = 20, 
  duration = 2,
  size = 'md'
}: SparklesProps) {
  const [sparkles, setSparkles] = React.useState<Array<{
    id: number
    x: number
    y: number
    delay: number
  }>>([])

  React.useEffect(() => {
    const newSparkles = Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * duration,
    }))
    setSparkles(newSparkles)
  }, [count, duration])

  const sizeClasses = {
    sm: 'w-1 h-1',
    md: 'w-2 h-2',
    lg: 'w-3 h-3'
  }

  return (
    <div className={cn('relative inline-block', className)}>
      {children}
      {sparkles.map((sparkle) => (
        <div
          key={sparkle.id}
          className={cn(
            'absolute pointer-events-none animate-ping',
            sizeClasses[size]
          )}
          style={{
            left: `${sparkle.x}%`,
            top: `${sparkle.y}%`,
            animationDelay: `${sparkle.delay}s`,
            animationDuration: `${duration}s`,
          }}
        >
          <div className="w-full h-full bg-yellow-400 rounded-full opacity-75" />
        </div>
      ))}
    </div>
  )
} 