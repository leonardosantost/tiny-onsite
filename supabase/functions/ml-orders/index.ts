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

function safeJsonParse(bodyText: string) {
  try {
    return JSON.parse(bodyText)
  } catch {
    return null
  }
}

serve(async (request) => {
  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      })
    }

    const url = new URL(request.url)
    const accountId = url.searchParams.get('account_id') ?? 'default'

    const { data, error } = await getToken(accountId)
    if (error || !data) {
      return new Response(JSON.stringify({ error: 'Token not found' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(),
        },
      })
    }

    const tokenRow = Array.isArray(data) ? data[0] : data
    if (!tokenRow?.access_token || !tokenRow?.refresh_token) {
      return new Response(JSON.stringify({ error: 'Invalid token row shape', data }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(),
        },
      })
    }

    let accessToken = tokenRow.access_token
    let userId = tokenRow.user_id

    try {
      if (isExpired(tokenRow.expires_at)) {
        const refreshed = await refreshToken(tokenRow.refresh_token)
        if (!refreshed?.access_token || !refreshed?.refresh_token || !refreshed?.expires_in) {
          console.error('refresh returned unexpected payload', refreshed)
          return new Response(
            JSON.stringify({ error: 'Refresh returned invalid payload', refreshed }),
            {
              status: 500,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders(),
              },
            },
          )
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
    } catch (error) {
      const e = stringifyError(error)
      console.error('refresh error', e)
      return new Response(JSON.stringify({ error: e }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(),
        },
      })
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Missing user_id in token' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(),
        },
      })
    }

  const orderId =
    url.searchParams.get('order_id') ||
    url.searchParams.get('orderId') ||
    url.searchParams.get('id')
  const packId = url.searchParams.get('pack_id') || url.searchParams.get('packId')
  const includeDetails = url.searchParams.get('details') === '1'
  let response: Response
  let bodyText: string

  if (orderId) {
    const orderUrl = new URL(`https://api.mercadolibre.com/orders/${orderId}`)
    orderUrl.searchParams.set('access_token', accessToken)
    response = await fetch(orderUrl.toString())
    bodyText = await response.text()

    if (!response.ok) {
      return new Response(bodyText, {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(),
        },
      })
    }

    const orderBody = safeJsonParse(bodyText)
    if (!orderBody) {
      return new Response(JSON.stringify({ error: 'Invalid JSON from Mercado Livre' }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(),
        },
      })
    }

    if (includeDetails) {
      const shipmentId = orderBody?.shipping?.id || orderBody?.shipping_details?.id
      if (shipmentId) {
        const shipmentUrl = new URL(`https://api.mercadolibre.com/shipments/${shipmentId}`)
        shipmentUrl.searchParams.set('access_token', accessToken)
        const shipmentResponse = await fetch(shipmentUrl.toString())
        if (shipmentResponse.ok) {
          orderBody.shipping_details = await shipmentResponse.json()
        }

        const slaUrl = new URL(`https://api.mercadolibre.com/shipments/${shipmentId}/sla`)
        slaUrl.searchParams.set('access_token', accessToken)
        const slaResponse = await fetch(slaUrl.toString())
        if (slaResponse.ok) {
          orderBody.shipping_sla = await slaResponse.json()
        }

        const costsUrl = new URL(`https://api.mercadolibre.com/shipments/${shipmentId}/costs`)
        costsUrl.searchParams.set('access_token', accessToken)
        const costsResponse = await fetch(costsUrl.toString())
        if (costsResponse.ok) {
          orderBody.shipping_costs = await costsResponse.json()
        }
      }
    }

    return new Response(JSON.stringify(orderBody), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(),
      },
    })
  }

  if (packId) {
    const searchUrl = new URL('https://api.mercadolibre.com/orders/search')
    searchUrl.searchParams.set('seller', String(userId))
    searchUrl.searchParams.set('pack_id', packId)
    searchUrl.searchParams.set('access_token', accessToken)

    response = await fetch(searchUrl.toString())
    bodyText = await response.text()

    if (!response.ok) {
      return new Response(bodyText, {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(),
        },
      })
    }

    return new Response(bodyText, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(),
      },
    })
  }

  const mlUrl = new URL('https://api.mercadolibre.com/orders/search')
  mlUrl.searchParams.set('seller', String(userId))
  mlUrl.searchParams.set('access_token', accessToken)

  const forwardParams = ['order.status', 'date_created.from', 'date_created.to', 'offset', 'limit']
  for (const key of forwardParams) {
    const value = url.searchParams.get(key)
    if (value) {
      mlUrl.searchParams.set(key, value)
    }
  }

  response = await fetch(mlUrl.toString())
  bodyText = await response.text()

  if (!response.ok) {
    return new Response(bodyText, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(),
      },
    })
  }

  const body = safeJsonParse(bodyText)
  if (!body) {
    return new Response(JSON.stringify({ error: 'Invalid JSON from Mercado Livre' }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(),
      },
    })
  }
  if (includeDetails && Array.isArray(body?.results) && body.results.length > 0) {
    const orders = body.results
    const shipmentIds = orders
      .map((order: any) => order?.shipping?.id || order?.shipping_details?.id)
      .filter((id: any) => typeof id === 'number' || typeof id === 'string')

    const shipmentDetails = new Map<string, any>()
    const shipmentCosts = new Map<string, any>()
    const shipmentSla = new Map<string, any>()
    await Promise.all(
      shipmentIds.map(async (shipmentId: string | number) => {
        const shipmentUrl = new URL(`https://api.mercadolibre.com/shipments/${shipmentId}`)
        shipmentUrl.searchParams.set('access_token', accessToken)

        const shipmentResponse = await fetch(shipmentUrl.toString())
        if (!shipmentResponse.ok) {
          return
        }
        const shipmentBody = await shipmentResponse.json()
        shipmentDetails.set(String(shipmentId), shipmentBody)

        const costsUrl = new URL(`https://api.mercadolibre.com/shipments/${shipmentId}/costs`)
        costsUrl.searchParams.set('access_token', accessToken)
        const costsResponse = await fetch(costsUrl.toString())
        if (!costsResponse.ok) {
          return
        }
        const costsBody = await costsResponse.json()
        shipmentCosts.set(String(shipmentId), costsBody)

        const slaUrl = new URL(`https://api.mercadolibre.com/shipments/${shipmentId}/sla`)
        slaUrl.searchParams.set('access_token', accessToken)
        const slaResponse = await fetch(slaUrl.toString())
        if (!slaResponse.ok) {
          return
        }
        const slaBody = await slaResponse.json()
        shipmentSla.set(String(shipmentId), slaBody)
      }),
    )

    const enriched = orders.map((order: any) => {
      const shipmentId = order?.shipping?.id || order?.shipping_details?.id
      const shipping = shipmentId ? shipmentDetails.get(String(shipmentId)) : null
      const costs = shipmentId ? shipmentCosts.get(String(shipmentId)) : null
      const sla = shipmentId ? shipmentSla.get(String(shipmentId)) : null
      return { ...order, shipping_details: shipping, shipping_costs: costs, shipping_sla: sla }
    })

    return new Response(
      JSON.stringify({
        ...body,
        results: enriched,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(),
        },
      },
    )
  }

  return new Response(bodyText, {
    status: response.status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  })
  } catch (error) {
    const e = stringifyError(error)
    console.error('ml-orders error', e)
    return new Response(JSON.stringify({ error: e }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(),
      },
    })
  }
})
