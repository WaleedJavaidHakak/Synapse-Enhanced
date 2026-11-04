import { NextRequest, NextResponse } from 'next/server'
import { aiNotConfigured, providerError } from '@/lib/ai'
import { auth } from '@clerk/nextjs/server'

type TranslateRequestBody = {
  text: string
  targetLanguage: string
  sourceLanguage?: string
}

type ProviderConfig = {
  name: 'openai' | 'groq'
  baseUrl: string
  apiKey: string
  model: string
  supportsJsonMode?: boolean
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
      supportsJsonMode: true,
    }
  }
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
    if (!provider) return aiNotConfigured()

    const body = (await req.json()) as TranslateRequestBody
    const { text, targetLanguage, sourceLanguage } = body || {}
    if (!text || !targetLanguage) {
      return NextResponse.json({ error: 'text and targetLanguage are required' }, { status: 400 })
    }

    const system = `You are a professional translator. Strictly translate the user's message into the target language.
Preserve meaning, names, numbers, and formatting. Do not add commentary. If the message contains code, keep code intact.
Return only the translated text.`

    const userMsg = `Target language: ${targetLanguage}
${sourceLanguage ? `Source language (hint): ${sourceLanguage}
` : ''}Text:
"""
${text}
"""`

    const response = await fetch(provider.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMsg },
        ],
      }),
    })

    if (!response.ok) return providerError(response, 'translate')

    const data = await response.json()
    let translated: string = data?.choices?.[0]?.message?.content ?? ''
    const sanitizeTranslated = (text: string): string => {
      let t = String(text ?? '').trim()
      // If fenced code block, take inner content
      const fenced = t.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/)
      if (fenced) t = fenced[1].trim()
      // Strip leading markdown quotes
      t = t.replace(/^>\s*/gm, '')
      // Strip common labels
      t = t.replace(/^(translated(?: text)?|translation|note|target language|source language)\s*[:\-]\s*/gim, '')
      // Remove surrounding quotes/backticks
      t = t.replace(/^["'`]+|["'`]+$/g, '')
      // Filter out lines that are label/comment-like
      const cleaned = t
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !/^(translated(?: text)?|translation|note|target language|source language)\s*[:\-]/i.test(l))
        .join('\n')
      return cleaned.trim()
    }
    translated = sanitizeTranslated(translated)
    if (!translated) return NextResponse.json({ error: 'Invalid AI response' }, { status: 502 })
    return NextResponse.json({ translated })
  } catch (e) {
    console.error('AI Translate error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


