import { Hono } from 'hono';

import { CLI_NAME } from '../runtime/packageInfo';
import { RuntimeManager } from '../runtime/runtimeManager';
import { proxyPostgrestRequest } from './postgrestProxy';

export function registerRoutes(app: Hono, runtimeManager: RuntimeManager): void {
  app.get('/', async (context) => {
    const snapshot = runtimeManager.getSnapshot();
    const readiness = await runtimeManager.getReadiness();
    const baseUrl = new URL(context.req.url).origin;

    return context.json({
      service: CLI_NAME,
      ready: readiness.ready,
      versions: {
        cli: snapshot.cliVersion,
        postgrest: snapshot.postgrestVersion,
      },
      ports: {
        hono: snapshot.port,
        postgresWire: snapshot.pgPort,
        postgrest: snapshot.postgrestPort,
        admin: snapshot.adminPort,
      },
      endpoints: {
        root: `${baseUrl}/`,
        health: `${baseUrl}/health`,
        ready: `${baseUrl}/ready`,
        api: `${baseUrl}/api`,
      },
      runtime: snapshot,
    });
  });

  app.get('/health', (context) => {
    return context.json({
      status: 'ok',
      runtime: runtimeManager.getSnapshot(),
    });
  });

  app.get('/ready', async (context) => {
    const readiness = await runtimeManager.getReadiness();
    return context.json(readiness, readiness.ready ? 200 : 503);
  });

  app.all('/api', (context) => proxyPostgrestRequest(context, runtimeManager));
  app.all('/api/*', (context) => proxyPostgrestRequest(context, runtimeManager));
}