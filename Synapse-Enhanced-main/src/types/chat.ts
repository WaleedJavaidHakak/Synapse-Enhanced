
export interface User {
    id: string
    clerkId: string
    name: string
    email: string
    phone?: string
    imageUrl?: string
    bio: string
    isOnline: boolean
    lastSeen: Date
    createdAt: Date
    updatedAt: Date
  }
  
  export interface Message {
    id: string
    content?: string
    type: 'TEXT' | 'IMAGE' | 'FILE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT'
    fileUrl?: string
    fileName?: string
    senderId: string
    conversationId?: string
    groupId?: string
    replyToId?: string
    isEdited: boolean
    isDeleted: boolean
    createdAt: Date
    updatedAt: Date
    sender: {
      id: string
      name: string
      imageUrl?: string
    }
    readBy?: MessageRead[]
  }
  
  export interface Conversation {
    id: string
    type: 'DIRECT' | 'GROUP'
    name?: string
    imageUrl?: string
    lastMessage?: {
      content: string
      timestamp: Date
      senderId: string
      senderName: string
    }
    unreadCount: number
    isOnline?: boolean
    lastSeen?: Date
    updatedAt: Date
  }
  
  export interface MessageRead {
    id: string
    messageId: string
    userId: string
    readAt: Date
  }
  
  export interface SocketContextType {
    socket: any | null
    isConnected: boolean
    connectionError?: string
  }
  