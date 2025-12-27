import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { ensureAccessToken, tinyApiBaseUrl } from '../_shared/tiny.ts'
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

async function updateTinyStock(accessToken: string, productId: number, type: 'E' | 'S', quantity: number) {
  const response = await fetch(`${tinyApiBaseUrl}/estoque/${productId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tipo: type,
      quantidade: quantity,
      data: new Date().toISOString(),
    }),
  })
  const bodyText = await response.text()
  if (!response.ok) {
    throw new Error(bodyText || `Tiny stock update failed (${response.status})`)
  }
  return JSON.parse(bodyText)
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
    const action = payload.action
    const fromBin = payload.from_bin ?? null
    const toBin = payload.to_bin ?? null
    const note = payload.note ?? null

    if (!sku || !action || !Number.isFinite(quantity) || quantity <= 0) {
      return new Response(JSON.stringify({ error: 'sku, action and quantity are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const accessToken = await ensureAccessToken(accountId)
    const search = await tinyGet(accessToken, '/produtos', { codigo: sku })
    const list = Array.isArray(search?.itens) ? search.itens : []
    if (!list.length || !list[0]?.id) {
      return new Response(JSON.stringify({ error: 'SKU not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const productId = Number(list[0].id)

    if (['excluir', 'danos', 'perda'].includes(action)) {
      await updateTinyStock(accessToken, productId, 'S', Math.abs(quantity))
    }

    const updateBinQuantity = async (bin: string, delta: number) => {
      const { data: existingBin, error: existingError } = await supabase
        .from('inventory_bins')
        .select('id, quantity')
        .eq('sku', sku)
        .eq('bin', bin)
        .maybeSingle()

      if (existingError) {
        throw new Error(existingError.message)
      }

      const updatedQty = Math.max(0, (existingBin?.quantity ?? 0) + delta)

      const { error: saveError } = existingBin
        ? await supabase
            .from('inventory_bins')
            .update({ quantity: updatedQty, item_id: String(productId) })
            .eq('id', existingBin.id)
        : await supabase.from('inventory_bins').insert({
            sku,
            bin,
            quantity: updatedQty,
            item_id: String(productId),
          })

      if (saveError) {
        throw new Error(saveError.message)
      }
    }

    if (action === 'mover') {
      if (!fromBin || !toBin) {
        return new Response(JSON.stringify({ error: 'from_bin and to_bin are required for mover' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        })
      }
      await updateBinQuantity(fromBin, -Math.abs(quantity))
      await updateBinQuantity(toBin, Math.abs(quantity))
    } else {
      const targetBin = fromBin || toBin || 'Sem bin'
      await updateBinQuantity(targetBin, -Math.abs(quantity))
    }

    const { error: adjustError } = await supabase.from('inventory_adjustments').insert({
      sku,
      action,
      quantity,
      from_bin: fromBin,
      to_bin: toBin,
      note,
    })

    if (adjustError) {
      return new Response(JSON.stringify({ error: adjustError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    return new Response(
      JSON.stringify({
        sku,
        item_id: String(productId),
        action,
        quantity,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      },
    )
  } catch (error) {
    const e = stringifyError(error)
    console.error('tiny-adjust-stock error', e)
    return new Response(JSON.stringify({ error: e }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }
})
