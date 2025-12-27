import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'

serve(async (request) => {
  const payload = await request.text()

  return new Response(
    JSON.stringify({ ok: true, received: payload ? true : false }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  )
})
