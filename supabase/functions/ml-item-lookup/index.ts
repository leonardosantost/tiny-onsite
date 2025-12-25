import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { getToken, isExpired, refreshToken, upsertToken } from '../_shared/ml.ts'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

function stringifyError(err: unknown) {
  if (err instanceof Error) {
    return { message: err.message, name: err.name, stack: err.stack }
  }
  try {
    return { message: JSON.stringify(err) }
  } catch {
    return { message: String(err) }
  }
}

serve(async (request) => {
  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }

    const url = new URL(request.url)
    const accountId = url.searchParams.get('account_id') ?? 'default'
    const sku = url.searchParams.get('sku')

    if (!sku) {
      return new Response(JSON.stringify({ error: 'sku is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const { data, error } = await getToken(accountId)
    if (error || !data) {
      return new Response(JSON.stringify({ error: 'Token not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const tokenRow = Array.isArray(data) ? data[0] : data
    if (!tokenRow?.access_token || !tokenRow?.refresh_token) {
      return new Response(JSON.stringify({ error: 'Invalid token row shape', data }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    let accessToken = tokenRow.access_token
    let userId = tokenRow.user_id

    if (isExpired(tokenRow.expires_at)) {
      const refreshed = await refreshToken(tokenRow.refresh_token)
      if (!refreshed?.access_token || !refreshed?.refresh_token || !refreshed?.expires_in) {
        return new Response(JSON.stringify({ error: 'Refresh returned invalid payload', refreshed }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        })
      }
      await upsertToken(accountId, {
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_in: refreshed.expires_in,
        user_id: refreshed.user_id ?? tokenRow.user_id ?? undefined,
        marketplace: tokenRow.marketplace,
      })
      accessToken = refreshed.access_token
      userId = refreshed.user_id ?? tokenRow.user_id
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Missing user_id in token' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const searchUrl = new URL(`https://api.mercadolibre.com/users/${userId}/items/search`)
    searchUrl.searchParams.set('seller_sku', sku)
    searchUrl.searchParams.set('access_token', accessToken)

    const searchResponse = await fetch(searchUrl.toString())
    const searchText = await searchResponse.text()
    if (!searchResponse.ok) {
      return new Response(searchText, {
        status: searchResponse.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const searchBody = JSON.parse(searchText)
    const ids = Array.isArray(searchBody?.results) ? searchBody.results : []
    if (!ids.length) {
      return new Response(JSON.stringify({ error: 'SKU not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const detailUrl = new URL('https://api.mercadolibre.com/items')
    detailUrl.searchParams.set('ids', ids.join(','))
    detailUrl.searchParams.set('access_token', accessToken)

    const detailResponse = await fetch(detailUrl.toString())
    const detailText = await detailResponse.text()
    if (!detailResponse.ok) {
      return new Response(detailText, {
        status: detailResponse.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const detailBody = JSON.parse(detailText)
    const items = Array.isArray(detailBody)
      ? detailBody.map((entry: any) => entry?.body).filter(Boolean)
      : []

    return new Response(JSON.stringify({ sku, items }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  } catch (error) {
    const e = stringifyError(error)
    console.error('ml-item-lookup error', e)
    return new Response(JSON.stringify({ error: e }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }
})
