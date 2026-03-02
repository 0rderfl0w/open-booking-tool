/**
 * POST /api/apple/disconnect
 *
 * Clears Apple CalDAV credentials and marks apple_calendar_connected = false.
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

  const authHeader = req.headers['authorization'];
  const token = authHeader?.replace('Bearer ', '').trim();
  if (!token) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing authorization token' } });
  }

  const supabase = createServiceClient();

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
  }

  const { data: practitioner, error: practitionerError } = await supabase
    .from('practitioners')
    .select('id')
    .eq('user_id', userData.user.id)
    .single();

  if (practitionerError || !practitioner) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Practitioner not found' } });
  }

  const practitionerId = (practitioner as { id: string }).id;

  const { error: credError } = await supabase
    .from('practitioner_credentials')
    .update({
      apple_caldav_username: null,
      apple_caldav_password: null,
      apple_calendar_id: null,
      apple_caldav_server_url: null,
      apple_calendars_json: null,
      apple_cb_failures: 0,
      apple_cb_first_failure_at: null,
      apple_last_auth_error_at: null,
    })
    .eq('practitioner_id', practitionerId);

  if (credError) {
    console.error('[Apple Disconnect] Failed to clear credentials:', credError);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to disconnect' } });
  }

  const { error: practError } = await supabase
    .from('practitioners')
    .update({ apple_calendar_connected: false })
    .eq('id', practitionerId);

  if (practError) {
    console.error('[Apple Disconnect] Failed to update practitioner:', practError);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update practitioner' } });
  }

  return res.status(200).json({ disconnected: true });
}
