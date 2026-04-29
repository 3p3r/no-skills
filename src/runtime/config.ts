import fs from 'node:fs';
import path from 'node:path';

import { CliError } from './errors';
import { LogLevel } from './logger';
import { getBundledBootstrapPath, getDefaultBinaryCacheDir } from './paths';
import { DEFAULT_POSTGREST_VERSION } from './packageInfo';

export interface StartConfig {
  host: string;
  port: number;
  pgPort: number;
  postgrestPort: number;
  adminPort: number;
  postgrestVersion: string;
  postgrestBin?: string;
  schema: string;
  dbAnonRole: string;
  bootstrap: string;
  readyTimeoutMs: number;
  logLevel: LogLevel;
  json: boolean;
  httpEnabled: boolean;
  openapiEnabled: boolean;
  openapiPath: string;
  skillsEnabled: boolean;
}

export interface DownloadConfig {
  postgrestVersion: string;
  postgrestBinDir: string;
  force: boolean;
}

export interface DoctorConfig {
  host: string;
  port: number;
  pgPort: number;
  postgrestPort: number;
  adminPort: number;
  postgrestVersion: string;
  postgrestBin?: string;
  bootstrap: string;
  json: boolean;
}

type PrimitiveOptions = Record<string, unknown>;

export function resolveStartConfig(options: PrimitiveOptions): StartConfig {
  const httpEnabled = readBoolean(options.http, process.env.POSTGREST_LITE_HTTP, true);
  const openapiEnabled = readBoolean(options.openapi, process.env.POSTGREST_LITE_OPENAPI, true);
  let skillsEnabled = readBoolean(options.skills, process.env.POSTGREST_LITE_SKILLS, true);

  if (!openapiEnabled && skillsEnabled) {
    if (
      options.skills === true ||
      options.skills === 'true' ||
      (process.env.POSTGREST_LITE_SKILLS !== undefined &&
        ['1', 'true', 'yes', 'on'].includes(process.env.POSTGREST_LITE_SKILLS.toLowerCase()))
    ) {
      // eslint-disable-next-line no-console
      console.warn('WARN: Skills require OpenAPI. Disabling skills.');
    }
    skillsEnabled = false;
  }

  const config: StartConfig = {
    host: readString(options.host, process.env.POSTGREST_LITE_HOST, '127.0.0.1'),
    port: readPort(options.port, process.env.POSTGREST_LITE_PORT, 8080, 'port'),
    pgPort: readPort(options.pgPort, process.env.POSTGREST_LITE_PG_PORT, 5432, 'pg-port'),
    postgrestPort: readPort(options.postgrestPort, process.env.POSTGREST_LITE_POSTGREST_PORT, 3000, 'postgrest-port'),
    adminPort: readPort(options.adminPort, process.env.POSTGREST_LITE_ADMIN_PORT, 3001, 'admin-port'),
    postgrestVersion: readString(options.postgrestVersion, process.env.POSTGREST_LITE_POSTGREST_VERSION, DEFAULT_POSTGREST_VERSION),
    postgrestBin: readOptionalAbsolutePath(options.postgrestBin, process.env.POSTGREST_LITE_POSTGREST_BIN, 'postgrest-bin'),
    schema: readString(options.schema, process.env.POSTGREST_LITE_SCHEMA, 'api'),
    dbAnonRole: readString(options.dbAnonRole, process.env.POSTGREST_LITE_DB_ANON_ROLE, 'anon'),
    bootstrap: resolveBootstrapPath(options.bootstrap, process.env.POSTGREST_LITE_BOOTSTRAP),
    readyTimeoutMs: readNonNegativeInteger(options.readyTimeoutMs, process.env.POSTGREST_LITE_READY_TIMEOUT_MS, 30000, 'ready-timeout-ms'),
    logLevel: readLogLevel(options.logLevel, process.env.POSTGREST_LITE_LOG_LEVEL, 'info'),
    json: readBoolean(options.json, process.env.POSTGREST_LITE_JSON, false),
    httpEnabled,
    openapiEnabled,
    openapiPath: readString(options.openapiPath, process.env.POSTGREST_LITE_OPENAPI_PATH, '/openapi.json'),
    skillsEnabled,
  };

  validatePortUniqueness([config.port, config.pgPort, config.postgrestPort, config.adminPort]);
  return config;
}

export function resolveDownloadConfig(options: PrimitiveOptions): DownloadConfig {
  return {
    postgrestVersion: readString(options.postgrestVersion, process.env.POSTGREST_LITE_POSTGREST_VERSION, DEFAULT_POSTGREST_VERSION),
    postgrestBinDir: path.resolve(readString(options.postgrestBinDir, undefined, getDefaultBinaryCacheDir())),
    force: readBoolean(options.force, undefined, false),
  };
}

export function resolveDoctorConfig(options: PrimitiveOptions): DoctorConfig {
  const config: DoctorConfig = {
    host: readString(options.host, process.env.POSTGREST_LITE_HOST, '127.0.0.1'),
    port: readPort(options.port, process.env.POSTGREST_LITE_PORT, 8080, 'port'),
    pgPort: readPort(options.pgPort, process.env.POSTGREST_LITE_PG_PORT, 5432, 'pg-port'),
    postgrestPort: readPort(options.postgrestPort, process.env.POSTGREST_LITE_POSTGREST_PORT, 3000, 'postgrest-port'),
    adminPort: readPort(options.adminPort, process.env.POSTGREST_LITE_ADMIN_PORT, 3001, 'admin-port'),
    postgrestVersion: readString(options.postgrestVersion, process.env.POSTGREST_LITE_POSTGREST_VERSION, DEFAULT_POSTGREST_VERSION),
    postgrestBin: readOptionalAbsolutePath(options.postgrestBin, process.env.POSTGREST_LITE_POSTGREST_BIN, 'postgrest-bin'),
    bootstrap: resolveBootstrapPath(options.bootstrap, process.env.POSTGREST_LITE_BOOTSTRAP),
    json: readBoolean(options.json, process.env.POSTGREST_LITE_JSON, false),
  };

  validatePortUniqueness([config.port, config.pgPort, config.postgrestPort, config.adminPort]);
  return config;
}

function readString(flagValue: unknown, envValue: string | undefined, defaultValue: string): string {
  const raw = firstDefined(flagValue, envValue, defaultValue);
  const value = String(raw).trim();
  if (!value) {
    throw new CliError('String configuration values cannot be empty.', 2);
  }
  return value;
}

function readOptionalAbsolutePath(flagValue: unknown, envValue: string | undefined, label: string): string | undefined {
  const raw = firstDefined(flagValue, envValue);
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }

  const value = String(raw).trim();
  if (!path.isAbsolute(value)) {
    throw new CliError(`--${label} must be an absolute path.`, 2);
  }
  return value;
}

function resolveBootstrapPath(flagValue: unknown, envValue: string | undefined): string {
  const raw = firstDefined(flagValue, envValue, getBundledBootstrapPath());
  const resolved = path.resolve(String(raw));
  if (!fs.existsSync(resolved)) {
    throw new CliError(`Bootstrap SQL file does not exist: ${resolved}`, 2);
  }
  return resolved;
}

function readPort(flagValue: unknown, envValue: string | undefined, defaultValue: number, label: string): number {
  return readInteger(flagValue, envValue, defaultValue, label, (value) => value >= 1 && value <= 65535, 'must be between 1 and 65535');
}

function readNonNegativeInteger(flagValue: unknown, envValue: string | undefined, defaultValue: number, label: string): number {
  return readInteger(flagValue, envValue, defaultValue, label, (value) => value >= 0, 'must be zero or greater');
}

function readInteger(
  flagValue: unknown,
  envValue: string | undefined,
  defaultValue: number,
  label: string,
  predicate: (value: number) => boolean,
  message: string,
): number {
  const raw = firstDefined(flagValue, envValue, defaultValue);
  const value = Number(raw);
  if (!Number.isInteger(value) || !predicate(value)) {
    throw new CliError(`--${label} ${message}.`, 2);
  }
  return value;
}

function readLogLevel(flagValue: unknown, envValue: string | undefined, defaultValue: LogLevel): LogLevel {
  const value = readString(flagValue, envValue, defaultValue);
  if (value === 'debug' || value === 'info' || value === 'warn' || value === 'error') {
    return value;
  }
  throw new CliError('--log-level must be one of debug, info, warn, or error.', 2);
}

function readBoolean(flagValue: unknown, envValue: string | undefined, defaultValue: boolean): boolean {
  const raw = firstDefined(flagValue, envValue, defaultValue);
  if (typeof raw === 'boolean') {
    return raw;
  }
  const value = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(value)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(value)) {
    return false;
  }
  throw new CliError('Boolean configuration values must be true/false.', 2);
}

function firstDefined(...values: Array<unknown>): unknown {
  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function validatePortUniqueness(ports: number[]): void {
  const seen = new Set<number>();
  for (const port of ports) {
    if (seen.has(port)) {
      throw new CliError('Configured ports must all be distinct.', 2);
    }
    seen.add(port);
  }
}