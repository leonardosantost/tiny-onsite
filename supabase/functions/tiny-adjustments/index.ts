import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { supabase } from '../_shared/supabase.ts'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  const url = new URL(request.url)
  const sku = url.searchParams.get('sku')

  let query = supabase
    .from('inventory_adjustments')
    .select('id, sku, action, quantity, from_bin, to_bin, note, created_at')
    .order('created_at', { ascending: false })

  if (sku) {
    query = query.eq('sku', sku)
  }

  const { data, error } = await query

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
})
