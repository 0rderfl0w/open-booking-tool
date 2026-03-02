/**
 * POST /api/apple/connect
 *
 * Tests Apple CalDAV credentials and stores them if successful.
 * Returns the list of calendars for the user to pick from.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createServiceClient } from '../../src/lib/api-helpers';
import { testAppleConnection } from '../../src/lib/apple-calendar';

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

  const { username, password } = (req.body as { username?: string; password?: string }) ?? {};
  if (!username || !password) {
    return res.status(422).json({ error: { code: 'INVALID_INPUT', message: 'Apple ID and app-specific password required' } });
  }

  const result = await testAppleConnection(username, password);

  if (!result.success) {
    return res.status(400).json({ error: { code: 'AUTH_FAILED', message: result.error } });
  }

  const { error: credError } = await supabase
    .from('practitioner_credentials')
    .update({
      apple_caldav_username: username,
      apple_caldav_password: password,
      apple_caldav_server_url: result.serverUrl,
      apple_calendars_json: JSON.stringify(result.calendars),
      apple_cb_failures: 0,
      apple_cb_first_failure_at: null,
      apple_last_auth_error_at: null,
    })
    .eq('practitioner_id', practitionerId);

  if (credError) {
    console.error('[Apple Connect] Failed to save credentials:', credError);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to save credentials' } });
  }

  return res.status(200).json({ calendars: result.calendars });
}
