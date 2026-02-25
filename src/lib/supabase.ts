import { createClient } from '@supabase/supabase-js';

/**
 * Client-side Supabase instance using the anon key.
 * Used for public reads and authenticated dashboard operations.
 * Auth uses PKCE flow (tokens in memory, not cookies).
 */
/**
 * Custom lock implementation that bypasses Navigator LockManager.
 * Supabase's default uses navigator.locks which can deadlock in certain
 * browser states (multiple tabs, stale locks, devtools open).
 * This simple mutex is sufficient for single-tab use.
 */
const locks = new Map<string, Promise<unknown>>();
async function simpleLock<R>(name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
  const prev = locks.get(name) ?? Promise.resolve();
  const current = prev.catch(() => {}).then(() => fn());
  locks.set(name, current);
  try {
    return await current as R;
  } finally {
    if (locks.get(name) === current) locks.delete(name);
  }
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      flowType: 'pkce',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      lock: simpleLock,
    },
  }
);

/**
 * Lightweight anon client for public reads (username checks, public profiles).
 * No auth session — bypasses Navigator LockManager entirely.
 */
export const supabasePublic = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
