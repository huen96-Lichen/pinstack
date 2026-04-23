import { promises as fs } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import path from 'node:path';
import { KnowledgeRuntime } from './knowledgeRuntime';
import { createRoutes, type RouteContext, dispatchRoutes } from './routes';

interface StartedKnowledgeServer {
  server: Server;
  port: number;
  apiBaseUrl: string;
  webUrl: string;
}

interface CreateKnowledgeServerOptions {
  runtime: KnowledgeRuntime;
  portRange?: {
    start: number;
    end: number;
  };
  webDevUrl?: string;
  webRootPath?: string;
}

// Pre-build the route table once
const routes = createRoutes();

export async function createKnowledgeServer(options: CreateKnowledgeServerOptions): Promise<StartedKnowledgeServer> {
  const range = options.portRange ?? { start: 4860, end: 4870 };

  for (let port = range.start; port <= range.end; port += 1) {
    const server = createServer(async (request, response) => {
      try {
        await routeRequest(request, response, options.runtime, options.webRootPath);
      } catch (error) {
        const requestOrigin = request.headers.origin ?? null;
        respondJson(response, 500, {
          error: error instanceof Error ? error.message : 'Internal server error'
        }, requestOrigin);
      }
    });

    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          server.removeListener('error', reject);
          resolve();
        });
      });

      const apiBaseUrl = `http://127.0.0.1:${port}`;
      const webUrl = options.webDevUrl?.trim() || apiBaseUrl;
      return {
        server,
        port,
        apiBaseUrl,
        webUrl
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EADDRINUSE') {
        throw error;
      }
    }
  }

  throw new Error('PinStack 3.0 knowledge server 无法绑定可用端口。');
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  runtime: KnowledgeRuntime,
  webRootPath?: string
): Promise<void> {
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const requestOrigin = request.headers.origin ?? null;

  if (method === 'OPTIONS') {
    respondJson(response, 204, null, requestOrigin);
    return;
  }

  const json = (statusCode: number, data: unknown) => respondJson(response, statusCode, data, requestOrigin);
  const html = (content: string) => respondHtml(response, content, requestOrigin);

  const ctx: RouteContext = {
    request,
    response,
    runtime,
    method,
    pathname: url.pathname,
    url,
    requestOrigin,
    json,
    html,
    match: null
  };

  const matched = await dispatchRoutes(routes, ctx);
  if (matched) {
    return;
  }

  // Try serving static assets for GET requests
  if (method === 'GET') {
    const served = await tryServeStaticAsset(response, url.pathname, webRootPath, requestOrigin);
    if (served) {
      return;
    }
  }

  respondJson(response, 404, {
    error: `Unknown route: ${method} ${url.pathname}`
  }, requestOrigin);
}

function setCorsHeaders(response: ServerResponse, requestOrigin?: string | null): void {
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:3000'
  ];
  const origin = (requestOrigin && allowedOrigins.includes(requestOrigin)) ? requestOrigin : allowedOrigins[0];
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function respondJson(response: ServerResponse, statusCode: number, data: unknown, requestOrigin?: string | null): void {
  setCorsHeaders(response, requestOrigin);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  if (statusCode === 204) {
    response.end();
    return;
  }
  response.end(JSON.stringify(data, null, 2));
}

function respondHtml(response: ServerResponse, htmlContent: string, requestOrigin?: string | null): void {
  setCorsHeaders(response, requestOrigin);
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8'
  });
  response.end(htmlContent);
}

async function tryServeStaticAsset(
  response: ServerResponse,
  pathnameValue: string,
  webRootPath?: string,
  requestOrigin?: string | null
): Promise<boolean> {
  if (!webRootPath) {
    if (pathnameValue === '/' || pathnameValue === '/index.html') {
      respondHtml(
        response,
        `<!doctype html><html><head><meta charset="utf-8"/><title>PinStack 3.0 Web</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:32px;background:#faf7f2;color:#111}a{color:#0f766e}</style></head><body><h1>PinStack 3.0 Web</h1><p>开发态请运行 <code>npm run dev:web</code>，或先执行 <code>npm run build:web</code>。</p></body></html>`,
        requestOrigin
      );
      return true;
    }
    return false;
  }

  const normalizedPath = pathnameValue === '/' ? '/index.html' : pathnameValue;
  if (!normalizedPath.startsWith('/assets/') && normalizedPath !== '/index.html' && normalizedPath !== '/favicon.ico') {
    return false;
  }

  const filePath = path.join(webRootPath, normalizedPath);
  try {
    const content = await fs.readFile(filePath);
    response.writeHead(200, {
      'Content-Type': resolveMimeType(filePath)
    });
    response.end(content);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && normalizedPath === '/index.html') {
      respondHtml(
        response,
        `<!doctype html><html><head><meta charset="utf-8"/><title>PinStack 3.0 Web</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:32px;background:#faf7f2;color:#111}a{color:#0f766e}</style></head><body><h1>PinStack 3.0 Web</h1><p>未找到构建后的 web 前台。开发态请运行 <code>npm run dev:web</code>，或先执行 <code>npm run build:web</code>。</p></body></html>`,
        requestOrigin
      );
      return true;
    }
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function resolveMimeType(filePath: string): string {
  if (filePath.endsWith('.css')) {
    return 'text/css; charset=utf-8';
  }
  if (filePath.endsWith('.js')) {
    return 'text/javascript; charset=utf-8';
  }
  if (filePath.endsWith('.html')) {
    return 'text/html; charset=utf-8';
  }
  if (filePath.endsWith('.svg')) {
    return 'image/svg+xml';
  }
  if (filePath.endsWith('.png')) {
    return 'image/png';
  }
  return 'application/octet-stream';
}
