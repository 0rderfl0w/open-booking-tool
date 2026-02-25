/**
 * GET /api/google/calendars
 *
 * Returns the list of Google calendars for the authenticated practitioner.
 * Used to populate the calendar selector dropdown in the settings UI.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createServiceClient } from '../../src/lib/api-helpers';
import { getAccessToken } from '../../src/lib/google-calendar';
import { googleFetch } from '../../src/lib/google';

interface GoogleCalendarListEntry {
  id: string;
  summary: string;
  primary?: boolean;
}

interface GoogleCalendarList {
  items?: GoogleCalendarListEntry[];
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<VercelResponse> {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'GET only' } });
  }

  // Authenticate
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
    .select('id, google_calendar_connected')
    .eq('user_id', userData.user.id)
    .single();

  if (practitionerError || !practitioner) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Practitioner not found' } });
  }

  const pract = practitioner as { id: string; google_calendar_connected: boolean };

  if (!pract.google_calendar_connected) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Google Calendar not connected' } });
  }

  try {
    const accessToken = await getAccessToken(pract.id, supabase);
    const response = await googleFetch(accessToken, 'GET', '/users/me/calendarList');

    if (!response.ok) {
      const text = await response.text();
      console.error('[Google Calendars] List fetch failed:', text);
      return res.status(502).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch calendars from Google' } });
    }

    const data = await response.json() as GoogleCalendarList;
    const calendars = (data.items ?? []).map((c) => ({
      id: c.id,
      summary: c.summary,
      primary: c.primary ?? false,
    }));

    return res.status(200).json({ calendars });
  } catch (err) {
    console.error('[Google Calendars] Error:', err);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve calendars' } });
  }
}
