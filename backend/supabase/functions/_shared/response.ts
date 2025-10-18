import { corsHeaders } from './cors.ts'

export function successResponse(data: unknown, status = 200): Response {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  )
}

export function errorResponse(message: string, status = 500, details?: unknown): Response {
  const errorBody = details 
    ? { error: message, details }
    : { error: message }
    
  return new Response(
    JSON.stringify(errorBody),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  )
}

