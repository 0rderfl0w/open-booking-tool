/**
 * POST /api/google/disconnect
 *
 * Revokes the Google Calendar connection for the authenticated practitioner.
 * Clears the stored refresh token and marks google_calendar_connected = false.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createServiceClient } from '../../src/lib/api-helpers';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<VercelResponse> {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'POST only' } });
  }

  // Authenticate: require Bearer token
  const authHeader = req.headers['authorization'];
  const token = authHeader?.replace('Bearer ', '').trim();
  if (!token) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing authorization token' } });
  }

  const supabase = createServiceClient();

  // Verify the JWT
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
  }

  // Look up practitioner
  const { data: practitioner, error: practitionerError } = await supabase
    .from('practitioners')
    .select('id')
    .eq('user_id', userData.user.id)
    .single();

  if (practitionerError || !practitioner) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Practitioner not found' } });
  }

  const practitionerId = (practitioner as { id: string }).id;

  // Clear credentials
  const { error: credError } = await supabase
    .from('practitioner_credentials')
    .update({
      google_refresh_token: null,
      google_token_expiry: null,
      google_calendar_id: 'primary',
      google_cb_failures: 0,
      google_cb_first_failure_at: null,
    })
    .eq('practitioner_id', practitionerId);

  if (credError) {
    console.error('[Google Disconnect] Failed to clear credentials:', credError);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to disconnect' } });
  }

  // Mark practitioner as disconnected
  const { error: practError } = await supabase
    .from('practitioners')
    .update({ google_calendar_connected: false })
    .eq('id', practitionerId);

  if (practError) {
    console.error('[Google Disconnect] Failed to update practitioner:', practError);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update practitioner' } });
  }

  return res.status(200).json({ disconnected: true });
}
