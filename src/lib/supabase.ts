import { createClient } from '@supabase/supabase-js';

/**
 * Client-side Supabase instance using the anon key.
 * Used for public reads and authenticated dashboard operations.
 * Auth uses PKCE flow (tokens in memory, not cookies).
 */
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      flowType: 'pkce',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
);
