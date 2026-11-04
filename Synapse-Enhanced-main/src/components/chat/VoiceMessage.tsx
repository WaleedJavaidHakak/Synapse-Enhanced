'use client'

import { useState, useRef, useEffect } from 'react'
import { Play, Pause, Volume2 } from 'lucide-react'

interface VoiceMessageProps {
  fileUrl: string
  content?: string
  fileSize?: number
  isOwn: boolean
}

export function VoiceMessage({ fileUrl, content, fileSize, isOwn }: VoiceMessageProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    setIsLoading(true)
    setHasError(false)
    setDuration(0)
    setCurrentTime(0)

    if (audioRef.current) {
      const audio = audioRef.current
      
      const updateTime = () => setCurrentTime(audio.currentTime)
      const updateDuration = () => {
        if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
          setDuration(audio.duration)
          setIsLoading(false)
        }
      }
      const handleEnded = () => setIsPlaying(false)
      const handleCanPlay = () => {
        if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
          setDuration(audio.duration)
          setIsLoading(false)
        }
      }
      const handleError = (_e: Event) => {
        setHasError(true)
        setIsLoading(false)
      }
      
      audio.addEventListener('timeupdate', updateTime)
      audio.addEventListener('loadedmetadata', updateDuration)
      audio.addEventListener('canplay', handleCanPlay)
      audio.addEventListener('ended', handleEnded)
      audio.addEventListener('error', handleError)
      
      if (audio.readyState >= 1) {
        updateDuration()
      }
      
      audio.load()
      
      const contentDuration = extractDurationFromContent(content)
      if (contentDuration > 0) {
        setDuration(contentDuration)
        setIsLoading(false)
      }

      timeoutRef.current = setTimeout(() => {
        if (isLoading) {
          setIsLoading(false)
          if (contentDuration > 0) {
            setDuration(contentDuration)
          }
        }
      }, 3000)
      
      return () => {
        audio.removeEventListener('timeupdate', updateTime)
        audio.removeEventListener('loadedmetadata', updateDuration)
        audio.removeEventListener('canplay', handleCanPlay)
        audio.removeEventListener('ended', handleEnded)
        audio.removeEventListener('error', handleError)
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }
      }
    }
  }, [fileUrl, content])

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
        setIsPlaying(false)
      } else {
        audioRef.current.play()
        setIsPlaying(true)
      }
    }
  }

  const formatTime = (time: number) => {
    if (!time || !isFinite(time) || time < 0) return '0:00'
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const extractDurationFromContent = (content: string | undefined): number => {
    if (!content) return 0
    const match = content.match(/\((\d+)s\)/)
    return match ? parseInt(match[1]) : 0
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value)
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  return (
    <div className="space-y-2">
      <div className={`flex items-center gap-3 p-3 rounded-lg ${
        isOwn ? 'bg-green-100' : 'bg-gray-50'
      }`}>
        <button
          onClick={togglePlay}
          className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors ${
            isOwn 
              ? 'bg-green-500 hover:bg-green-600 text-white' 
              : 'bg-blue-500 hover:bg-blue-600 text-white'
          }`}
        >
          {isPlaying ? (
            <Pause className="w-5 h-5" />
          ) : (
            <Play className="w-5 h-5 ml-0.5" />
          )}
        </button>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Volume2 className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-900">
              Voice Message
            </span>
          </div>
          
                     <div className="space-y-1">
             {duration > 0 ? (
               <>
                 <input
                   type="range"
                   min="0"
                   max={duration}
                   value={currentTime}
                   onChange={handleSeek}
                   className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                   style={{
                     background: `linear-gradient(to right, ${
                       isOwn ? '#10b981' : '#3b82f6'
                     } 0%, ${
                       isOwn ? '#10b981' : '#3b82f6'
                     } ${(currentTime / duration) * 100}%, #e5e7eb ${(currentTime / duration) * 100}%, #e5e7eb 100%)`
                   }}
                 />
                 <div className="flex justify-between text-xs text-gray-500">
                   <span>{formatTime(currentTime)}</span>
                   <span>{formatTime(duration)}</span>
                 </div>
               </>
             ) : hasError ? (
               <div className="flex justify-between text-xs text-red-500">
                 <span>{formatTime(currentTime)}</span>
                 <span>Error loading</span>
               </div>
             ) : (
               <div className="flex justify-between text-xs text-gray-500">
                 <span>{formatTime(currentTime)}</span>
                 <span>{isLoading ? 'Loading...' : 'Unknown duration'}</span>
               </div>
             )}
           </div>
          
                     {content && content !== 'Voice message (nulls)' && (
             <div className="text-xs text-gray-600 mt-1">
               {content}
             </div>
           )}
           {(!content || content === 'Voice message (nulls)') && duration > 0 && (
             <div className="text-xs text-gray-600 mt-1">
               Voice message ({formatTime(duration)})
             </div>
           )}
        </div>
        
        {fileSize && (
          <div className="text-xs text-gray-400 flex-shrink-0">
            {Math.round(fileSize / 1024)}KB
          </div>
        )}
      </div>
      
             <audio 
         ref={audioRef} 
         src={fileUrl} 
         preload="metadata"
         crossOrigin="anonymous"
         onLoadedMetadata={() => {
           if (audioRef.current && audioRef.current.duration && isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
             setDuration(audioRef.current.duration)
           }
         }}
       />
      
      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 12px;
          width: 12px;
          border-radius: 50%;
          background: ${isOwn ? '#10b981' : '#3b82f6'};
          cursor: pointer;
        }
        
        .slider::-moz-range-thumb {
          height: 12px;
          width: 12px;
          border-radius: 50%;
          background: ${isOwn ? '#10b981' : '#3b82f6'};
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  )
} 