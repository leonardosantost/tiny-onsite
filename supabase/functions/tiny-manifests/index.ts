import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { supabase } from '../_shared/supabase.ts'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  const url = new URL(request.url)
  const manifestId = url.searchParams.get('id')
  const includeItems = url.searchParams.get('include_items') === '1'

  if (request.method === 'GET') {
    if (manifestId) {
      const { data: manifest, error } = await supabase
        .from('manifests')
        .select('*')
        .eq('id', manifestId)
        .maybeSingle()

      if (error || !manifest) {
        return new Response(JSON.stringify({ error: error?.message ?? 'Manifesto não encontrado' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        })
      }

      if (includeItems) {
        const { data: items } = await supabase
          .from('manifest_items')
          .select('*')
          .eq('manifest_id', manifestId)
          .order('created_at', { ascending: true })
        return new Response(JSON.stringify({ ...manifest, manifest_items: items ?? [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        })
      }

      return new Response(JSON.stringify(manifest), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    if (includeItems) {
      const { data: manifests, error } = await supabase.from('manifests').select('*').order('created_at', {
        ascending: false,
      })

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        })
      }

      const ids = (manifests ?? []).map((manifest) => manifest.id)
      const { data: items } =
        ids.length > 0
          ? await supabase.from('manifest_items').select('*').in('manifest_id', ids)
          : { data: [] }

      const itemsByManifest = new Map<string, any[]>()
      for (const item of items ?? []) {
        const list = itemsByManifest.get(item.manifest_id) ?? []
        list.push(item)
        itemsByManifest.set(item.manifest_id, list)
      }

      const enriched = (manifests ?? []).map((manifest) => ({
        ...manifest,
        manifest_items: itemsByManifest.get(manifest.id) ?? [],
      }))

      return new Response(JSON.stringify(enriched), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const { data, error } = await supabase.from('manifests').select('*').order('created_at', {
      ascending: false,
    })
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    return new Response(JSON.stringify(data ?? []), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }

  if (request.method === 'POST') {
    const payload = await request.json()
    const orders = Array.isArray(payload?.orders) ? payload.orders : []

    const { data: manifest, error } = await supabase
      .from('manifests')
      .insert({
        logistic_type: payload?.logistic_type ?? null,
        carrier_name: payload?.carrier_name ?? null,
        cutoff_at: payload?.cutoff_at ?? null,
        status: 'manifestado',
      })
      .select('*')
      .single()

    if (error || !manifest) {
      return new Response(JSON.stringify({ error: error?.message ?? 'Falha ao criar manifesto' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const items = orders.flatMap((order: any) => {
      const packId = order?.pack_id ?? ''
      const orderId = order?.order_id ?? ''
      const buyerName = order?.buyer_name ?? ''
      const orderItems = Array.isArray(order?.items) ? order.items : []
      return orderItems.map((item: any) => ({
        manifest_id: manifest.id,
        pack_id: packId,
        order_id: orderId,
        buyer_name: buyerName,
        item_id: item?.item_id ?? null,
        title: item?.title ?? null,
        sku: item?.sku ?? null,
        quantity: item?.quantity ?? 0,
        color: item?.color ?? null,
        fabric_design: item?.fabric_design ?? null,
      }))
    })

    if (items.length) {
      const { error: itemsError } = await supabase.from('manifest_items').insert(items)
      if (itemsError) {
        return new Response(JSON.stringify({ error: itemsError.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        })
      }
    }

    return new Response(JSON.stringify(manifest), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  })
})
