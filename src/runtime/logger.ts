import debugLib from "debug";

export function createLogger(namespace: string) {
  return debugLib(namespace);
}

export const log = createLogger("postgrest-lite");
export const startLog = createLogger("postgrest-lite:start");
export const runtimeLog = createLogger("postgrest-lite:runtime");
export const pgliteLog = createLogger("postgrest-lite:pglite");
export const postgrestLog = createLogger("postgrest-lite:postgrest");
