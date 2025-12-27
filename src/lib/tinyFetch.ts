import { supabaseAnonKey } from '../config'
import { cachedFetch } from './cachedFetch'

export function tinyFetch(input: RequestInfo | URL, init?: RequestInit) {
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

  if (method === 'GET') {
    return cachedFetch(input, nextInit)
  }

  return fetch(input, nextInit)
}
