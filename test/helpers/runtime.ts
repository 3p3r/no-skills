import { runDoctorCommand } from '../../src/cli/commands/doctor';
import { resolveStartConfig, StartConfig } from '../../src/runtime/config';
import { Logger } from '../../src/runtime/logger';
import { getFreePort } from '../../src/runtime/network';
import { RuntimeManager } from '../../src/runtime/runtimeManager';

export async function buildTestConfig(overrides: Partial<StartConfig> = {}): Promise<StartConfig> {
  const host = overrides.host ?? '127.0.0.1';

  return resolveStartConfig({
    host,
    port: overrides.port ?? (await getFreePort(host)),
    pgPort: overrides.pgPort ?? (await getFreePort('127.0.0.1')),
    postgrestPort: overrides.postgrestPort ?? (await getFreePort('127.0.0.1')),
    adminPort: overrides.adminPort ?? (await getFreePort('127.0.0.1')),
    postgrestVersion: overrides.postgrestVersion,
    postgrestBin: overrides.postgrestBin,
    schema: overrides.schema,
    dbAnonRole: overrides.dbAnonRole,
    bootstrap: overrides.bootstrap,
    readyTimeoutMs: overrides.readyTimeoutMs,
    logLevel: overrides.logLevel ?? 'error',
    json: overrides.json ?? false,
  });
}

export async function startTestRuntime(overrides: Partial<StartConfig> = {}): Promise<{
  config: StartConfig;
  runtimeManager: RuntimeManager;
  stop: () => Promise<void>;
}> {
  const config = await buildTestConfig(overrides);
  const runtimeManager = new RuntimeManager(
    config,
    new Logger({
      level: config.logLevel,
      json: config.json,
    }),
  );

  await runtimeManager.startCore();
  await runtimeManager.start();

  return {
    config,
    runtimeManager,
    stop: async () => {
      await runtimeManager.stop();
    },
  };
}

export async function runDoctorForTest(options: Record<string, unknown>): Promise<number> {
  return runDoctorCommand(options);
}