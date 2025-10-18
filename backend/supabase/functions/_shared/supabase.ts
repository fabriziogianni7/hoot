import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export function initSupabaseClient(useServiceRole = false) {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const key = useServiceRole 
    ? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    : Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  
  return createClient(url, key)
}

