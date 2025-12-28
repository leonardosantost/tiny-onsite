import { supabaseAnonKey } from '../config'
import { cachedFetch } from './cachedFetch'

const RETRY_STATUS = new Set([429, 500, 503])
const RETRY_ATTEMPTS = 3

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function tinyFetch(input: RequestInfo | URL, init?: RequestInit) {
  const nextInit: RequestInit = { ...init }
  const method = (nextInit.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()

  if (method !== 'GET') {
    const headers = new Headers(init?.headers)
    if (supabaseAnonKey) {
      if (!headers.has('apikey')) headers.set('apikey', supabaseAnonKey)
      if (!headers.has('authorization')) headers.set('authorization', `Bearer ${supabaseAnonKey}`)
    }
    nextInit.headers = headers
  }

  const runOnce = () => {
    if (method === 'GET') {
      return cachedFetch(input, nextInit)
    }
    return fetch(input, nextInit)
  }

  let response: Response | null = null
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    if (nextInit.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    response = await runOnce()
    if (!RETRY_STATUS.has(response.status) || attempt === RETRY_ATTEMPTS) {
      return response
    }
    const backoffMs = 1500 * attempt + Math.floor(Math.random() * 300)
    await sleep(backoffMs)
  }

  return response ?? runOnce()
}
