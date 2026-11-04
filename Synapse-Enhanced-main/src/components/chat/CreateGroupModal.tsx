'use client'

import { useState, useEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import { useTheme } from '@/contexts/ThemeContext'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { 
  X, 
  Users, 
  Search,
  Image as ImageIcon,
  UserPlus
} from 'lucide-react'

interface CreateGroupModalProps {
  isOpen: boolean
  onClose: () => void
  onGroupCreated: (group: any) => void
}

interface User {
  id: string
  name: string
  phone?: string
  email?: string
  imageUrl?: string
  isOnline: boolean
  bio?: string
}

export function CreateGroupModal({ isOpen, onClose, onGroupCreated }: CreateGroupModalProps) {
  const { user } = useUser()
  const { theme } = useTheme()
  const [groupName, setGroupName] = useState('')
  const [groupImage, setGroupImage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [users, setUsers] = useState<User[]>([])
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadUsers()
    }
  }, [isOpen])

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim()) {
        searchUsers()
      } else {
        loadUsers()
      }
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [searchQuery])

  const loadUsers = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/users/search?q=', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      if (response.ok) {
        const data = await response.json()
        // Filter out current user
        const filteredUsers = data.users?.filter((u: User) => u.id !== user?.id) || []
        setUsers(filteredUsers)
      } else {
        console.error('Failed to load users')
        toast.error('Failed to load users')
      }
    } catch (error) {
      console.error('Error loading users:', error)
      toast.error('Network error while loading users')
    } finally {
      setLoading(false)
    }
  }

  const searchUsers = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      if (response.ok) {
        const data = await response.json()
        // Filter out current user
        const filteredUsers = data.users?.filter((u: User) => u.id !== user?.id) || []
        setUsers(filteredUsers)
      } else {
        console.error('Search failed')
        setUsers([])
      }
    } catch (error) {
      console.error('Search error:', error)
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  const handleUserToggle = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    )
  }

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      toast.error('Please enter a group name')
      return
    }

    if (selectedUsers.length === 0) {
      toast.error('Please select at least one member')
      return
    }

    setCreating(true)
    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          name: groupName.trim(),
          imageUrl: groupImage.trim() || undefined,
          memberIds: selectedUsers
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Group creation failed:', response.status, errorText)
        toast.error('Failed to create group')
        return
      }

      const data = await response.json()
      
      if (data.group) {
        toast.success('Group created successfully!')
        onGroupCreated(data.group)
        handleClose()
      } else {
        toast.error('Invalid response from server')
      }
    } catch (error) {
      console.error('Group creation failed:', error)
      toast.error('Network error. Please check your connection.')
    } finally {
      setCreating(false)
    }
  }

  const handleClose = () => {
    setGroupName('')
    setGroupImage('')
    setSelectedUsers([])
    setSearchQuery('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className={`w-full max-w-md mx-4 rounded-lg shadow-xl transition-colors duration-300 ${
        theme === 'dark' ? 'bg-slate-800' : 'bg-white'
      }`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b transition-colors duration-300 ${
          theme === 'dark' ? 'border-slate-700' : 'border-slate-200'
        }`}>
          <h2 className={`text-lg font-semibold transition-colors duration-300 ${
            theme === 'dark' ? 'text-slate-100' : 'text-slate-900'
          }`}>Create New Group</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Group Details */}
        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <label className={`text-sm font-medium transition-colors duration-300 ${
              theme === 'dark' ? 'text-slate-200' : 'text-slate-700'
            }`}>Group Name</label>
            <Input
              placeholder="Enter group name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className={`transition-colors duration-300 ${
                theme === 'dark' 
                  ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-400' 
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-500'
              }`}
            />
          </div>

          <div className="space-y-2">
            <label className={`text-sm font-medium transition-colors duration-300 ${
              theme === 'dark' ? 'text-slate-200' : 'text-slate-700'
            }`}>Group Image URL (Optional)</label>
            <div className="flex items-center space-x-2">
              <Input
                placeholder="Enter image URL"
                value={groupImage}
                onChange={(e) => setGroupImage(e.target.value)}
                className={`transition-colors duration-300 ${
                  theme === 'dark' 
                    ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-400' 
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-500'
                }`}
              />
              {groupImage && (
                <Avatar className="h-8 w-8">
                  <AvatarImage src={groupImage} />
                  <AvatarFallback className="bg-purple-500 text-white">
                    <ImageIcon className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          </div>
        </div>

        {/* Member Selection */}
        <div className={`border-t transition-colors duration-300 ${
          theme === 'dark' ? 'border-slate-700' : 'border-slate-200'
        }`}>
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-sm font-medium transition-colors duration-300 ${
                theme === 'dark' ? 'text-slate-200' : 'text-slate-700'
              }`}>Add Members</h3>
              <Badge variant="secondary" className="text-xs">
                {selectedUsers.length} selected
              </Badge>
            </div>

            <div className="relative mb-4">
              <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 transition-colors duration-300 ${
                theme === 'dark' ? 'text-slate-400' : 'text-gray-400'
              }`} />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`pl-10 transition-colors duration-300 ${
                  theme === 'dark' 
                    ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-400' 
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-500'
                }`}
              />
            </div>

            <ScrollArea className="h-48">
              {loading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center space-x-3 animate-pulse">
                      <div className={`w-8 h-8 rounded-full transition-colors duration-300 ${
                        theme === 'dark' ? 'bg-slate-600' : 'bg-gray-300'
                      }`}></div>
                      <div className={`h-4 rounded w-24 transition-colors duration-300 ${
                        theme === 'dark' ? 'bg-slate-600' : 'bg-gray-300'
                      }`}></div>
                    </div>
                  ))}
                </div>
              ) : users.length === 0 ? (
                <div className={`text-center py-8 text-sm transition-colors duration-300 ${
                  theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  {searchQuery ? 'No users found' : 'No users available'}
                </div>
              ) : (
                <div className="space-y-2">
                  {users.map((foundUser) => (
                    <div
                      key={foundUser.id}
                      className={`flex items-center space-x-3 p-2 rounded-lg transition-colors duration-200 ${
                        theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-slate-100'
                      }`}
                    >
                      <Checkbox
                        checked={selectedUsers.includes(foundUser.id)}
                        onCheckedChange={() => handleUserToggle(foundUser.id)}
                        className="flex-shrink-0"
                      />
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={foundUser.imageUrl} />
                        <AvatarFallback className="bg-purple-500 text-white">
                          {foundUser.name[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate transition-colors duration-300 ${
                          theme === 'dark' ? 'text-slate-100' : 'text-slate-900'
                        }`}>{foundUser.name}</p>
                        <p className={`text-xs truncate transition-colors duration-300 ${
                          theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
                        }`}>
                          {foundUser.bio || foundUser.email}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        {/* Actions */}
        <div className={`flex items-center justify-end space-x-3 p-6 border-t transition-colors duration-300 ${
          theme === 'dark' ? 'border-slate-700' : 'border-slate-200'
        }`}>
          <Button variant="outline" onClick={handleClose} disabled={creating}>
            Cancel
          </Button>
          <Button 
            onClick={handleCreateGroup} 
            disabled={creating || !groupName.trim() || selectedUsers.length === 0}
            className="min-w-[100px]"
          >
            {creating ? (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Creating...</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <UserPlus className="h-4 w-4" />
                <span>Create Group</span>
              </div>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
