'use client'

import * as React from "react"
import { cn } from "@/lib/utils"

interface AnimatedBackgroundProps {
  className?: string
  variant?: "particles" | "gradient" | "orbs" | "mesh"
  intensity?: "low" | "medium" | "high"
  children?: React.ReactNode
}

const AnimatedBackground = React.forwardRef<HTMLDivElement, AnimatedBackgroundProps>(
  ({ className, variant = "particles", intensity = "medium", children, ...props }, ref) => {
    const intensityClasses = {
      low: "opacity-30",
      medium: "opacity-50",
      high: "opacity-70",
    }

    const renderParticles = () => (
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className={cn(
              "absolute w-1 h-1 bg-blue-400 rounded-full animate-float",
              intensityClasses[intensity]
            )}
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${3 + Math.random() * 2}s`,
            }}
          />
        ))}
      </div>
    )

    const renderGradient = () => (
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 via-purple-500/20 to-pink-500/20 animate-pulse" />
        <div className="absolute inset-0 bg-gradient-to-tl from-green-500/10 via-yellow-500/10 to-red-500/10 animate-pulse" style={{ animationDelay: "1s" }} />
      </div>
    )

    const renderOrbs = () => (
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className={cn(
              "absolute rounded-full blur-xl animate-float",
              intensityClasses[intensity]
            )}
            style={{
              width: `${100 + Math.random() * 200}px`,
              height: `${100 + Math.random() * 200}px`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              background: `radial-gradient(circle, ${i % 3 === 0 ? 'rgba(102, 126, 234, 0.3)' : i % 3 === 1 ? 'rgba(240, 147, 251, 0.3)' : 'rgba(79, 172, 254, 0.3)'}, transparent)`,
              animationDelay: `${Math.random() * 4}s`,
              animationDuration: `${8 + Math.random() * 4}s`,
            }}
          />
        ))}
      </div>
    )

    const renderMesh = () => (
      <div className="absolute inset-0">
        <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <pattern id="mesh" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
              <path
                d="M 10 0 L 0 0 0 10"
                fill="none"
                stroke="rgba(102, 126, 234, 0.1)"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>
          <rect width="100" height="100" fill="url(#mesh)" />
        </svg>
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-blue-500/5 to-purple-500/5 animate-pulse" />
      </div>
    )

    const renderBackground = () => {
      switch (variant) {
        case "particles":
          return renderParticles()
        case "gradient":
          return renderGradient()
        case "orbs":
          return renderOrbs()
        case "mesh":
          return renderMesh()
        default:
          return renderParticles()
      }
    }

    return (
      <div
        ref={ref}
        className={cn("relative min-h-screen", className)}
        {...props}
      >
        {renderBackground()}
        <div className="relative z-10">
          {children}
        </div>
      </div>
    )
  }
)

AnimatedBackground.displayName = "AnimatedBackground"

export { AnimatedBackground } 