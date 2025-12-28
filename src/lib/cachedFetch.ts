type CacheEntry = {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
}

const responseCache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<CacheEntry>>()

function normalizeHeaders(headers?: HeadersInit) {
  if (!headers) return {}
  const normalized: Record<string, string> = {}
  if (headers instanceof Headers) {
    for (const [key, value] of headers.entries()) {
      normalized[key.toLowerCase()] = value
    }
    return normalized
  }

  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      if (key) {
        normalized[String(key).toLowerCase()] = String(value)
      }
    }
    return normalized
  }

  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      normalized[key.toLowerCase()] = value.join(',')
    } else if (value != null) {
      normalized[key.toLowerCase()] = String(value)
    }
  }
  return normalized
}

function getCacheKey(input: RequestInfo | URL, init?: RequestInit) {
  const request = input instanceof Request ? input : null
  const url = request ? request.url : input.toString()
  const method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
  const headers = normalizeHeaders(init?.headers ?? request?.headers)
  const body =
    typeof init?.body === 'string'
      ? init.body
      : init?.body instanceof URLSearchParams
        ? init.body.toString()
        : undefined

  return JSON.stringify({ url, method, headers, body })
}

function entryToResponse(entry: CacheEntry) {
  return new Response(entry.body, {
    status: entry.status,
    statusText: entry.statusText,
    headers: entry.headers,
  })
}

export async function cachedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  const cacheMode = init?.cache

  if (method !== 'GET' || cacheMode === 'no-store' || cacheMode === 'reload') {
    return fetch(input, init)
  }

  if (init?.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }

  const key = getCacheKey(input, init)
  const cached = responseCache.get(key)
  if (cached) {
    return entryToResponse(cached)
  }

  // Avoid sharing in-flight requests when a caller uses AbortController.
  if (init?.signal) {
    const response = await fetch(input, init)
    const body = await response.text()
    const headers: Record<string, string> = {}
    response.headers.forEach((value, name) => {
      headers[name] = value
    })
    const entry: CacheEntry = {
      status: response.status,
      statusText: response.statusText,
      headers,
      body,
    }
    if (response.ok) {
      responseCache.set(key, entry)
    }
    return entryToResponse(entry)
  }

  const existing = inFlight.get(key)
  if (existing) {
    const entry = await existing
    return entryToResponse(entry)
  }

  const fetchPromise = (async () => {
    const response = await fetch(input, init)
    const body = await response.text()
    const headers: Record<string, string> = {}
    response.headers.forEach((value, name) => {
      headers[name] = value
    })
    const entry: CacheEntry = {
      status: response.status,
      statusText: response.statusText,
      headers,
      body,
    }
    if (response.ok) {
      responseCache.set(key, entry)
    }
    inFlight.delete(key)
    return entry
  })().catch((error) => {
    inFlight.delete(key)
    throw error
  })

  inFlight.set(key, fetchPromise)
  const entry = await fetchPromise
  return entryToResponse(entry)
}
