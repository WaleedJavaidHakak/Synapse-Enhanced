'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface WorkButtonProps {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'purple' | 'blue' | 'green'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  onClick?: () => void
  disabled?: boolean
}

export function WorkButton({
  children,
  variant = 'purple',
  size = 'md',
  className,
  onClick,
  disabled = false
}: WorkButtonProps) {
  const sizeClasses = {
    sm: "px-6 py-2 text-sm",
    md: "px-8 py-3 text-base",
    lg: "px-12 py-4 text-lg",
    xl: "px-14 py-4 text-lg"
  }

  const variantClasses = {
    primary: "bg-slate-800 text-slate-200",
    secondary: "bg-slate-600 text-slate-200",
    purple: "bg-purple-950 text-purple-200",
    blue: "bg-blue-950 text-blue-200",
    green: "bg-green-950 text-green-200"
  }

  const disabledClasses = "opacity-50 cursor-not-allowed"

  return (
    <button
      className={cn(
        "group relative overflow-hidden rounded-full transition-all duration-300",
        sizeClasses[size],
        variantClasses[variant],
        disabled && disabledClasses,
        className
      )}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="absolute bottom-0 left-0 h-48 w-full origin-bottom translate-y-full transform overflow-hidden rounded-full bg-white/15 transition-all duration-300 ease-out group-hover:translate-y-14"></span>
      <span className="relative z-10 font-semibold">{children}</span>
    </button>
  )
} 