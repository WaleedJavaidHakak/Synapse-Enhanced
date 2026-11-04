import { NextRequest, NextResponse } from 'next/server'
import { aiNotConfigured, providerError } from '@/lib/ai'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { getChatAccess } from '@/lib/realtime'

type ReplyRequestBody = {
  conversationId: string
  numSuggestions?: number
}

type ProviderConfig = {
  name: 'openai' | 'groq'
  baseUrl: string
  apiKey: string
  model: string
}

function resolveProvider(): ProviderConfig | null {
  const providerEnv = (process.env.AI_PROVIDER || '').toLowerCase()
  if (providerEnv === 'groq' && process.env.GROQ_API_KEY) {
    return {
      name: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
      apiKey: process.env.GROQ_API_KEY!,
      model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
    }
  }
  if (providerEnv === 'openai' && process.env.OPENAI_API_KEY) {
    return {
      name: 'openai',
      baseUrl: 'https://api.openai.com/v1/chat/completions',
      apiKey: process.env.OPENAI_API_KEY!,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    }
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      name: 'openai',
      baseUrl: 'https://api.openai.com/v1/chat/completions',
      apiKey: process.env.OPENAI_API_KEY!,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    }
  }
  if (process.env.GROQ_API_KEY) {
    return {
      name: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
      apiKey: process.env.GROQ_API_KEY!,
      model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
    }
  }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth()
    const user = clerkUserId ? { id: clerkUserId } : null
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const provider = resolveProvider()
    if (!provider) {
      return aiNotConfigured()
    }

    const body = (await req.json()) as ReplyRequestBody
    const { conversationId, numSuggestions = 3 } = body || {}

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 })
    }

    const dbUser = await prisma.user.findUnique({ where: { clerkId: user.id }, select: { id: true } })
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // The id may be a 1:1 chat or a group
    const access = await getChatAccess(conversationId, dbUser.id)
    if (!access) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    // Pull last messages for context
    const lastMessages = await prisma.message.findMany({
      where: { ...(access === 'GROUP' ? { groupId: conversationId } : { conversationId }), isDeleted: false, type: 'TEXT' },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { sender: { select: { id: true, name: true } } },
    })

    const conversationContext: Array<{ role: 'user' | 'assistant'; content: string }> = lastMessages
      .reverse()
      .map((m) => ({
        role: (m.sender.id === dbUser.id ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content || '',
      }))
      .filter((m) => m.content && m.content.trim().length > 0)

    const systemPrompt = `You generate smart short reply suggestions for a messaging app. 
Understand the ongoing conversation and provide ${numSuggestions} diverse, context-appropriate replies. 
Styles should vary (concise, friendly, professional). Avoid repeating the last message. Respond ONLY as JSON like: { "suggestions": string[] }.`

    const response = await fetch(provider.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          ...conversationContext,
          { role: 'user', content: 'Generate reply suggestions now.' },
        ],
        // Groq may not support strict response_format
      }),
    })

    if (!response.ok) return providerError(response, 'reply')

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content) return NextResponse.json({ error: 'Invalid AI response' }, { status: 502 })

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      const match = content.match(/\{[\s\S]*\}/)
      if (match) {
        try { parsed = JSON.parse(match[0]) } catch {}
      }
      if (!parsed || typeof parsed !== 'object') {
        return NextResponse.json({ error: 'Malformed AI JSON response' }, { status: 502 })
      }
    }

    const obj = parsed as { suggestions?: unknown }
    const suggestions: string[] = Array.isArray(obj?.suggestions)
      ? (obj.suggestions as unknown[]).map((s) => String(s)).filter(Boolean).slice(0, numSuggestions)
      : []

    return NextResponse.json({ suggestions })
  } catch (error) {
    console.error('AI Reply error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


