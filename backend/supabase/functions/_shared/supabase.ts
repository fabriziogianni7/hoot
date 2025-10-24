import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export function initSupabaseClient(req?: Request, useServiceRole = false) {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const key = useServiceRole 
    ? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    : Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  
  // Extract authorization header from request if provided
  const authHeader = req?.headers.get('Authorization') ?? ''
  
  return createClient(url, key, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {}
    }
  })
}

