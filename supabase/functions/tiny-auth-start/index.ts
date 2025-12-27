import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { buildAuthUrl } from '../_shared/tiny.ts'

serve((request) => {
  const url = new URL(request.url)
  const accountId = url.searchParams.get('account_id') ?? undefined
  const authUrl = buildAuthUrl(accountId)

  return Response.redirect(authUrl, 302)
})
