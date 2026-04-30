import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runDoctorCommand } from "../../src/cli/commands/doctor";
import { resolveStartConfig, type StartConfig } from "../../src/runtime/config";
import { createLogger } from "../../src/runtime/logger";
import { getFreePort } from "../../src/runtime/network";
import { RuntimeManager } from "../../src/runtime/runtimeManager";

export function findPostgrestBinary(): string | undefined {
  // Check env var first
  if (process.env.POSTGREST_LITE_POSTGREST_BIN) {
    return process.env.POSTGREST_LITE_POSTGREST_BIN;
  }
  // Check common paths
  const candidates = [
    "/usr/local/bin/postgrest",
    "/usr/bin/postgrest",
    path.join(os.homedir(), ".cache", "postgrest-lite", "linux-x64", "postgrest"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export async function buildTestConfig(overrides: Partial<StartConfig> = {}): Promise<StartConfig> {
  const host = overrides.host ?? "127.0.0.1";
  const binary = overrides.postgrestBin ?? findPostgrestBinary();

  return resolveStartConfig({
    host,
    port: overrides.port ?? (await getFreePort(host)),
    pgPort: overrides.pgPort ?? (await getFreePort("127.0.0.1")),
    postgrestPort: overrides.postgrestPort ?? (await getFreePort("127.0.0.1")),
    adminPort: overrides.adminPort ?? (await getFreePort("127.0.0.1")),
    postgrestBin: binary,
    schema: overrides.schema ?? "api",
    dbAnonRole: overrides.dbAnonRole ?? "anon",
    bootstrap: overrides.bootstrap,
    readyTimeoutMs: overrides.readyTimeoutMs,
    httpEnabled: overrides.httpEnabled ?? true,
    openapiEnabled: overrides.openapiEnabled ?? true,
    openapiPath: overrides.openapiPath ?? "/",
    skillsEnabled: overrides.skillsEnabled ?? false,
  });
}

export async function startTestRuntime(overrides: Partial<StartConfig> = {}): Promise<{
  config: StartConfig;
  runtimeManager: RuntimeManager;
  stop: () => Promise<void>;
}> {
  const config = await buildTestConfig(overrides);
  const runtimeManager = new RuntimeManager(config, createLogger("postgrest-lite"));

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
