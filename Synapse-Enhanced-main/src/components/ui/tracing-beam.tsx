'use client'

import React, { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface TracingBeamProps {
  children: React.ReactNode
  className?: string
  color?: string
  duration?: number
}

export function TracingBeam({ 
  children, 
  className,
  color = "hsl(var(--primary))",
  duration = 2
}: TracingBeamProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting)
      },
      { threshold: 0.1 }
    )

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!isVisible) return

    let startTime: number
    let animationId: number

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const progress = (timestamp - startTime) / (duration * 1000)
      
      if (progress <= 1) {
        setPosition(progress * 100)
        animationId = requestAnimationFrame(animate)
      } else {
        setPosition(100)
      }
    }

    animationId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationId)
  }, [isVisible, duration])

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {children}
      {isVisible && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(to bottom, transparent 0%, ${color} 50%, transparent 100%)`,
            backgroundSize: '100% 200%',
            backgroundPosition: `0 ${position}%`,
            transition: 'background-position 0.1s ease-out',
          }}
        />
      )}
    </div>
  )
} 