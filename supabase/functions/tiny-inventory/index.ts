import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { ensureAccessToken, tinyApiBaseUrl } from '../_shared/tiny.ts'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

function resolveSearchParams(search?: string | null, searchBy?: string | null) {
  const value = search?.trim()
  if (!value) return {}

  const normalized = (searchBy ?? '').toLowerCase()
  if (normalized === 'gtin') return { gtin: value }
  if (normalized === 'sku' || normalized === 'codigo') return { codigo: value }
  if (normalized === 'titulo' || normalized === 'nome' || normalized === 'title') return { nome: value }

  const isNumeric = /^[0-9]+$/.test(value)
  if (isNumeric) {
    return { gtin: value }
  }

  if (value.includes(' ') || value.length > 4) {
    return { nome: value }
  }

  return { codigo: value }
}

async function tinyGet(accessToken: string, path: string, params?: Record<string, string>) {
  const url = new URL(`${tinyApiBaseUrl}${path}`)
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value)
  })
  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  const bodyText = await response.text()
  if (!response.ok) {
    throw new Error(bodyText || `Tiny request failed (${response.status})`)
  }
  return JSON.parse(bodyText)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function tinyGetWithRetry(accessToken: string, path: string, attempts = 3) {
  let lastError: unknown = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(`${tinyApiBaseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
    const bodyText = await response.text()
    if (response.ok) {
      return JSON.parse(bodyText)
    }

    if (response.status === 429 || response.status === 503) {
      const retryAfterHeader = response.headers.get('Retry-After')
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN
      const baseDelay = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : 500 * attempt
      await sleep(baseDelay + Math.floor(Math.random() * 250))
      lastError = bodyText || `Tiny request failed (${response.status})`
      continue
    }

    throw new Error(bodyText || `Tiny request failed (${response.status})`)
  }

  throw new Error(String(lastError ?? 'Tiny request failed'))
}

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }

  try {
    const url = new URL(request.url)
    const accountId = url.searchParams.get('account_id') ?? 'default'
    const mode = url.searchParams.get('mode') ?? 'legacy'
    const search = url.searchParams.get('search')
    const searchBy = url.searchParams.get('search_by')
    const offset = url.searchParams.get('offset') ?? '0'
    const limit = url.searchParams.get('limit') ?? '100'
    const priceListId = url.searchParams.get('price_list_id') ?? url.searchParams.get('lista_preco_id') ?? ''
    const productId =
      url.searchParams.get('id') ?? url.searchParams.get('product_id') ?? url.searchParams.get('produto_id') ?? ''

    const accessToken = await ensureAccessToken(accountId)

    if (mode === 'price-list' && priceListId) {
      const priceList = await tinyGet(accessToken, `/listas-precos/${priceListId}`)
      return new Response(JSON.stringify(priceList), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    if (productId && mode === 'stock') {
      const stock = await tinyGetWithRetry(accessToken, `/estoque/${productId}`)
      return new Response(JSON.stringify(stock), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    if (productId) {
      const product = await tinyGet(accessToken, `/produtos/${productId}`)
      return new Response(JSON.stringify(product), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const searchParams = resolveSearchParams(search, searchBy)
    const list = await tinyGet(accessToken, '/produtos', {
      ...searchParams,
      offset,
      limit,
    })
    return new Response(JSON.stringify(list), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }
})
