'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

interface ProfileData {
  name: string
  bio: string
  phone: string
  email: string
  imageUrl: string
}

interface ProfileContextType {
  profileData: ProfileData | null
  updateProfile: (data: ProfileData) => void
  refreshProfile: () => void
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profileData, setProfileData] = useState<ProfileData | null>(null)

  const updateProfile = (data: ProfileData) => {
    setProfileData(data)
  }

  const refreshProfile = () => {
    setProfileData(null)
  }

  return (
    <ProfileContext.Provider value={{ profileData, updateProfile, refreshProfile }}>
      {children}
    </ProfileContext.Provider>
  )
}

export const useProfile = () => {
  const context = useContext(ProfileContext)
  if (!context) {
    throw new Error('useProfile must be used within ProfileProvider')
  }
  return context
} 