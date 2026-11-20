import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { createArrivalService } from './service.js';

const STATIC_FILES = Object.freeze({
  '/': ['../public/index.html', 'text/html; charset=utf-8'],
  '/app.css': ['../public/app.css', 'text/css; charset=utf-8'],
  '/app.js': ['../public/app.js', 'text/javascript; charset=utf-8'],
  '/favicon.ico': ['../public/favicon.ico', 'image/x-icon'],
});

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'",
};

function json(res, status, payload, method) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(method === 'HEAD' ? undefined : JSON.stringify(payload));
}

/** Make the server testable without opening a port or calling the MTA. */
export function createApp({ service }) {
  return createServer(async (req, res) => {
    const method = req.method || 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      json(res, 405, { error: 'Method not allowed' }, method);
      return;
    }

    // Do not parse absolute URLs supplied in hostile Host headers as file paths.
    const route = (req.url || '/').split('?')[0];
    try {
      if (route === '/healthz') {
        json(res, 200, { status: 'ok' }, method);
      } else if (route === '/api/arrivals' || route === '/api') {
        const arrivals = await service.getArrivals();
        json(res, arrivals.status === 'error' ? 503 : 200, arrivals, method);
      } else if (Object.hasOwn(STATIC_FILES, route)) {
        const [relativePath, contentType] = STATIC_FILES[route];
        const content = await readFile(new URL(relativePath, import.meta.url));
        res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': contentType, 'Cache-Control': 'public, max-age=300' });
        res.end(method === 'HEAD' ? undefined : content);
      } else {
        json(res, 404, { error: 'Not found' }, method);
      }
    } catch (error) {
      console.error('Request failed:', error);
      if (!res.headersSent) json(res, 500, { error: 'Internal server error' }, method);
      else res.end();
    }
  });
}

export function startServer(config = loadConfig()) {
  const server = createApp({ service: createArrivalService(config) });
  server.listen(config.port, config.host, () => {
    console.log(`MTA Countdown Clock: http://${config.host}:${config.port}`);
    console.log(`Stops: ${config.stations.join(', ')} | Feeds: ${config.feeds.map((feed) => feed.name).join(', ')}`);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { startServer(); }
  catch (error) { console.error('Configuration error:', error.message); process.exitCode = 1; }
}
