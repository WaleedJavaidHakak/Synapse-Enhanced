'use client'

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const floatingActionButtonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all duration-300 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 shadow-lg hover:shadow-xl active:scale-95",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700",
        secondary: "bg-gradient-to-r from-pink-500 to-red-500 text-white hover:from-pink-600 hover:to-red-600",
        success: "bg-gradient-to-r from-green-500 to-teal-500 text-white hover:from-green-600 hover:to-teal-600",
        warning: "bg-gradient-to-r from-yellow-500 to-orange-500 text-white hover:from-yellow-600 hover:to-orange-600",
        glass: "glass text-white backdrop-blur-md hover:bg-white/20",
        neon: "bg-transparent border-2 border-blue-400 text-blue-400 neon-glow hover:bg-blue-400 hover:text-white",
      },
      size: {
        sm: "h-12 w-12",
        default: "h-14 w-14",
        lg: "h-16 w-16",
        xl: "h-20 w-20",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface FloatingActionButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof floatingActionButtonVariants> {
  icon?: React.ReactNode
  label?: string
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left" | "center"
}

const FloatingActionButton = React.forwardRef<HTMLButtonElement, FloatingActionButtonProps>(
  ({ className, variant, size, icon, label, position = "bottom-right", ...props }, ref) => {
    const positionClasses = {
      "bottom-right": "bottom-6 right-6",
      "bottom-left": "bottom-6 left-6",
      "top-right": "top-6 right-6",
      "top-left": "top-6 left-6",
      "center": "bottom-1/2 right-1/2 transform translate-x-1/2 translate-y-1/2",
    }

    return (
      <div className={cn("fixed z-50", positionClasses[position])}>
        <button
          className={cn(
            floatingActionButtonVariants({ variant, size, className }),
            "animate-float"
          )}
          ref={ref}
          {...props}
        >
          {icon}
          {label && <span className="sr-only">{label}</span>}
        </button>
      </div>
    )
  }
)

FloatingActionButton.displayName = "FloatingActionButton"

export { FloatingActionButton, floatingActionButtonVariants } 