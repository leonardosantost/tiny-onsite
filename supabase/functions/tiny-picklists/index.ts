import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { supabase } from '../_shared/supabase.ts'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

function makeListCode() {
  const now = Date.now()
  const rand = crypto.randomUUID().slice(0, 6).toUpperCase()
  return `P${now}${rand}`
}

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  if (request.method === 'GET') {
    const url = new URL(request.url)
    const listCode = url.searchParams.get('id')

    if (listCode) {
      const { data, error } = await supabase
        .from('pick_lists')
        .select('id, list_code, cutoff_at, status, orders, created_at, pick_list_items(*)')
        .eq('list_code', listCode)
        .single()

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        })
      }

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const includeItems = url.searchParams.get('include_items') === '1'
    const selectFields = includeItems
      ? 'id, list_code, cutoff_at, status, orders, created_at, pick_list_items(*)'
      : 'id, list_code, cutoff_at, status, orders, created_at'

    const { data, error } = await supabase.from('pick_lists').select(selectFields).order('created_at', {
      ascending: false,
    })

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }

  if (request.method === 'POST') {
    try {
      const payload = await request.json()
      const cutoffAt = payload.cutoff_at ?? null
      const orders = Array.isArray(payload.orders) ? payload.orders : []
      const items = Array.isArray(payload.items) ? payload.items : []

      if (!orders.length) {
        return new Response(JSON.stringify({ error: 'orders is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        })
      }

      const listCode = makeListCode()
      const { data: listRow, error: listError } = await supabase
        .from('pick_lists')
        .insert({
          list_code: listCode,
          cutoff_at: cutoffAt,
          orders,
        })
        .select('id, list_code, cutoff_at, status, orders, created_at')
        .single()

      if (listError || !listRow) {
        return new Response(JSON.stringify({ error: listError?.message ?? 'Failed to create list' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        })
      }

      const rows = items.map((item: any) => ({
        pick_list_id: listRow.id,
        order_id: String(item.order_id ?? ''),
        item_id: item.item_id ?? null,
        title: item.title ?? null,
        sku: item.sku ?? null,
        quantity: item.quantity ?? 0,
        shipment_id: item.shipment_id ?? null,
      }))

      if (rows.length) {
        const { error: itemsError } = await supabase.from('pick_list_items').insert(rows)
        if (itemsError) {
          return new Response(JSON.stringify({ error: itemsError.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders() },
          })
        }
      }

      return new Response(JSON.stringify(listRow), {
        status: 201,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }
  }

  if (request.method === 'PATCH') {
    try {
      const payload = await request.json()
      const listCode = payload.list_code
      const itemId = payload.item_id
      const packedAt = payload.packed_at ?? new Date().toISOString()

      if (!listCode || !itemId) {
        return new Response(JSON.stringify({ error: 'list_code and item_id are required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        })
      }

      const { data: listRow, error: listError } = await supabase
        .from('pick_lists')
        .select('id')
        .eq('list_code', listCode)
        .single()

      if (listError || !listRow) {
        return new Response(JSON.stringify({ error: listError?.message ?? 'List not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        })
      }

      const { error: updateError } = await supabase
        .from('pick_list_items')
        .update({ packed_at: packedAt })
        .eq('pick_list_id', listRow.id)
        .eq('id', itemId)

      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        })
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  })
})
