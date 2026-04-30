import fs from "node:fs";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import type { createLogger } from "./logger";

export interface PGliteRuntime {
  db: PGlite;
  socketServer: PGLiteSocketServer;
  host: string;
  port: number;
  bootstrapPath: string;
  pgliteVersion: string;
  isRunning(): boolean;
  stop(): Promise<void>;
}

export async function startPGliteRuntime(options: {
  pgPort: number;
  bootstrapPath: string;
  logger: ReturnType<typeof createLogger>;
}): Promise<PGliteRuntime> {
  const logger = options.logger.extend("pglite");
  const sql = await fs.promises.readFile(options.bootstrapPath, "utf8");
  const db = await PGlite.create();

  logger(`Running bootstrap SQL (bootstrapPath: ${options.bootstrapPath})`);
  await db.exec(sql);

  const socketServer = new PGLiteSocketServer({
    db,
    host: "127.0.0.1",
    port: options.pgPort,
    maxConnections: 10,
  });
  await socketServer.start();

  let running = true;

  return {
    db,
    socketServer,
    host: "127.0.0.1",
    port: options.pgPort,
    bootstrapPath: options.bootstrapPath,
    pgliteVersion: (db as any).version ?? "unknown",
    isRunning: () => running && db.ready && !db.closed,
    stop: async () => {
      if (!running) {
        return;
      }
      running = false;
      await socketServer.stop();
      await db.close();
    },
  };
}
