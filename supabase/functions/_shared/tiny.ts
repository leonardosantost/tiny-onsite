import { supabase } from './supabase.ts'

const tinyClientId = Deno.env.get('TINY_CLIENT_ID')
const tinyClientSecret = Deno.env.get('TINY_CLIENT_SECRET')
const tinyRedirectUri = Deno.env.get('TINY_REDIRECT_URI')
const tinyScope = Deno.env.get('TINY_SCOPE') || 'openid'

export const tinyApiBaseUrl = Deno.env.get('TINY_API_BASE_URL') || 'https://api.tiny.com.br/public-api/v3'

if (!tinyClientId || !tinyClientSecret || !tinyRedirectUri) {
  throw new Error('TINY_CLIENT_ID, TINY_CLIENT_SECRET, and TINY_REDIRECT_URI are required')
}

export type TinyTokenRow = {
  account_id: string
  access_token: string
  refresh_token: string
  expires_at: string
  scope?: string | null
  token_type?: string | null
}

export async function getToken(accountId: string) {
  const { data, error } = await supabase
    .from('tiny_tokens')
    .select('account_id, access_token, refresh_token, expires_at, scope, token_type')
    .eq('account_id', accountId)
    .single()

  if (error) {
    return { data: null, error }
  }

  return { data: data as TinyTokenRow, error: null }
}

export function isExpired(expiresAt: string) {
  const expires = new Date(expiresAt).getTime()
  const bufferMs = 60 * 1000
  return Date.now() + bufferMs >= expires
}

export async function ensureAccessToken(accountId: string) {
  const { data, error } = await getToken(accountId)
  if (error || !data) {
    throw new Error('Token not found')
  }

  if (!data.access_token || !data.refresh_token) {
    throw new Error('Invalid token row shape')
  }

  if (isExpired(data.expires_at)) {
    const refreshed = await refreshToken(data.refresh_token)
    if (!refreshed?.access_token || !refreshed?.refresh_token || !refreshed?.expires_in) {
      throw new Error('Refresh returned invalid payload')
    }
    await upsertToken(accountId, {
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_in: refreshed.expires_in,
      scope: refreshed.scope,
      token_type: refreshed.token_type,
    })
    return refreshed.access_token as string
  }

  return data.access_token
}

async function postToken(payload: URLSearchParams) {
  const response = await fetch(
    'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: payload,
    },
  )

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Tiny token error: ${message}`)
  }

  return response.json()
}

export async function refreshToken(refreshTokenValue: string) {
  const payload = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: tinyClientId,
    client_secret: tinyClientSecret,
    refresh_token: refreshTokenValue,
  })

  return postToken(payload)
}

export async function exchangeCodeForToken(code: string) {
  const payload = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: tinyClientId,
    client_secret: tinyClientSecret,
    redirect_uri: tinyRedirectUri,
    code,
  })

  return postToken(payload)
}

export async function upsertToken(
  accountId: string,
  payload: {
    access_token: string
    refresh_token: string
    expires_in: number
    scope?: string
    token_type?: string
  },
) {
  const expiresAt = new Date(Date.now() + payload.expires_in * 1000).toISOString()

  const { error } = await supabase
    .from('tiny_tokens')
    .upsert(
      {
        account_id: accountId,
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
        expires_at: expiresAt,
        scope: payload.scope ?? null,
        token_type: payload.token_type ?? null,
      },
      { onConflict: 'account_id' },
    )

  if (error) {
    throw error
  }

  return expiresAt
}

export function buildAuthUrl(accountId?: string) {
  const url = new URL('https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', tinyClientId)
  url.searchParams.set('redirect_uri', tinyRedirectUri)
  url.searchParams.set('scope', tinyScope)
  if (accountId) {
    url.searchParams.set('state', accountId)
  }
  return url.toString()
}
