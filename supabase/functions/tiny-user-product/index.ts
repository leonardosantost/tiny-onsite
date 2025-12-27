import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { ensureAccessToken, tinyApiBaseUrl } from '../_shared/tiny.ts'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

type TinyProduct = {
  id?: number
  sku?: string
  descricao?: string
  gtin?: string
  estoque?: { quantidade?: number }
  anexos?: { url?: string }[]
}

function mapProductToItem(product: TinyProduct) {
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

serve(async (request) => {
  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }

    const url = new URL(request.url)
    const accountId = url.searchParams.get('account_id') ?? 'default'
    const userProductId = url.searchParams.get('user_product_id')

    if (!userProductId) {
      return new Response(JSON.stringify({ error: 'user_product_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const accessToken = await ensureAccessToken(accountId)
    const response = await fetch(`${tinyApiBaseUrl}/produtos/${userProductId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
    const bodyText = await response.text()
    if (!response.ok) {
      return new Response(bodyText, {
        status: response.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const product = JSON.parse(bodyText)
    const item = mapProductToItem(product)

    return new Response(JSON.stringify({ items: [item] }), {
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
