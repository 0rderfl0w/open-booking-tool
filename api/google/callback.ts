/**
 * GET /api/google/callback
 *
 * Google OAuth 2.0 callback. Google redirects here after user grants permission.
 * Verifies CSRF state, exchanges code for tokens, stores refresh token,
 * and redirects back to the dashboard settings page.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createServiceClient } from '../../src/lib/api-helpers';
import { exchangeCodeForTokens, verifyState } from '../../src/lib/google';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<VercelResponse> {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'GET only' } });
  }

  const settingsUrl = `${process.env.APP_URL ?? 'http://localhost:5173'}/dashboard/settings`;

  try {
    const { code, state, error: googleError } = req.query as Record<string, string | undefined>;

    // Google returned an error (e.g., user denied access)
    if (googleError) {
      return res.redirect(302, `${settingsUrl}?calendar=error&reason=${encodeURIComponent(googleError)}`);
    }

    if (!code || !state) {
      return res.redirect(302, `${settingsUrl}?calendar=error&reason=${encodeURIComponent('Missing code or state')}`);
    }

    // ── CSRF verification ─────────────────────────────────────────────────────

    // Parse the state cookie from request headers
    const cookieHeader = req.headers['cookie'] ?? '';
    const cookieState = parseCookie(cookieHeader, 'google_oauth_state');

    if (!cookieState) {
      return res.redirect(302, `${settingsUrl}?calendar=error&reason=${encodeURIComponent('Missing state cookie — please try again')}`);
    }

    // The state from Google must match the cookie exactly
    if (state !== cookieState) {
      return res.redirect(302, `${settingsUrl}?calendar=error&reason=${encodeURIComponent('State mismatch — possible CSRF')}`);
    }

    // State format: {practitionerId}.{nonce}.{signature}
    // The signature is the last segment (64 hex chars). The payload is everything before the last '.'.
    const lastDot = state.lastIndexOf('.');
    if (lastDot === -1) {
      return res.redirect(302, `${settingsUrl}?calendar=error&reason=${encodeURIComponent('Malformed state')}`);
    }

    const statePayload = state.slice(0, lastDot);
    const signature = state.slice(lastDot + 1);

    if (!verifyState(statePayload, signature)) {
      return res.redirect(302, `${settingsUrl}?calendar=error&reason=${encodeURIComponent('Invalid state signature')}`);
    }

    // Extract practitioner_id (first segment before '.')
    const practitionerId = statePayload.split('.')[0];
    if (!practitionerId) {
      return res.redirect(302, `${settingsUrl}?calendar=error&reason=${encodeURIComponent('Could not extract practitioner ID')}`);
    }

    // ── Exchange authorization code for tokens ────────────────────────────────

    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.refresh_token) {
      // This can happen if the user already granted access previously.
      // The fix is to always pass prompt=consent in the auth URL (we do).
      return res.redirect(302, `${settingsUrl}?calendar=error&reason=${encodeURIComponent('No refresh token returned — please disconnect and reconnect')}`);
    }

    // ── Store refresh token + update practitioner ─────────────────────────────

    const supabase = createServiceClient();
    const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Upsert credentials row (created by trigger when practitioner is created)
    const { error: credError } = await supabase
      .from('practitioner_credentials')
      .upsert(
        {
          practitioner_id: practitionerId,
          google_refresh_token: tokens.refresh_token,
          google_token_expiry: expiry,
          google_cb_failures: 0,
          google_cb_first_failure_at: null,
        },
        { onConflict: 'practitioner_id' },
      );

    if (credError) {
      console.error('[Google Callback] Failed to save credentials:', credError);
      return res.redirect(302, `${settingsUrl}?calendar=error&reason=${encodeURIComponent('Failed to save credentials')}`);
    }

    // Mark practitioner as connected
    const { error: practError } = await supabase
      .from('practitioners')
      .update({ google_calendar_connected: true })
      .eq('id', practitionerId);

    if (practError) {
      console.error('[Google Callback] Failed to update practitioner:', practError);
    }

    // Clear the state cookie
    res.setHeader(
      'Set-Cookie',
      'google_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    );

    return res.redirect(302, `${settingsUrl}?calendar=connected`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Google Callback] Unexpected error:', err);
    return res.redirect(302, `${settingsUrl}?calendar=error&reason=${encodeURIComponent(message)}`);
  }
}

// ─── Cookie parser helper ─────────────────────────────────────────────────────

function parseCookie(cookieHeader: string, name: string): string | null {
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [key, ...valueParts] = part.trim().split('=');
    if (key?.trim() === name) {
      return decodeURIComponent(valueParts.join('='));
    }
  }
  return null;
}
