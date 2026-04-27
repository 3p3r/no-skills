import { Context } from 'hono';

import { RuntimeManager } from '../runtime/runtimeManager';

const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
]);

export async function proxyPostgrestRequest(context: Context, runtimeManager: RuntimeManager): Promise<Response> {
  const incomingUrl = new URL(context.req.url);
  const targetPath = context.req.path === '/api' ? '/' : context.req.path.replace(/^\/api/, '') || '/';
  const targetUrl = new URL(targetPath, runtimeManager.getPostgrestBaseUrl());
  targetUrl.search = incomingUrl.search;

  const headers = new Headers();
  for (const [key, value] of context.req.raw.headers.entries()) {
    if (!hopByHopHeaders.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  }
  headers.set('x-forwarded-host', incomingUrl.host);
  headers.set('x-forwarded-proto', incomingUrl.protocol.replace(':', ''));

  const method = context.req.method.toUpperCase();
  const body = method === 'GET' || method === 'HEAD' ? undefined : await context.req.raw.arrayBuffer();
  const response = await fetch(targetUrl, {
    method,
    headers,
    body,
    redirect: 'manual',
  });

  const responseHeaders = new Headers(response.headers);
  for (const name of hopByHopHeaders) {
    responseHeaders.delete(name);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}