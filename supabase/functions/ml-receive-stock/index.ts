import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { getToken, isExpired, refreshToken, upsertToken } from '../_shared/ml.ts'
import { supabase } from '../_shared/supabase.ts'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const payload = await request.json()
    const accountId = payload.account_id ?? 'default'
    const sku = payload.sku
    const quantity = Number(payload.quantity ?? 0)
    const bin = payload.bin

    if (!sku || !bin || !Number.isFinite(quantity) || quantity <= 0) {
      return new Response(JSON.stringify({ error: 'sku, bin and quantity are required' }), {
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

    const itemId = ids[0]
    const detailUrl = new URL(`https://api.mercadolibre.com/items/${itemId}`)
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
    const currentAvailable = detailBody?.available_quantity ?? 0
    const newAvailable = currentAvailable + quantity

    const updateResponse = await fetch(detailUrl.toString(), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ available_quantity: newAvailable }),
    })

    if (!updateResponse.ok) {
      const updateText = await updateResponse.text()
      return new Response(updateText, {
        status: updateResponse.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const { data: existingBin, error: existingError } = await supabase
      .from('inventory_bins')
      .select('id, quantity')
      .eq('sku', sku)
      .eq('bin', bin)
      .maybeSingle()

    if (existingError) {
      return new Response(JSON.stringify({ error: existingError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const updatedQty = (existingBin?.quantity ?? 0) + quantity

    const { error: saveError } = existingBin
      ? await supabase.from('inventory_bins').update({ quantity: updatedQty, item_id: itemId }).eq('id', existingBin.id)
      : await supabase.from('inventory_bins').insert({
          sku,
          bin,
          quantity,
          item_id: itemId,
        })

    if (saveError) {
      return new Response(JSON.stringify({ error: saveError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    return new Response(
      JSON.stringify({
        sku,
        item_id: itemId,
        previous_available: currentAvailable,
        new_available: newAvailable,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      },
    )
  } catch (error) {
    const e = stringifyError(error)
    console.error('ml-receive-stock error', e)
    return new Response(JSON.stringify({ error: e }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }
})
