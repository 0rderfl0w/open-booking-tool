import { createClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase instance using the service role key.
 * Bypasses RLS — used only in API routes for booking inserts,
 * cancellations, and operations requiring full access.
 *
 * NEVER import this in client-side code.
 */
export function createServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
