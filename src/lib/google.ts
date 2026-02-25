/**
 * Google OAuth + Calendar API helpers.
 * All HTTP calls use native fetch — no google-auth-library dependency.
 * Server-side only — never import this from frontend/React code.
 */
import { createHmac, timingSafeEqual } from 'crypto';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ');

// ─── Env helpers ─────────────────────────────────────────────────────────────

function getClientId(): string {
  const v = process.env.GOOGLE_CLIENT_ID;
  if (!v) throw new Error('GOOGLE_CLIENT_ID not configured');
  return v;
}

function getClientSecret(): string {
  const v = process.env.GOOGLE_CLIENT_SECRET;
  if (!v) throw new Error('GOOGLE_CLIENT_SECRET not configured');
  return v;
}

function getRedirectUri(): string {
  const v = process.env.GOOGLE_REDIRECT_URI;
  if (!v) throw new Error('GOOGLE_REDIRECT_URI not configured');
  return v;
}

function getStateSecret(): string {
  const v = process.env.OAUTH_STATE_SECRET;
  if (!v) throw new Error('OAUTH_STATE_SECRET not configured');
  return v;
}

// ─── State signing (CSRF protection) ─────────────────────────────────────────

/**
 * Produce an HMAC-SHA256 hex signature for the state payload.
 */
export function signState(state: string): string {
  return createHmac('sha256', getStateSecret()).update(state).digest('hex');
}

/**
 * Timing-safe comparison of a provided signature against the expected one.
 */
export function verifyState(state: string, signature: string): boolean {
  const expected = signState(state);
  try {
    // Buffers must be same length for timingSafeEqual
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length) return false;
    return timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

// ─── OAuth URL builder ────────────────────────────────────────────────────────

/**
 * Build the Google OAuth 2.0 consent URL.
 *
 * @param state  The full state string to embed (should include practitioner_id,
 *               a random nonce, and an HMAC signature).
 */
export function getGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: CALENDAR_SCOPES,
    access_type: 'offline',
    prompt: 'consent', // Always request consent to ensure refresh token is returned
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

// ─── Token exchange ───────────────────────────────────────────────────────────

export interface GoogleTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: getRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google token exchange failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<GoogleTokens>;
}

// ─── Token refresh ────────────────────────────────────────────────────────────

export interface RefreshedTokens {
  access_token: string;
  expires_in: number;
}

/**
 * Use a refresh token to obtain a new access token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<RefreshedTokens> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google token refresh failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<RefreshedTokens>;
}

// ─── Authenticated Calendar API fetch ────────────────────────────────────────

/**
 * Make an authenticated request to the Google Calendar REST API.
 * Path should start with '/', e.g. '/calendars/primary/events'.
 */
export async function googleFetch(
  accessToken: string,
  method: string,
  path: string,
  body?: object,
): Promise<Response> {
  const url = `${GOOGLE_CALENDAR_BASE}${path}`;
  return fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
