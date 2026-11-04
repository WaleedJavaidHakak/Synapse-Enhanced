'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Users, X, Edit, UserPlus, LogOut, Trash2, Crown, MoreVertical, Camera, Search, Check } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface GroupInfoDrawerProps {
  isOpen: boolean
  onClose: () => void
  onChanged: () => void
  onlineUserIds: Set<string>
  onOpenProfile?: (userId: string) => void
  group: {
    id: string
    name: string
    imageUrl?: string
    description?: string
  }
}

interface GroupMember {
  id: string
  name: string
  imageUrl?: string
  bio?: string
  role: 'ADMIN' | 'MODERATOR' | 'MEMBER'
  joinedAt: string
}

interface SearchUser {
  id: string
  name: string
  email?: string
  imageUrl?: string
}

export function GroupInfoDrawer({ isOpen, onClose, onChanged, onlineUserIds, onOpenProfile, group }: GroupInfoDrawerProps) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const [members, setMembers] = useState<GroupMember[]>([])
  const [myRole, setMyRole] = useState<string>('MEMBER')
  const [myId, setMyId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [groupName, setGroupName] = useState(group.name)
  const [description, setDescription] = useState(group.description || '')
  const [imageUrl, setImageUrl] = useState(group.imageUrl || '')
  const [isUploading, setIsUploading] = useState(false)
  const [confirm, setConfirm] = useState<null | 'leave' | 'delete'>(null)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [userQuery, setUserQuery] = useState('')
  const [candidates, setCandidates] = useState<SearchUser[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)
  const isAdmin = myRole === 'ADMIN'

  const loadMembers = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/groups/${group.id}/members`)
      if (!response.ok) throw new Error()
      const data = await response.json()
      setMembers(data.members || [])
      setMyRole(data.myRole)
      setMyId(data.myId)
    } catch {
      toast.error('Failed to load group members')
    } finally {
      setIsLoading(false)
    }
  }, [group.id])

  useEffect(() => {
    if (!isOpen) return
    setGroupName(group.name)
    setDescription(group.description || '')
    setImageUrl(group.imageUrl || '')
    setIsEditing(false)
    loadMembers()
  }, [isOpen, group.name, group.description, group.imageUrl, loadMembers])

  // User search for "Add participants"
  useEffect(() => {
    if (!isAddOpen) return
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/users/search?q=${encodeURIComponent(userQuery)}`)
        const data = await r.json()
        const memberIds = new Set(members.map(m => m.id))
        setCandidates((data.users || []).filter((u: SearchUser) => !memberIds.has(u.id)))
      } catch {
        setCandidates([])
      }
    }, 250)
    return () => clearTimeout(t)
  }, [isAddOpen, userQuery, members])

  const saveChanges = async () => {
    const response = await fetch(`/api/groups/${group.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: groupName.trim(), description, imageUrl })
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) return toast.error(data.error || 'Failed to update group')
    toast.success('Group updated')
    setIsEditing(false)
    onChanged()
  }

  const uploadImage = async (file: File) => {
    setIsUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await r.json()
      if (!r.ok || data.kind !== 'IMAGE') throw new Error(data.error || 'Please choose an image')
      setImageUrl(data.url)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  const memberAction = async (method: 'PATCH' | 'DELETE', userId: string, role?: string) => {
    const url = method === 'DELETE' ? `/api/groups/${group.id}/members?userId=${userId}` : `/api/groups/${group.id}/members`
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'PATCH' ? JSON.stringify({ userId, role }) : undefined
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return toast.error(data.error || 'Action failed')
    setMembers(data.members || [])
    onChanged()
  }

  const addSelected = async () => {
    if (selected.size === 0) return
    const r = await fetch(`/api/groups/${group.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: Array.from(selected) })
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return toast.error(data.error || 'Could not add participants')
    setMembers(data.members || [])
    setSelected(new Set())
    setUserQuery('')
    setIsAddOpen(false)
    toast.success('Participants added')
    onChanged()
  }

  const runConfirm = async () => {
    const action = confirm
    setConfirm(null)
    const r = action === 'delete'
      ? await fetch(`/api/groups/${group.id}`, { method: 'DELETE' })
      : await fetch(`/api/groups/${group.id}/leave`, { method: 'POST' })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return toast.error(data.error || 'Action failed')
    toast.success(action === 'delete' ? 'Group deleted' : 'You left the group')
    onClose()
    onChanged()
  }

  if (!isOpen) return null

  const panel = dark ? 'bg-slate-800 text-slate-100' : 'bg-white text-slate-900'
  const muted = dark ? 'text-slate-400' : 'text-slate-500'
  const border = dark ? 'border-slate-700' : 'border-slate-200'

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className={`h-full w-full sm:max-w-md overflow-y-auto shadow-xl ${panel}`} onClick={(e) => e.stopPropagation()}>
        <div className={`sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-3 ${border} ${panel}`}>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
          <h2 className="font-semibold">Group info</h2>
        </div>

        <div className="flex flex-col items-center gap-2 px-6 py-6">
          <div className="relative">
            {imageUrl ? (
              <img src={imageUrl} alt={group.name} className="h-28 w-28 rounded-full object-cover" />
            ) : (
              <div className="h-28 w-28 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
                <Users className="h-12 w-12 text-white" />
              </div>
            )}
            {isEditing && (
              <>
                <Button
                  size="icon"
                  className="absolute bottom-0 right-0 h-9 w-9 rounded-full bg-[#25D366] hover:bg-[#1ebe57]"
                  onClick={() => fileRef.current?.click()}
                  disabled={isUploading}
                  aria-label="Change group photo"
                >
                  <Camera className="h-4 w-4 text-white" />
                </Button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = '' }} />
              </>
            )}
          </div>

          {isEditing ? (
            <div className="w-full space-y-2 mt-2">
              <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Group name" maxLength={100} />
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add group description" maxLength={1000} />
              <div className="flex gap-2">
                <Button className="flex-1" onClick={saveChanges} disabled={!groupName.trim() || isUploading}>Save</Button>
                <Button variant="outline" onClick={() => { setIsEditing(false); setGroupName(group.name); setDescription(group.description || ''); setImageUrl(group.imageUrl || '') }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <>
              <h3 className="text-xl font-semibold text-center">{group.name}</h3>
              <p className={`text-sm ${muted}`}>Group · {members.length} member{members.length !== 1 ? 's' : ''}</p>
              {group.description && <p className="text-sm text-center whitespace-pre-wrap mt-1">{group.description}</p>}
              {isAdmin && (
                <Button variant="outline" size="sm" className="mt-2" onClick={() => setIsEditing(true)}>
                  <Edit className="h-4 w-4 mr-2" /> Edit group
                </Button>
              )}
            </>
          )}
        </div>

        <div className={`border-t ${border} px-4 py-4`}>
          <div className="mb-2 flex items-center justify-between">
            <h3 className={`text-sm font-medium ${muted}`}>{members.length} members</h3>
          </div>
          {isAdmin && (
            <button type="button" onClick={() => setIsAddOpen(true)} className="mb-1 flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-black/5 dark:hover:bg-white/5">
              <div className="h-10 w-10 rounded-full bg-[#25D366] flex items-center justify-center">
                <UserPlus className="h-5 w-5 text-white" />
              </div>
              <span className="font-medium">Add participants</span>
            </button>
          )}
          {isLoading && members.length === 0 ? (
            <div className="space-y-3 py-2">
              {[0, 1, 2].map(i => <div key={i} className={`h-10 rounded animate-pulse ${dark ? 'bg-slate-700' : 'bg-slate-100'}`} />)}
            </div>
          ) : (
            <div className="space-y-1">
              {members.map(member => {
                const isMe = member.id === myId
                return (
                  <div
                    key={member.id}
                    className={`flex items-center gap-3 rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/5 ${!isMe && onOpenProfile ? 'cursor-pointer' : ''}`}
                    onClick={() => { if (!isMe && onOpenProfile) { onClose(); onOpenProfile(member.id) } }}
                  >
                    <div className="relative">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={member.imageUrl} />
                        <AvatarFallback className="bg-purple-500 text-white">{member.name[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      {!isMe && onlineUserIds.has(member.id) && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 ring-2 ring-white dark:ring-slate-800" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{isMe ? 'You' : member.name}</p>
                      {member.bio && <p className={`truncate text-xs ${muted}`}>{member.bio}</p>}
                    </div>
                    {member.role === 'ADMIN' && (
                      <span className="flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-600">
                        <Crown className="h-3 w-3" /> Admin
                      </span>
                    )}
                    {isAdmin && !isMe && (
                      // Keep menu clicks from also opening the member profile (React events bubble through portals)
                      <div onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Options for ${member.name}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {member.role === 'ADMIN' ? (
                            <DropdownMenuItem onClick={() => memberAction('PATCH', member.id, 'MEMBER')}>Dismiss as admin</DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => memberAction('PATCH', member.id, 'ADMIN')}>Make group admin</DropdownMenuItem>
                          )}
                          <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => memberAction('DELETE', member.id)}>
                            Remove {member.name.split(' ')[0]}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className={`border-t ${border} px-4 py-3 space-y-1`}>
          <button type="button" onClick={() => setConfirm('leave')} className="flex w-full items-center gap-3 rounded-lg p-2 text-left text-red-600 hover:bg-red-500/10">
            <LogOut className="h-5 w-5" /> Exit group
          </button>
          {isAdmin && (
            <button type="button" onClick={() => setConfirm('delete')} className="flex w-full items-center gap-3 rounded-lg p-2 text-left text-red-600 hover:bg-red-500/10">
              <Trash2 className="h-5 w-5" /> Delete group
            </button>
          )}
        </div>
      </div>

      <Dialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null) }}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{confirm === 'delete' ? `Delete "${group.name}"?` : `Exit "${group.name}"?`}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirm === 'delete'
              ? 'The group will be removed for every member.'
              : 'You will stop receiving messages from this group.'}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={runConfirm}>{confirm === 'delete' ? 'Delete group' : 'Exit group'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddOpen} onOpenChange={(o) => { setIsAddOpen(o); if (!o) setSelected(new Set()) }}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Add participants</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search name or email" value={userQuery} onChange={(e) => setUserQuery(e.target.value)} autoFocus />
          </div>
          <div className="max-h-72 overflow-y-auto space-y-1">
            {candidates.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No users to add</p>}
            {candidates.map(u => {
              const on = selected.has(u.id)
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setSelected(prev => { const n = new Set(prev); if (on) n.delete(u.id); else n.add(u.id); return n })}
                  className={`flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-muted ${on ? 'bg-muted' : ''}`}
                >
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={u.imageUrl} />
                    <AvatarFallback>{u.name[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{u.name}</div>
                    {u.email && <div className="truncate text-xs text-muted-foreground">{u.email}</div>}
                  </div>
                  {on && <Check className="h-4 w-4 text-emerald-600" />}
                </button>
              )
            })}
          </div>
          <DialogFooter>
            <Button onClick={addSelected} disabled={selected.size === 0}>Add {selected.size > 0 ? selected.size : ''}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
