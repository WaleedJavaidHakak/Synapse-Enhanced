import { NextRequest, NextResponse } from 'next/server'
import { aiNotConfigured, providerError } from '@/lib/ai'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { getChatAccess } from '@/lib/realtime'

type AssistRequestBody = {
  text: string
  conversationId?: string
  numVariants?: number
}

type ProviderConfig = {
  name: 'openai' | 'groq'
  baseUrl: string
  apiKey: string
  model: string
  supportsJsonMode: boolean
}

function resolveProvider(): ProviderConfig | null {
  const providerEnv = (process.env.AI_PROVIDER || '').toLowerCase()

  // Prefer explicit provider if set
  if (providerEnv === 'groq' && process.env.GROQ_API_KEY) {
    return {
      name: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
      apiKey: process.env.GROQ_API_KEY!,
      model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
      supportsJsonMode: false,
    }
  }
  if (providerEnv === 'openai' && process.env.OPENAI_API_KEY) {
    return {
      name: 'openai',
      baseUrl: 'https://api.openai.com/v1/chat/completions',
      apiKey: process.env.OPENAI_API_KEY!,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      supportsJsonMode: true,
    }
  }

  // Auto-detect if not explicitly set
  if (process.env.OPENAI_API_KEY) {
    return {
      name: 'openai',
      baseUrl: 'https://api.openai.com/v1/chat/completions',
      apiKey: process.env.OPENAI_API_KEY!,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      supportsJsonMode: true,
    }
  }
  if (process.env.GROQ_API_KEY) {
    return {
      name: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
      apiKey: process.env.GROQ_API_KEY!,
      model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
      supportsJsonMode: false,
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

    const body = (await req.json()) as AssistRequestBody
    const { text, conversationId, numVariants = 3 } = body || {}

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    let conversationContext: Array<{ role: 'user' | 'assistant'; content: string }> = []
    if (conversationId) {
      // Verify access and load last N messages for context
      const dbUser = await prisma.user.findUnique({ where: { clerkId: user.id }, select: { id: true } })
      if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

      // The id may be a 1:1 chat or a group
      const access = await getChatAccess(conversationId, dbUser.id)
      if (!access) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

      const lastMessages = await prisma.message.findMany({
        where: { ...(access === 'GROUP' ? { groupId: conversationId } : { conversationId }), isDeleted: false, type: 'TEXT' },
        orderBy: { createdAt: 'desc' },
        take: 12,
        include: { sender: { select: { id: true } } },
      })

      conversationContext = lastMessages
        .reverse()
        .map((m) => ({
          role: (m.sender.id === dbUser.id ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.content || '',
        }))
        .filter((m) => m.content && m.content.trim().length > 0)
    }

    // Build prompt instructing the model to infer intent and produce variants
    const systemPrompt = `You help users compose and improve chat messages. 
Infer the user's intent and conversation tone from the provided context (if any). 
Return between 2 and ${numVariants} refined variants of the user's draft that:
- Fit the ongoing conversation
- Are clear, concise, and appropriate
- Cover different tones/lengths (e.g., friendly, formal, concise)
Respond ONLY as JSON with the shape: { "intent": string, "variants": Array<{ "label": string, "text": string }> }.`

    const userPrompt = `Draft from user: """${text}"""
Context (may be empty): ${
      conversationContext.length
        ? conversationContext
            .map((m) => `${m.role === 'user' ? 'User' : 'Other'}: ${m.content}`)
            .join('\n')
        : 'No prior messages.'
    }`

    // Call OpenAI Chat Completions API directly via fetch to avoid extra deps
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
          ...conversationContext.map((m) => ({ role: m.role, content: m.content })),
          { role: 'user', content: userPrompt },
        ],
        ...(provider.supportsJsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    })

    if (!response.ok) return providerError(response, 'assist')

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content) {
      return NextResponse.json({ error: 'Invalid AI response' }, { status: 502 })
    }

    // Validate JSON shape
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      // Some providers may not honor strict JSON mode; try to salvage a JSON object from the text
      const match = content.match(/\{[\s\S]*\}/)
      if (match) {
        try { parsed = JSON.parse(match[0]) } catch {}
      }
      if (!parsed || typeof parsed !== 'object') {
        return NextResponse.json({ error: 'Malformed AI JSON response' }, { status: 502 })
      }
    }

    const obj = parsed as { intent?: unknown; variants?: unknown }
    const list = Array.isArray(obj.variants) ? obj.variants : []
    const variants = list.slice(0, numVariants).map((v: any, idx: number) => ({
      label: typeof v?.label === 'string' && v.label.trim() ? v.label : `Variant ${idx + 1}`,
      text: String(v?.text ?? '').trim(),
    }))

    const intent = typeof obj.intent === 'string' ? obj.intent : 'general'

    return NextResponse.json({ intent, variants })
  } catch (error) {
    console.error('AI Assist error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


