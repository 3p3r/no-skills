import { CliError } from '../../runtime/errors';
import { Logger } from '../../runtime/logger';
import { resolveStartConfig } from '../../runtime/config';
import { RuntimeManager } from '../../runtime/runtimeManager';

export async function runStartCommand(options: Record<string, unknown>): Promise<number> {
  const config = resolveStartConfig(options);
  const logger = new Logger({
    level: config.logLevel,
    json: config.json,
  });
  const runtimeManager = new RuntimeManager(config, logger);

  try {
    await runtimeManager.startCore();
    await runtimeManager.start();

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
  const config = runtimeManager.getConfig();
  const endpoints: Record<string, string> = {
    root: `http://${snapshot.host}:${snapshot.port}/`,
    health: `http://${snapshot.host}:${snapshot.port}/health`,
    ready: `http://${snapshot.host}:${snapshot.port}/ready`,
    api: `http://${snapshot.host}:${snapshot.port}/api`,
  };

  if (config.openapiEnabled) {
    endpoints.openapi = `http://${snapshot.host}:${snapshot.port}${config.openapiPath}`;
  }
  if (config.skillsEnabled) {
    endpoints.skills = `http://${snapshot.host}:${snapshot.port}/skills/SKILL.md`;
  }

  const payload = {
    status: 'ready',
    endpoints,
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
  console.log(`  root: ${endpoints.root}`);
  console.log(`  health: ${endpoints.health}`);
  console.log(`  ready: ${endpoints.ready}`);
  console.log(`  api: ${endpoints.api}`);
  if (config.openapiEnabled) {
    console.log(`  openapi: ${endpoints.openapi}`);
  }
  if (config.skillsEnabled) {
    console.log(`  skills: ${endpoints.skills}`);
  }
  console.log(`  postgres wire: ${payload.postgresWire}`);
  console.log(`  postgrest binary: ${payload.postgrest.binaryPath}`);
}