import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { getToken, isExpired, refreshToken, upsertToken } from '../_shared/ml.ts'

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
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
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  let accessToken = data.access_token
  let userId = data.user_id

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
      userId = refreshed.user_id ?? data.user_id
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  if (!userId) {
    return new Response(JSON.stringify({ error: 'Missing user_id in token' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  const mlUrl = new URL(`https://api.mercadolibre.com/users/${userId}/items/search`)
  mlUrl.searchParams.set('access_token', accessToken)

  const forwardParams = ['search', 'offset', 'limit']
  for (const key of forwardParams) {
    const value = url.searchParams.get(key)
    if (value) {
      mlUrl.searchParams.set(key, value)
    }
  }

  const response = await fetch(mlUrl.toString())
  const bodyText = await response.text()

  if (!response.ok) {
    return new Response(bodyText, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  const body = JSON.parse(bodyText)
  const includeDetails = url.searchParams.get('details') === '1'

  if (includeDetails && Array.isArray(body?.results) && body.results.length > 0) {
    const chunkSize = 20
    const chunks: string[][] = []
    for (let i = 0; i < body.results.length; i += chunkSize) {
      chunks.push(body.results.slice(i, i + chunkSize))
    }

    const detailedItems: any[] = []
    for (const chunk of chunks) {
      const idsParam = chunk.join(',')
      const detailUrl = new URL('https://api.mercadolibre.com/items')
      detailUrl.searchParams.set('ids', idsParam)
      detailUrl.searchParams.set('access_token', accessToken)

      const detailResponse = await fetch(detailUrl.toString())
      if (!detailResponse.ok) {
        const detailBody = await detailResponse.text()
        return new Response(detailBody, {
          status: detailResponse.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        })
      }

      const detailJson = await detailResponse.json()
      if (Array.isArray(detailJson)) {
        for (const entry of detailJson) {
          if (entry?.body) {
            detailedItems.push(entry.body)
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        seller_id: body.seller_id,
        results: detailedItems,
        paging: body.paging,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    )
  }

  return new Response(bodyText, {
    status: response.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
})
