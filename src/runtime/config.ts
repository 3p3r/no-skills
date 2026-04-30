import fs from "node:fs";
import path from "node:path";
import rc from "rc";

import { CliError } from "./errors";
import { getBundledBootstrapPath } from "./paths";
import { allocatePorts } from "./network.js";

export const SCHEMA = "api";
export const ANON_ROLE = "anon";
export const READY_TIMEOUT_MS = 30000;
export const OPENAPI_PATH = "/openapi.json";

export interface StartConfig {
  host: string;
  port: number;
  pgPort: number;
  postgrestPort: number;
  adminPort: number;
  postgrestBin?: string;
  bootstrap: string;
  httpEnabled: boolean;
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
  bootstrap: "sql/bootstrap.sql",
  httpEnabled: true,
};

const DEFAULT_DOCTOR_CONFIG = {
  host: "127.0.0.1",
  port: 8080,
  bootstrap: "sql/bootstrap.sql",
  json: false,
};

export async function resolveStartConfig(options: PrimitiveOptions): Promise<StartConfig> {
  const config = rc("postgrest-lite", DEFAULT_START_CONFIG);
  const merged = { ...config, ...options };

  const host = readString(merged.host, "host");
  const port = readPort(merged.port, "port");
  const [pgPort, postgrestPort, adminPort] = await allocatePorts(host, 3);

  const validated: StartConfig = {
    host,
    port,
    pgPort,
    postgrestPort,
    adminPort,
    postgrestBin: readOptionalAbsolutePath(merged.postgrestBin, "postgrest-bin"),
    bootstrap: resolveBootstrapPath(merged.bootstrap),
    httpEnabled: readBoolean(merged.httpEnabled, "http-enabled"),
  };

  validatePortUniqueness([validated.port, validated.pgPort, validated.postgrestPort, validated.adminPort]);

  return validated;
}

export async function resolveDoctorConfig(options: PrimitiveOptions): Promise<DoctorConfig> {
  const config = rc("postgrest-lite", DEFAULT_DOCTOR_CONFIG);
  const merged = { ...config, ...options };

  const host = readString(merged.host, "host");
  const port = readPort(merged.port, "port");
  const [pgPort, postgrestPort, adminPort] = await allocatePorts(host, 3);

  const validated: DoctorConfig = {
    host,
    port,
    pgPort,
    postgrestPort,
    adminPort,
    postgrestBin: readOptionalAbsolutePath(merged.postgrestBin, "postgrest-bin"),
    bootstrap: resolveBootstrapPath(merged.bootstrap),
    json: readBoolean(merged.json, "json"),
  };

  validatePortUniqueness([validated.port, validated.pgPort, validated.postgrestPort, validated.adminPort]);

  return validated;
}

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
