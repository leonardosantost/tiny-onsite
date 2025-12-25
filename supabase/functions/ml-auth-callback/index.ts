import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { exchangeCodeForToken, upsertToken } from '../_shared/ml.ts'

serve(async (request) => {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const accountId = url.searchParams.get('state') ?? 'default'

  if (!code) {
    return new Response(JSON.stringify({ error: 'Missing code' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const tokenResponse = await exchangeCodeForToken(code)
    await upsertToken(accountId, {
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token,
      expires_in: tokenResponse.expires_in,
      user_id: tokenResponse.user_id,
      marketplace: 'MLB',
    })

    return new Response(
      JSON.stringify({
        ok: true,
        account_id: accountId,
        user_id: tokenResponse.user_id,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
