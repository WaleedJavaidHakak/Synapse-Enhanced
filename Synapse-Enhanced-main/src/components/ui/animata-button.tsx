'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface AnimataButtonProps {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'gradient' | 'glass' | 'neon'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  onClick?: () => void
  disabled?: boolean
  icon?: React.ReactNode
  iconPosition?: 'left' | 'right'
}

export const AnimataButton = ({
  children,
  variant = 'primary',
  size = 'md',
  className,
  onClick,
  disabled = false,
  icon,
  iconPosition = 'right'
}: AnimataButtonProps) => {
  const [isHovered, setIsHovered] = useState(false)
  const [isPressed, setIsPressed] = useState(false)

  const baseClasses = "relative inline-flex items-center justify-center font-semibold rounded-full transition-all duration-300 overflow-hidden cursor-pointer select-none"
  
  const sizeClasses = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-3 text-base",
    lg: "px-8 py-4 text-lg",
    xl: "px-10 py-5 text-xl"
  }

  const variantClasses = {
    primary: "bg-gradient-to-r from-primary to-primary/80 text-white shadow-lg hover:shadow-xl hover:scale-105",
    secondary: "bg-gradient-to-r from-slate-600 to-slate-700 text-white shadow-lg hover:shadow-xl hover:scale-105",
    gradient: "bg-gradient-to-r from-primary via-purple-600 to-blue-600 text-white shadow-lg hover:shadow-xl hover:scale-105",
    glass: "bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 hover:border-white/40 hover:scale-105",
    neon: "bg-transparent border-2 border-primary text-primary shadow-[0_0_20px_rgba(37,211,102,0.3)] hover:shadow-[0_0_30px_rgba(37,211,102,0.5)] hover:scale-105"
  }

  const disabledClasses = "opacity-50 cursor-not-allowed hover:scale-100"

  return (
    <motion.button
      className={cn(
        baseClasses,
        sizeClasses[size],
        variantClasses[variant],
        disabled && disabledClasses,
        className
      )}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      whileHover={!disabled ? { scale: 1.05 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Gradient overlay for primary and gradient variants */}
      {(variant === 'primary' || variant === 'gradient') && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent"
          initial={{ x: '-100%' }}
          animate={{ x: isHovered ? '100%' : '-100%' }}
          transition={{ duration: 0.6 }}
        />
      )}

      {/* Animated background for glass variant */}
      {variant === 'glass' && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-white/5 to-white/10"
          initial={{ opacity: 0 }}
          animate={{ opacity: isHovered ? 1 : 0 }}
          transition={{ duration: 0.3 }}
        />
      )}

      {/* Floating particles for neon variant */}
      {variant === 'neon' && isHovered && (
        <>
          <motion.div
            className="absolute w-1 h-1 bg-primary rounded-full"
            animate={{
              x: [0, 20, 0],
              y: [0, -10, 0],
              opacity: [0, 1, 0]
            }}
            transition={{ duration: 1, repeat: Infinity }}
            style={{ left: '20%', top: '50%' }}
          />
          <motion.div
            className="absolute w-1 h-1 bg-primary rounded-full"
            animate={{
              x: [0, -15, 0],
              y: [0, -15, 0],
              opacity: [0, 1, 0]
            }}
            transition={{ duration: 1.2, repeat: Infinity, delay: 0.3 }}
            style={{ right: '30%', top: '30%' }}
          />
        </>
      )}

      {/* Content */}
      <div className="relative z-10 flex items-center gap-2">
        {icon && iconPosition === 'left' && (
          <motion.div
            animate={{ rotate: isHovered ? 360 : 0 }}
            transition={{ duration: 0.6 }}
          >
            {icon}
          </motion.div>
        )}
        
        <span>{children}</span>
        
        {icon && iconPosition === 'right' && (
          <motion.div
            animate={{ 
              x: isHovered ? 5 : 0,
              rotate: isHovered ? 360 : 0 
            }}
            transition={{ duration: 0.6 }}
          >
            {icon}
          </motion.div>
        )}
      </div>

      {/* Ripple effect */}
      {isPressed && (
        <motion.div
          className="absolute inset-0 bg-white/20 rounded-full"
          initial={{ scale: 0, opacity: 1 }}
          animate={{ scale: 2, opacity: 0 }}
          transition={{ duration: 0.6 }}
        />
      )}
    </motion.button>
  )
} 