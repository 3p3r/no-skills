import fs from "node:fs";
import path from "node:path";
import rc from "rc";

import { CliError } from "./errors";
import { getBundledBootstrapPath } from "./paths";

export interface StartConfig {
  host: string;
  port: number;
  pgPort: number;
  postgrestPort: number;
  adminPort: number;
  postgrestBin?: string;
  schema: string;
  dbAnonRole: string;
  bootstrap: string;
  readyTimeoutMs: number;
  httpEnabled: boolean;
  openapiEnabled: boolean;
  openapiPath: string;
  skillsEnabled: boolean;
}

export interface DoctorConfig {
  host: string;
  port: number;
  pgPort: number;
  postgrestPort: number;
  adminPort: number;
  postgrestBin?: string;
  bootstrap: string;
  json: boolean;
}

type PrimitiveOptions = Record<string, unknown>;

const DEFAULT_START_CONFIG = {
  host: "127.0.0.1",
  port: 8080,
  pgPort: 5432,
  postgrestPort: 3000,
  adminPort: 3001,
  schema: "api",
  dbAnonRole: "anon",
  bootstrap: "sql/bootstrap.sql",
  readyTimeoutMs: 30000,
  httpEnabled: true,
  openapiEnabled: true,
  openapiPath: "/openapi.json",
  skillsEnabled: true,
};

const DEFAULT_DOCTOR_CONFIG = {
  host: "127.0.0.1",
  port: 8080,
  pgPort: 5432,
  postgrestPort: 3000,
  adminPort: 3001,
  bootstrap: "sql/bootstrap.sql",
  json: false,
};

export function resolveStartConfig(options: PrimitiveOptions): StartConfig {
  const config = rc("postgrest-lite", DEFAULT_START_CONFIG);
  const merged = { ...config, ...options };

  const validated: StartConfig = {
    host: readString(merged.host, "host"),
    port: readPort(merged.port, "port"),
    pgPort: readPort(merged.pgPort, "pg-port"),
    postgrestPort: readPort(merged.postgrestPort, "postgrest-port"),
    adminPort: readPort(merged.adminPort, "admin-port"),
    postgrestBin: readOptionalAbsolutePath(merged.postgrestBin, "postgrest-bin"),
    schema: readString(merged.schema, "schema"),
    dbAnonRole: readString(merged.dbAnonRole, "db-anon-role"),
    bootstrap: resolveBootstrapPath(merged.bootstrap),
    readyTimeoutMs: readNonNegativeInteger(merged.readyTimeoutMs, "ready-timeout-ms"),
    httpEnabled: readBoolean(merged.httpEnabled, "http-enabled"),
    openapiEnabled: readBoolean(merged.openapiEnabled, "openapi-enabled"),
    openapiPath: readString(merged.openapiPath, "openapi-path"),
    skillsEnabled: readBoolean(merged.skillsEnabled, "skills-enabled"),
  };

  if (!validated.openapiEnabled && validated.skillsEnabled) {
    const skillsWasExplicitlyEnabled =
      options.skills !== undefined || config.skills !== undefined || process.env.POSTGREST_LITE_SKILLS !== undefined;

    if (skillsWasExplicitlyEnabled) {
      console.warn("WARN: Skills require OpenAPI. Disabling skills.");
    }
    validated.skillsEnabled = false;
  }

  validatePortUniqueness([validated.port, validated.pgPort, validated.postgrestPort, validated.adminPort]);

  return validated;
}

export function resolveDoctorConfig(options: PrimitiveOptions): DoctorConfig {
  const config = rc("postgrest-lite", DEFAULT_DOCTOR_CONFIG);
  const merged = { ...config, ...options };

  const validated: DoctorConfig = {
    host: readString(merged.host, "host"),
    port: readPort(merged.port, "port"),
    pgPort: readPort(merged.pgPort, "pg-port"),
    postgrestPort: readPort(merged.postgrestPort, "postgrest-port"),
    adminPort: readPort(merged.adminPort, "admin-port"),
    postgrestBin: readOptionalAbsolutePath(merged.postgrestBin, "postgrest-bin"),
    bootstrap: resolveBootstrapPath(merged.bootstrap),
    json: readBoolean(merged.json, "json"),
  };

  validatePortUniqueness([validated.port, validated.pgPort, validated.postgrestPort, validated.adminPort]);

  return validated;
}

// --- Helpers ---

function readString(value: unknown, label: string): string {
  const s = String(value ?? "").trim();
  if (!s) {
    throw new CliError(`--${label} cannot be empty.`, 2);
  }
  return s;
}

function readOptionalAbsolutePath(value: unknown, label: string): string | undefined {
  const s = String(value ?? "").trim();
  if (!s) {
    return undefined;
  }
  if (!path.isAbsolute(s)) {
    throw new CliError(`--${label} must be an absolute path.`, 2);
  }
  return s;
}

function readPort(value: unknown, label: string): number {
  return readInteger(value, label, (v) => v >= 1 && v <= 65535, "must be between 1 and 65535");
}

function readNonNegativeInteger(value: unknown, label: string): number {
  return readInteger(value, label, (v) => v >= 0, "must be zero or greater");
}

function readInteger(value: unknown, label: string, predicate: (v: number) => boolean, message: string): number {
  const num = Number(value);
  if (!Number.isInteger(num) || !predicate(num)) {
    throw new CliError(`--${label} ${message}.`, 2);
  }
  return num;
}

function readBoolean(value: unknown, label: string): boolean {
  if (typeof value === "boolean") return value;
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  if (["1", "true", "yes", "on"].includes(s)) return true;
  if (["0", "false", "no", "off"].includes(s)) return false;
  if (s === "") return false;
  throw new CliError(`--${label} must be a boolean value.`, 2);
}

function resolveBootstrapPath(value: unknown): string {
  const raw = value ?? getBundledBootstrapPath();
  const resolved = path.resolve(String(raw));
  if (!fs.existsSync(resolved)) {
    throw new CliError(`Bootstrap SQL file does not exist: ${resolved}`, 2);
  }
  return resolved;
}

function validatePortUniqueness(ports: number[]): void {
  const seen = new Set<number>();
  for (const port of ports) {
    if (seen.has(port)) {
      throw new CliError("Configured ports must all be distinct.", 2);
    }
    seen.add(port);
  }
}
