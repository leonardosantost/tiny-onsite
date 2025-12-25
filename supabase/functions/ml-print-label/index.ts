import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1'
import { getToken, isExpired, refreshToken, upsertToken } from '../_shared/ml.ts'

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
  const accountId = url.searchParams.get('account_id') ?? 'default'
  const shipmentId = url.searchParams.get('shipment_id')

  if (!shipmentId) {
    return new Response(JSON.stringify({ error: 'shipment_id is required' }), {
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

  let accessToken = data.access_token

  try {
    if (isExpired(data.expires_at)) {
      const refreshed = await refreshToken(data.refresh_token)
      await upsertToken(accountId, {
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_in: refreshed.expires_in,
        user_id: refreshed.user_id ?? data.user_id ?? undefined,
        marketplace: data.marketplace,
      })
      accessToken = refreshed.access_token
    }
  } catch (refreshError) {
    return new Response(JSON.stringify({ error: String(refreshError) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }

  const labelUrl = new URL('https://api.mercadolibre.com/shipment_labels')
  labelUrl.searchParams.set('shipment_ids', shipmentId)
  labelUrl.searchParams.set('response_type', 'pdf')
  labelUrl.searchParams.set('access_token', accessToken)

  const response = await fetch(labelUrl.toString())
  if (!response.ok) {
    const message = await response.text()
    return new Response(message, {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }

  const buffer = await response.arrayBuffer()
  let outputBuffer: ArrayBuffer = buffer

  try {
    const sourcePdf = await PDFDocument.load(buffer)
    const totalPages = sourcePdf.getPageCount()
    if (totalPages > 2) {
      const trimmedPdf = await PDFDocument.create()
      const pagesToCopy = await trimmedPdf.copyPages(sourcePdf, [0, 1])
      pagesToCopy.forEach((page) => trimmedPdf.addPage(page))
      const trimmedBytes = await trimmedPdf.save()
      outputBuffer = trimmedBytes.buffer
    }
  } catch {
    outputBuffer = buffer
  }

  return new Response(outputBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="shipment-${shipmentId}.pdf"`,
      ...corsHeaders(),
    },
  })
})
