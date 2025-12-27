import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { ensureAccessToken, tinyApiBaseUrl } from '../_shared/tiny.ts'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

function safeJsonParse(bodyText: string) {
  try {
    return JSON.parse(bodyText)
  } catch {
    return null
  }
}

function isPaidStatus(status?: number | null) {
  return [3, 4, 1, 7, 5, 6].includes(Number(status))
}

function isShippedStatus(status?: number | null) {
  return [5, 6].includes(Number(status))
}

function mapShippingStatus(status?: number | null) {
  if (isShippedStatus(status)) return 'shipped'
  if ([4, 7, 1].includes(Number(status))) return 'handling'
  return 'ready_to_print'
}

function mapOrder(detail: any, listItem?: any) {
  const base = detail ?? listItem ?? {}
  const id = base?.id != null ? String(base.id) : ''
  const situacao = base?.situacao ?? listItem?.situacao ?? null
  const orderDate = base?.data ?? listItem?.dataCriacao ?? null
  const expectedDate = base?.dataEntrega ?? base?.dataPrevista ?? listItem?.dataPrevista ?? null
  const customerName = base?.cliente?.nome ?? listItem?.cliente?.nome ?? '-'
  const carrierName = base?.transportador?.nome ?? listItem?.transportador?.nome ?? 'outro'

  const orderItems = Array.isArray(base?.itens)
    ? base.itens.map((item: any) => ({
        quantity: item?.quantidade ?? 0,
        item: {
          id: item?.produto?.id ?? null,
          title: item?.produto?.descricao ?? '-',
          seller_sku: item?.produto?.sku ?? null,
          variation_attributes: [],
        },
      }))
    : []

  return {
    id: id || undefined,
    pack_id: id || undefined,
    date_created: orderDate,
    status: isPaidStatus(situacao) ? 'paid' : 'pending',
    payments: [],
    buyer: { nickname: customerName },
    order_items: orderItems,
    shipping_details: {
      id: id || undefined,
      status: mapShippingStatus(situacao),
      logistic_type: carrierName || 'outro',
    },
    shipping: {
      id: id || undefined,
      status: mapShippingStatus(situacao),
      logistic_type: carrierName || 'outro',
    },
    shipping_sla: expectedDate ? { expected_date: expectedDate } : null,
  }
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
  return safeJsonParse(bodyText) ?? {}
}

serve(async (request) => {
  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      })
    }

    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const url = new URL(request.url)
    const accountId = url.searchParams.get('account_id') ?? 'default'
    const orderId =
      url.searchParams.get('order_id') ||
      url.searchParams.get('orderId') ||
      url.searchParams.get('id') ||
      url.searchParams.get('pack_id') ||
      url.searchParams.get('packId')
    const includeDetails = url.searchParams.get('details') === '1'

    const accessToken = await ensureAccessToken(accountId)

    if (orderId) {
      const detail = await tinyGet(accessToken, `/pedidos/${orderId}`)
      return new Response(JSON.stringify(mapOrder(detail)), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const list = await tinyGet(accessToken, '/pedidos', {
      offset: url.searchParams.get('offset') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      dataInicial: url.searchParams.get('date_created.from') ?? undefined,
      dataFinal: url.searchParams.get('date_created.to') ?? undefined,
      numero: url.searchParams.get('numero') ?? undefined,
    })

    const items = Array.isArray(list?.itens) ? list.itens : []

    if (!includeDetails) {
      return new Response(
        JSON.stringify({
          results: items.map((entry: any) => mapOrder(null, entry)),
          paging: list?.paginacao ?? null,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        },
      )
    }

    const detailed = await Promise.all(
      items.map(async (entry: any) => {
        if (!entry?.id) return mapOrder(null, entry)
        try {
          const detail = await tinyGet(accessToken, `/pedidos/${entry.id}`)
          return mapOrder(detail, entry)
        } catch {
          return mapOrder(null, entry)
        }
      }),
    )

    return new Response(
      JSON.stringify({
        results: detailed,
        paging: list?.paginacao ?? null,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      },
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }
})
