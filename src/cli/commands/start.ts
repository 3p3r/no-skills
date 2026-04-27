import { serve } from '@hono/node-server';

import { CliError } from '../../runtime/errors';
import { Logger } from '../../runtime/logger';
import { createApp } from '../../server/app';
import { resolveStartConfig } from '../../runtime/config';
import { ManagedHttpServer, RuntimeManager } from '../../runtime/runtimeManager';

export async function runStartCommand(options: Record<string, unknown>): Promise<number> {
  const config = resolveStartConfig(options);
  const logger = new Logger({
    level: config.logLevel,
    json: config.json,
  });
  const runtimeManager = new RuntimeManager(config, logger);

  try {
    await runtimeManager.startCore();

    const app = createApp(runtimeManager);
    const server = serve({
      fetch: app.fetch,
      hostname: config.host,
      port: config.port,
    });
    runtimeManager.registerHttpServer(server as ManagedHttpServer);

    await new Promise<void>((resolve, reject) => {
      server.once('listening', () => resolve());
      server.once('error', reject);
    });

    emitReadyMessage(config.json, runtimeManager);
    return await waitForTermination(runtimeManager, logger);
  } catch (error) {
    await runtimeManager.stop().catch(() => undefined);
    if (error instanceof CliError) {
      logger.error(error.message);
      return error.exitCode;
    }
    logger.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

async function waitForTermination(runtimeManager: RuntimeManager, logger: Logger): Promise<number> {
  return new Promise((resolve) => {
    let shuttingDown = false;

    const onSignal = async (signal: NodeJS.Signals) => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;
      logger.info('Received shutdown signal', { signal });
      removeHandlers();
      await runtimeManager.stop();
      resolve(0);
    };

    const removeHandlers = () => {
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
    };

    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
  });
}

function emitReadyMessage(json: boolean, runtimeManager: RuntimeManager): void {
  const snapshot = runtimeManager.getSnapshot();
  const payload = {
    status: 'ready',
    endpoints: {
      root: `http://${snapshot.host}:${snapshot.port}/`,
      health: `http://${snapshot.host}:${snapshot.port}/health`,
      ready: `http://${snapshot.host}:${snapshot.port}/ready`,
      api: `http://${snapshot.host}:${snapshot.port}/api`,
    },
    postgrest: {
      http: `http://127.0.0.1:${snapshot.postgrestPort}`,
      admin: `http://127.0.0.1:${snapshot.adminPort}`,
      binaryPath: snapshot.postgrestBinaryPath,
    },
    postgresWire: `postgresql://postgres@127.0.0.1:${snapshot.pgPort}/postgres`,
  };

  if (json) {
    console.log(JSON.stringify(payload));
    return;
  }

  console.log('postgrest-lite is ready');
  console.log(`  root: ${payload.endpoints.root}`);
  console.log(`  health: ${payload.endpoints.health}`);
  console.log(`  ready: ${payload.endpoints.ready}`);
  console.log(`  api: ${payload.endpoints.api}`);
  console.log(`  postgres wire: ${payload.postgresWire}`);
  console.log(`  postgrest binary: ${payload.postgrest.binaryPath}`);
}