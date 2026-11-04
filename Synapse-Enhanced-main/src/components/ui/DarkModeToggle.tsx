'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '@/contexts/ThemeContext'
import { Sun, Moon } from 'lucide-react'

export function DarkModeToggle() {
  const { theme, toggleTheme } = useTheme()
  const [isHovered, setIsHovered] = useState(false)
  const [isPressed, setIsPressed] = useState(false)

  const isDark = theme === 'dark'

  return (
    <motion.div
      className="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
    >
      {/* Background container */}
      <motion.div
        className={`relative w-16 h-8 rounded-full cursor-pointer overflow-hidden ${
          isDark 
            ? 'bg-gradient-to-r from-slate-700 to-slate-800 shadow-lg' 
            : 'bg-gradient-to-r from-yellow-200 to-orange-200 shadow-lg'
        }`}
        onClick={toggleTheme}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ duration: 0.2 }}
      >
        {/* Animated background gradient */}
        <motion.div
          className="absolute inset-0 rounded-full"
          initial={false}
          animate={{
            background: isDark 
              ? 'linear-gradient(135deg, #1e293b 0%, #334155 50%, #475569 100%)'
              : 'linear-gradient(135deg, #fef3c7 0%, #fed7aa 50%, #fdba74 100%)'
          }}
          transition={{ duration: 0.5 }}
        />

        {/* Stars for dark mode */}
        <AnimatePresence>
          {isDark && (
            <>
              <motion.div
                className="absolute w-1 h-1 bg-white rounded-full"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
                transition={{ duration: 0.3 }}
                style={{ top: '20%', left: '25%' }}
              />
              <motion.div
                className="absolute w-0.5 h-0.5 bg-white rounded-full"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                style={{ top: '35%', right: '30%' }}
              />
              <motion.div
                className="absolute w-0.5 h-0.5 bg-white rounded-full"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
                transition={{ duration: 0.3, delay: 0.2 }}
                style={{ bottom: '25%', left: '40%' }}
              />
            </>
          )}
        </AnimatePresence>

        {/* Sun rays for light mode */}
        <AnimatePresence>
          {!isDark && (
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0, rotate: -45 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: 45 }}
              transition={{ duration: 0.5 }}
            >
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-0.5 h-2 bg-yellow-400 rounded-full"
                  style={{
                    top: '50%',
                    left: '50%',
                    transformOrigin: '0 0',
                    transform: `rotate(${i * 45}deg) translateY(-50%)`
                  }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toggle handle */}
        <motion.div
          className="absolute top-1 w-6 h-6 rounded-full flex items-center justify-center"
          initial={false}
          animate={{
            x: isDark ? 32 : 0,
            background: isDark 
              ? 'linear-gradient(135deg, #475569 0%, #64748b 100%)'
              : 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)'
          }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 30
          }}
          style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}
        >
          <AnimatePresence mode="wait">
            {isDark ? (
              <motion.div
                key="moon"
                initial={{ opacity: 0, rotate: -90 }}
                animate={{ opacity: 1, rotate: 0 }}
                exit={{ opacity: 0, rotate: 90 }}
                transition={{ duration: 0.3 }}
              >
                <Moon className="w-3 h-3 text-slate-200" fill="currentColor" />
              </motion.div>
            ) : (
              <motion.div
                key="sun"
                initial={{ opacity: 0, rotate: 90 }}
                animate={{ opacity: 1, rotate: 0 }}
                exit={{ opacity: 0, rotate: -90 }}
                transition={{ duration: 0.3 }}
              >
                <Sun className="w-3 h-3 text-yellow-800" fill="currentColor" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Hover glow effect */}
        <motion.div
          className="absolute inset-0 rounded-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: isHovered ? 0.3 : 0 }}
          transition={{ duration: 0.2 }}
          style={{
            background: isDark 
              ? 'radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(251, 191, 36, 0.3) 0%, transparent 70%)'
          }}
        />

        {/* Press effect */}
        <motion.div
          className="absolute inset-0 rounded-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: isPressed ? 0.2 : 0 }}
          transition={{ duration: 0.1 }}
          style={{
            background: isDark 
              ? 'radial-gradient(circle, rgba(255, 255, 255, 0.2) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(255, 255, 255, 0.2) 0%, transparent 70%)'
          }}
        />
      </motion.div>

      {/* Tooltip */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs rounded-md whitespace-nowrap z-50"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            transition={{ duration: 0.2 }}
            style={{
              background: isDark ? '#1e293b' : '#ffffff',
              color: isDark ? '#e2e8f0' : '#1e293b',
              border: `1px solid ${isDark ? '#475569' : '#e2e8f0'}`,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }}
          >
            {isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
} 