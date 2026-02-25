/**
 * GET /api/google/connect
 *
 * Initiates Google OAuth flow for the authenticated practitioner.
 * Returns a JSON object with the Google consent URL and sets an HttpOnly
 * state cookie for CSRF protection.
 *
 * Frontend usage:
 *   const res = await fetch('/api/google/connect', {
 *     headers: { Authorization: `Bearer ${token}` },
 *     credentials: 'include',
 *   });
 *   const { url } = await res.json();
 *   window.location.href = url;
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { nanoid } from 'nanoid';
import { createServiceClient } from '../../src/lib/api-helpers';
import { getGoogleAuthUrl, signState } from '../../src/lib/google';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<VercelResponse> {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'GET only' } });
  }

  // Authenticate: require Bearer token
  const authHeader = req.headers['authorization'];
  const token = authHeader?.replace('Bearer ', '').trim();
  if (!token) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing authorization token' } });
  }

  const supabase = createServiceClient();

  // Verify the JWT and get the user
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
  }

  // Look up the practitioner for this user
  const { data: practitioner, error: practitionerError } = await supabase
    .from('practitioners')
    .select('id')
    .eq('user_id', userData.user.id)
    .single();

  if (practitionerError || !practitioner) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Practitioner not found' } });
  }

  const practitionerId = (practitioner as { id: string }).id;

  // Build state payload: {practitionerId}.{nonce}
  // The last '.' separates the HMAC signature when we assemble the full cookie value.
  const nonce = nanoid(16);
  const statePayload = `${practitionerId}.${nonce}`;
  const signature = signState(statePayload);

  // Full state string passed to Google (and stored in cookie for comparison)
  const fullState = `${statePayload}.${signature}`;

  // HttpOnly cookie valid for 10 minutes
  const cookieValue = `google_oauth_state=${encodeURIComponent(fullState)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`;
  res.setHeader('Set-Cookie', cookieValue);

  const authUrl = getGoogleAuthUrl(fullState);

  return res.status(200).json({ url: authUrl });
}
