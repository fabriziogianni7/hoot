import { createClient } from '@supabase/supabase-js'
import { getSupabaseConfig } from './env-config'

const { url: supabaseUrl, anonKey: supabaseAnonKey } = getSupabaseConfig()

if (!supabaseAnonKey) {
  console.warn('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable')
}

// Create Supabase client with realtime configuration
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
})

// Helper function to call edge functions
export async function callEdgeFunction<TRequest, TResponse>(
  functionName: string,
  body: TRequest
): Promise<TResponse> {
  const response = await supabase.functions.invoke(functionName, {
    body: body as any
  })

  if (response.error) {
    throw new Error(response.error.message || 'Edge function call failed')
  }

  return response.data as TResponse
}


