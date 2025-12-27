import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { ensureAccessToken, tinyApiBaseUrl } from '../_shared/tiny.ts'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

type TinyProductListItem = {
  id?: number
  sku?: string
  codigo?: string
  descricao?: string
  nome?: string
  unidade?: string
  gtin?: string
  tipoVariacao?: string
  estoque?: { quantidade?: number }
  anexos?: { url?: string }[]
}

type TinyProductDetail = TinyProductListItem & {
  estoque?: {
    quantidade?: number
    localizacao?: string | null
  }
}

type TinyStockDepot = {
  id?: number
  nome?: string
  desconsiderar?: boolean
  saldo?: number
  reservado?: number
  disponivel?: number
}

type TinyStockResponse = {
  id?: number
  nome?: string
  codigo?: string
  unidade?: string
  saldo?: number
  reservado?: number
  disponivel?: number
  depositos?: TinyStockDepot[]
}

function mapProductToLegacy(product: TinyProductDetail) {
  const id = product?.id != null ? String(product.id) : ''
  const sku = product?.sku ?? null
  const title = product?.descricao ?? (id ? `Produto ${id}` : 'Produto')
  const thumb = product?.anexos?.find((item) => item?.url)?.url ?? null
  const quantity = Number(product?.estoque?.quantidade ?? 0)
  const attributes = []
  if (sku) {
    attributes.push({ id: 'SELLER_SKU', value_name: sku })
  }
  if (product?.gtin) {
    attributes.push({ id: 'GTIN', value_name: product.gtin })
  }

  return {
    id: id || undefined,
    title,
    seller_sku: sku,
    seller_custom_field: sku,
    inventory_id: id || undefined,
    user_product_id: id || undefined,
    available_quantity: Number.isFinite(quantity) ? quantity : 0,
    thumbnail: thumb,
    pictures: thumb ? [{ url: thumb, secure_url: thumb }] : [],
    attributes,
  }
}

function mapProductToList(product: TinyProductListItem) {
  return {
    id: product?.id != null ? String(product.id) : null,
    codigo: product?.codigo ?? product?.sku ?? null,
    sku: product?.sku ?? null,
    nome: product?.descricao ?? product?.nome ?? null,
    unidade: product?.unidade ?? null,
    gtin: product?.gtin ?? null,
    variacao: product?.tipoVariacao ?? null,
  }
}

function mapProductToInventory(product: TinyProductListItem, stock?: TinyStockResponse | null) {
  const depositos = Array.isArray(stock?.depositos) ? stock?.depositos : []
  const availableDepots = depositos.filter((deposito) => Number(deposito?.disponivel ?? 0) > 0)
  const preferredDepot = availableDepots[0] ?? depositos[0] ?? null
  const localizacao = preferredDepot?.nome ?? null

  return {
    id: product?.id != null ? String(product.id) : null,
    titulo: product?.descricao ?? null,
    sku: product?.sku ?? null,
    gtin: product?.gtin ?? null,
    localizacao,
    quantidade: Number(stock?.disponivel ?? 0),
    depositos: depositos.map((deposito) => ({
      id: deposito?.id ?? null,
      nome: deposito?.nome ?? null,
      desconsiderar: Boolean(deposito?.desconsiderar),
      saldo: Number(deposito?.saldo ?? 0),
      reservado: Number(deposito?.reservado ?? 0),
      disponivel: Number(deposito?.disponivel ?? 0),
    })),
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

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let index = 0
  let active = 0

  return new Promise((resolve, reject) => {
    const next = () => {
      if (index >= items.length && active === 0) {
        resolve(results)
        return
      }

      while (active < limit && index < items.length) {
        const currentIndex = index++
        active += 1
        mapper(items[currentIndex])
          .then((value) => {
            results[currentIndex] = value
            active -= 1
            next()
          })
          .catch(reject)
      }
    }

    next()
  })
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
    const includeDetails = url.searchParams.get('details') === '1'
    const productId =
      url.searchParams.get('id') ?? url.searchParams.get('product_id') ?? url.searchParams.get('produto_id') ?? ''

    const accessToken = await ensureAccessToken(accountId)

    if (productId && mode === 'stock') {
      const stock = await tinyGetWithRetry(accessToken, `/estoque/${productId}`)
      return new Response(JSON.stringify(stock), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    if (productId) {
      const product = await tinyGet(accessToken, `/produtos/${productId}`)
      const stock = await tinyGetWithRetry(accessToken, `/estoque/${productId}`)
      const payload = mode === 'inventory' ? mapProductToInventory(product, stock) : mapProductToLegacy(product)
      return new Response(JSON.stringify(payload), {
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

    const rawItems = Array.isArray(list?.itens)
      ? list.itens
      : Array.isArray(list?.produtos)
        ? list.produtos
        : Array.isArray(list?.retorno?.produtos)
          ? list.retorno.produtos
          : []
    const items = rawItems.map((entry: any) => (entry?.produto ? entry.produto : entry))
    if (mode === 'list') {
      return new Response(
        JSON.stringify({
          results: items.map((entry: TinyProductListItem) => mapProductToList(entry)),
          paging: list?.paginacao ?? list?.retorno?.paginacao ?? null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } },
      )
    }

    if (mode === 'inventory') {
      const detailed = await mapWithConcurrency(items, 2, async (entry: TinyProductListItem) => {
        if (!entry?.id) return mapProductToInventory(entry, null)
        try {
          const stock = await tinyGetWithRetry(accessToken, `/estoque/${entry.id}`)
          return mapProductToInventory(entry, stock)
        } catch {
          return mapProductToInventory(entry, null)
        }
      })

      return new Response(
        JSON.stringify({
          results: detailed,
          paging: list?.paginacao ?? null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } },
      )
    }

    if (!includeDetails || items.length === 0) {
      return new Response(
        JSON.stringify({
          results: items.map((entry: TinyProductListItem) => mapProductToLegacy(entry)),
          paging: list?.paginacao ?? null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } },
      )
    }

    const detailed = await mapWithConcurrency(items, 5, async (entry: TinyProductListItem) => {
      if (!entry?.id) return mapProductToLegacy(entry)
      try {
        const product = await tinyGet(accessToken, `/produtos/${entry.id}`)
        return mapProductToLegacy(product)
      } catch {
        return mapProductToLegacy(entry)
      }
    })

    return new Response(
      JSON.stringify({
        results: detailed,
        paging: list?.paginacao ?? null,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } },
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }
})
