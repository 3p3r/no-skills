import { ChildProcess, spawn } from 'node:child_process';

import { CliError } from './errors';
import { Logger, LogLevel } from './logger';
import { waitFor } from './network';

export interface PostgrestRuntime {
  url: string;
  adminUrl: string;
  binaryPath: string;
  isRunning(): boolean;
  isReady(): boolean;
  getExitState(): { code: number | null; signal: NodeJS.Signals | null };
  stop(): Promise<void>;
}

export interface StartPostgrestOptions {
  binaryPath: string;
  pgPort: number;
  schema: string;
  dbAnonRole: string;
  postgrestPort: number;
  adminPort: number;
  logLevel: LogLevel;
  readyTimeoutMs: number;
  logger: Logger;
}

export async function startPostgrestRuntime(options: StartPostgrestOptions): Promise<PostgrestRuntime> {
  const logger = options.logger.child('postgrest');
  const env = {
    ...process.env,
    PGRST_DB_URI: `postgresql://postgres@127.0.0.1:${options.pgPort}/postgres?sslmode=disable`,
    PGRST_DB_SCHEMAS: options.schema,
    PGRST_DB_ANON_ROLE: options.dbAnonRole,
    PGRST_SERVER_PORT: String(options.postgrestPort),
    PGRST_ADMIN_SERVER_PORT: String(options.adminPort),
    PGRST_DB_CHANNEL_ENABLED: 'false',
    PGRST_DB_PREPARED_STATEMENTS: 'false',
    PGRST_DB_POOL: '1',
    PGRST_DB_POOL_MAX_IDLETIME: '10',
    PGRST_DB_POOL_MAX_LIFETIME: '300',
    PGRST_LOG_LEVEL: options.logLevel,
  };

  const child = spawn(options.binaryPath, [], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let running = true;
  let ready = false;
  let exitCode: number | null = null;
  let exitSignal: NodeJS.Signals | null = null;

  child.stdout.on('data', (chunk) => {
    logger.info(String(chunk).trim());
  });
  child.stderr.on('data', (chunk) => {
    logger.warn(String(chunk).trim());
  });

  child.once('error', (error) => {
    running = false;
    ready = false;
    logger.error('PostgREST process failed to start', error);
  });

  child.once('close', (code, signal) => {
    running = false;
    ready = false;
    exitCode = code;
    exitSignal = signal;
    logger.warn('PostgREST process exited', { code, signal });
  });

  await waitForPostgrestReady(`http://127.0.0.1:${options.adminPort}/ready`, options.readyTimeoutMs, child);
  ready = true;
  logger.info('PostgREST is ready', {
    postgrestPort: options.postgrestPort,
    adminPort: options.adminPort,
  });

  return {
    url: `http://127.0.0.1:${options.postgrestPort}`,
    adminUrl: `http://127.0.0.1:${options.adminPort}`,
    binaryPath: options.binaryPath,
    isRunning: () => running,
    isReady: () => ready && running,
    getExitState: () => ({ code: exitCode, signal: exitSignal }),
    stop: async () => {
      ready = false;
      if (!running) {
        return;
      }
      await terminateChild(child, logger);
      running = false;
    },
  };
}

async function waitForPostgrestReady(url: string, timeoutMs: number, child: ChildProcess): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null || child.killed) {
      throw new CliError('PostgREST exited before becoming ready.', 1);
    }
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling.
    }
    await waitFor(250);
  }
  throw new CliError(`PostgREST did not become ready within ${timeoutMs}ms.`, 1);
}

async function terminateChild(child: ChildProcess, logger: Logger): Promise<void> {
  if (child.exitCode !== null || child.killed) {
    return;
  }

  child.kill('SIGTERM');
  const graceful = await waitForExit(child, 5000);
  if (graceful) {
    return;
  }

  logger.warn('PostgREST did not exit after SIGTERM, sending SIGKILL');
  child.kill('SIGKILL');
  await waitForExit(child, 5000);
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.killed) {
    return true;
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);

    const onClose = () => {
      cleanup();
      resolve(true);
    };

    const cleanup = () => {
      clearTimeout(timer);
      child.off('close', onClose);
    };

    child.once('close', onClose);
  });
}