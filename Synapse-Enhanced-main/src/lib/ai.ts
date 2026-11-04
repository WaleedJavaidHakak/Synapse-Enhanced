import { NextResponse } from 'next/server'

// A function, not a shared object: a Response body can only be sent once
export const aiNotConfigured = () => NextResponse.json(
  { error: 'AI isn\'t set up on this server yet. The admin needs to add a GROQ_API_KEY (or OPENAI_API_KEY).', code: 'AI_NOT_CONFIGURED' },
  { status: 503 }
)

/** Turn a failed provider response into a message people can act on; details stay in the server log. */
export async function providerError(response: Response, route: string) {
  const details = await response.text().catch(() => '')
  console.error(`AI provider error (${route}) ${response.status}: ${details.slice(0, 500)}`)
  if (response.status === 401 || response.status === 403) {
    return NextResponse.json(
      { error: 'The AI key on this server is invalid or expired. The admin needs to set a new GROQ_API_KEY.', code: 'AI_KEY_INVALID' },
      { status: 503 }
    )
  }
  if (response.status === 429) {
    return NextResponse.json({ error: 'The AI is busy right now. Try again in a minute.', code: 'AI_RATE_LIMITED' }, { status: 503 })
  }
  if (response.status === 404 || response.status === 400) {
    return NextResponse.json(
      { error: 'The configured AI model isn\'t available. The admin should check GROQ_MODEL / OPENAI_MODEL.', code: 'AI_MODEL_ERROR' },
      { status: 503 }
    )
  }
  return NextResponse.json({ error: 'The AI service had a problem. Try again shortly.', code: 'AI_PROVIDER_ERROR' }, { status: 502 })
}
