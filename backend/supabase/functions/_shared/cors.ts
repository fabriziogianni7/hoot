export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function handleCorsPreFlight(): Response {
  return new Response('ok', { headers: corsHeaders })
}

