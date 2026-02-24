import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { HealthResponse } from '../src/types/api';
import { apiResponse } from '../src/lib/api-helpers';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<VercelResponse> {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return apiResponse(res, 405, { error: { code: 'INVALID_INPUT', message: 'Method not allowed' } });
  }

  const response: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };

  return apiResponse(res, 200, response);
}
