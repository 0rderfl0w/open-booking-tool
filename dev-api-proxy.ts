/**
 * Vite dev server plugin that proxies /api/* requests to our Vercel-style
 * serverless functions. This avoids needing the Vercel CLI for local dev.
 *
 * Maps:
 *   GET  /api/health      → api/health.ts
 *   GET  /api/slots        → api/slots.ts
 *   POST /api/book         → api/book.ts
 *   POST /api/cancel       → api/cancel.ts
 *   GET  /api/booking/:token/details → api/booking/[token]/details.ts
 *   GET  /api/booking/:token/ics     → api/booking/[token]/ics.ts
 */
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';
import { config } from 'dotenv';

// Load ALL env vars (including non-VITE_ ones) for API routes
config();

// Minimal VercelRequest/VercelResponse shim
function shimRequest(req: IncomingMessage, body: string) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const ip = req.socket?.remoteAddress ?? '127.0.0.1';
  return {
    method: req.method,
    url: req.url,
    headers: { ...req.headers, 'x-forwarded-for': ip },
    query: Object.fromEntries(url.searchParams.entries()),
    body: body ? JSON.parse(body) : undefined,
    socket: { remoteAddress: ip },
    connection: { remoteAddress: ip },
  };
}

function shimResponse(res: ServerResponse) {
  let _status = 200;
  const resp: any = {
    status(code: number) { _status = code; return resp; },
    json(data: any) {
      res.writeHead(_status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return resp;
    },
    setHeader(name: string, value: string) {
      res.setHeader(name, value);
      return resp;
    },
    end(body?: string) {
      res.writeHead(_status);
      res.end(body);
      return resp;
    },
  };
  return resp;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
  });
}

// Route table: pattern → module path
const routes: Array<{ pattern: RegExp; module: string; paramNames?: string[] }> = [
  { pattern: /^\/api\/health$/, module: './api/health.ts' },
  { pattern: /^\/api\/slots$/, module: './api/slots.ts' },
  { pattern: /^\/api\/book$/, module: './api/book.ts' },
  { pattern: /^\/api\/cancel$/, module: './api/cancel.ts' },
  { pattern: /^\/api\/booking\/([^/]+)\/details$/, module: './api/booking/[token]/details.ts', paramNames: ['token'] },
  { pattern: /^\/api\/booking\/([^/]+)\/ics$/, module: './api/booking/[token]/ics.ts', paramNames: ['token'] },
];

export default function devApiProxy(): Plugin {
  return {
    name: 'dev-api-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0];
        if (!url?.startsWith('/api/')) return next();

        for (const route of routes) {
          const match = url.match(route.pattern);
          if (!match) continue;

          try {
            const body = await readBody(req);
            const vReq = shimRequest(req, body) as any;

            // Add path params
            if (route.paramNames) {
              route.paramNames.forEach((name, i) => {
                vReq.query[name] = match[i + 1];
              });
            }

            const vRes = shimResponse(res);

            // Dynamic import the handler
            const mod = await server.ssrLoadModule(route.module);
            await mod.default(vReq, vRes);
          } catch (err: any) {
            console.error(`[dev-api-proxy] Error in ${route.module}:`, err);
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message ?? 'Internal server error' }));
            }
          }
          return;
        }

        // No matching route
        next();
      });
    },
  };
}
