'use client'

import { Button } from '@/components/ui/button'
import { useTheme } from '@/contexts/ThemeContext'
import { Moon, Sun } from 'lucide-react'

interface ThemeToggleProps {
  variant?: 'default' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  showText?: boolean
  className?: string
}

export function ThemeToggle({ 
  variant = 'ghost', 
  size = 'sm' as 'sm' | 'md' | 'lg', 
  showText = false,
  className = ''
}: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme()

  return (
    <Button
      variant={variant}
      size={size as 'default' | 'sm' | 'lg' | 'icon' | null | undefined}
      onClick={toggleTheme}
      className={`flex items-center gap-2 ${className}`}
    >
      {theme === 'light' ? (
        <Moon className="h-4 w-4" />
      ) : (
        <Sun className="h-4 w-4" />
      )}
      {showText && (
        <span className="text-sm">
          {theme === 'light' ? 'Dark' : 'Light'} Mode
        </span>
      )}
    </Button>
  )
}
