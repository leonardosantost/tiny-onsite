import { supabase } from './supabase.ts'

const mlClientId = Deno.env.get('ML_CLIENT_ID')
const mlClientSecret = Deno.env.get('ML_CLIENT_SECRET')
const mlRedirectUri = Deno.env.get('ML_REDIRECT_URI')

if (!mlClientId || !mlClientSecret || !mlRedirectUri) {
  throw new Error('ML_CLIENT_ID, ML_CLIENT_SECRET, and ML_REDIRECT_URI are required')
}

export type MlTokenRow = {
  account_id: string
  user_id: number | null
  marketplace: string
  access_token: string
  refresh_token: string
  expires_at: string
}

export async function getToken(accountId: string) {
  const { data, error } = await supabase
    .from('ml_tokens')
    .select('account_id, user_id, marketplace, access_token, refresh_token, expires_at')
    .eq('account_id', accountId)
    .single()

  if (error) {
    return { data: null, error }
  }

  return { data: data as MlTokenRow, error: null }
}

export function isExpired(expiresAt: string) {
  const expires = new Date(expiresAt).getTime()
  const bufferMs = 60 * 1000
  return Date.now() + bufferMs >= expires
}

export async function refreshToken(refreshTokenValue: string) {
  const payload = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: mlClientId,
    client_secret: mlClientSecret,
    refresh_token: refreshTokenValue,
  })

  const response = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: payload,
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Failed to refresh token: ${message}`)
  }

  return response.json()
}

export async function exchangeCodeForToken(code: string) {
  const payload = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: mlClientId,
    client_secret: mlClientSecret,
    code,
    redirect_uri: mlRedirectUri,
  })

  const response = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: payload,
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Failed to exchange code: ${message}`)
  }

  return response.json()
}

export async function upsertToken(accountId: string, payload: {
  access_token: string
  refresh_token: string
  expires_in: number
  user_id?: number
  marketplace?: string
}) {
  const expiresAt = new Date(Date.now() + payload.expires_in * 1000).toISOString()

  const { error } = await supabase
    .from('ml_tokens')
    .upsert(
      {
        account_id: accountId,
        user_id: payload.user_id ?? null,
        marketplace: payload.marketplace ?? 'MLB',
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
        expires_at: expiresAt,
      },
      { onConflict: 'account_id' },
    )

  if (error) {
    throw error
  }

  return expiresAt
}

export function buildAuthUrl(accountId?: string) {
  const url = new URL('https://auth.mercadolivre.com.br/authorization')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', mlClientId)
  url.searchParams.set('redirect_uri', mlRedirectUri)
  if (accountId) {
    url.searchParams.set('state', accountId)
  }
  return url.toString()
}
