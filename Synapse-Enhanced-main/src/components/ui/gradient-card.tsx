'use client'

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const gradientCardVariants = cva(
  "rounded-xl p-6 transition-all duration-300 relative overflow-hidden",
  {
    variants: {
      variant: {
        default: "glass-card border border-white/20",
        primary: "gradient-border bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/50 dark:to-purple-950/50",
        secondary: "gradient-border bg-gradient-to-br from-pink-50 to-red-50 dark:from-pink-950/50 dark:to-red-950/50",
        success: "gradient-border bg-gradient-to-br from-green-50 to-teal-50 dark:from-green-950/50 dark:to-teal-950/50",
        warning: "gradient-border bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-950/50 dark:to-orange-950/50",
        glass: "glass-card",
        floating: "floating-card",
      },
      size: {
        sm: "p-4",
        default: "p-6",
        lg: "p-8",
        xl: "p-10",
      },
      hover: {
        none: "",
        lift: "card-hover",
        glow: "hover-glow",
        magnetic: "magnetic-hover",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      hover: "lift",
    },
  }
)

export interface GradientCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof gradientCardVariants> {
  children: React.ReactNode
  gradient?: "primary" | "secondary" | "success" | "warning" | "dark" | "light"
  animated?: boolean
}

const GradientCard = React.forwardRef<HTMLDivElement, GradientCardProps>(
  ({ className, variant, size, hover, children, gradient, animated = false, ...props }, ref) => {
    const gradientClasses = {
      primary: "from-blue-500/20 to-purple-500/20",
      secondary: "from-pink-500/20 to-red-500/20",
      success: "from-green-500/20 to-teal-500/20",
      warning: "from-yellow-500/20 to-orange-500/20",
      dark: "from-gray-800/20 to-gray-900/20",
      light: "from-gray-100/20 to-gray-200/20",
    }

    return (
      <div
        className={cn(
          gradientCardVariants({ variant, size, hover, className }),
          animated && "animate-slide-up",
          gradient && `bg-gradient-to-br ${gradientClasses[gradient]}`
        )}
        ref={ref}
        {...props}
      >
        {children}
        {/* Gradient overlay for extra effect */}
        {gradient && (
          <div
            className={cn(
              "absolute inset-0 bg-gradient-to-br opacity-0 hover:opacity-10 transition-opacity duration-300 pointer-events-none",
              gradientClasses[gradient]
            )}
          />
        )}
      </div>
    )
  }
)

GradientCard.displayName = "GradientCard"

export { GradientCard, gradientCardVariants } 