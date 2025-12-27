import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { ensureAccessToken, tinyApiBaseUrl } from '../_shared/tiny.ts'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  return JSON.parse(bodyText)
}

serve(async (request) => {
  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }

    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const url = new URL(request.url)
    const accountId = url.searchParams.get('account_id') ?? 'default'
    const shipmentId = url.searchParams.get('shipment_id')

    if (!shipmentId) {
      return new Response(JSON.stringify({ error: 'shipment_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const accessToken = await ensureAccessToken(accountId)

    let agrupamentoId: string | null = null
    let expedicaoId: string | null = null

    if (shipmentId.includes(':')) {
      const [groupId, expId] = shipmentId.split(':')
      agrupamentoId = groupId || null
      expedicaoId = expId || null
    }

    if (!agrupamentoId || !expedicaoId) {
      let offset = 0
      const limit = 100
      let total = 0

      do {
        const list = await tinyGet(accessToken, '/expedicao', {
          limit: String(limit),
          offset: String(offset),
        })
        const agrupamentos = Array.isArray(list?.itens) ? list.itens : []
        total = Number(list?.paginacao?.total ?? total)

        for (const agrupamento of agrupamentos) {
          if (!agrupamento?.id) continue
          const detail = await tinyGet(accessToken, `/expedicao/${agrupamento.id}`)
          const expedicoes = Array.isArray(detail?.expedicoes) ? detail.expedicoes : []
          const match = expedicoes.find((exp: any) => String(exp?.venda?.id ?? '') === shipmentId)
          if (match?.id) {
            agrupamentoId = String(agrupamento.id)
            expedicaoId = String(match.id)
            break
          }
        }

        if (agrupamentoId && expedicaoId) break
        offset += limit
      } while (offset < total)
    }

    if (!agrupamentoId || !expedicaoId) {
      return new Response(JSON.stringify({ error: 'Etiqueta não encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const labels = await tinyGet(
      accessToken,
      `/expedicao/${agrupamentoId}/expedicao/${expedicaoId}/etiquetas`,
    )

    return new Response(JSON.stringify(labels), {
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
