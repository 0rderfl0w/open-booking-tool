import { Ratelimit } from '@upstash/ratelimit';
import type { Duration } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import type { ErrorCode } from '../types/api';

/**
 * Create a server-side Supabase client using the service role key.
 * This bypasses RLS and is used for API operations that need full DB access.
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

/**
 * Verify a Cloudflare Turnstile token server-side.
 * Implements fail-open policy: if verification fails due to network error,
 * allow the request through and log to Sentry.
 */
export async function verifyTurnstile(token: string): Promise<boolean> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) {
    console.warn('[Turnstile] TURNSTILE_SECRET_KEY not configured, skipping verification');
    return true; // Fail open in dev
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: secretKey,
        response: token,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn('[Turnstile] Verification request failed:', response.status);
      return true; // Fail open
    }

    const result = await response.json() as { success: boolean };
    return result.success;
  } catch (error) {
    console.warn('[Turnstile] Verification error, failing open:', error);
    // Fail open on network errors - log to Sentry in production
    return true;
  }
}

/**
 * Create a rate limiter using Upstash Redis.
 */
export function createRateLimiter(prefix: string, limit: number, window: Duration) {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!redisUrl || !redisToken) {
    // Return a dummy rate limiter for development
    console.warn(`[RateLimit] Redis not configured, skipping rate limiting for ${prefix}`);
    return {
      limit: async () => ({ allowed: true, remaining: limit, reset: Date.now() + 60000 }),
    };
  }

  const redis = new Redis({
    url: redisUrl,
    token: redisToken,
  });

  return new Ratelimit({
    redis,
    prefix,
    limiter: Ratelimit.fixedWindow(limit, window),
  });
}

/**
 * Parse and validate JSON request body.
 */
export async function parseBody<T>(req: VercelRequest): Promise<T> {
  // Check body size (max 10KB)
  const bodyStr = JSON.stringify(req.body);
  if (bodyStr.length > 10 * 1024) {
    throw new Error('Request body too large (max 10KB)');
  }

  if (!req.body) {
    throw new Error('Missing request body');
  }

  return req.body as T;
}

/**
 * Standard API response helper.
 */
export function apiResponse(res: VercelResponse, status: number, data: unknown) {
  return res.status(status).json(data);
}

/**
 * Standard error response helper.
 */
export function apiError(res: VercelResponse, status: number, code: ErrorCode, message: string) {
  return res.status(status).json({
    error: { code, message },
  });
}

/**
 * Get client IP from request headers.
 */
export function getClientIp(req: VercelRequest): string {
  return (
    req.headers['x-forwarded-for']?.toString().split(',')[0] ||
    req.headers['x-real-ip']?.toString() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

/**
 * Check if request body is too large (max 10KB)
 */
export function isBodyTooLarge(body: unknown): boolean {
  return JSON.stringify(body).length > 10 * 1024;
}
