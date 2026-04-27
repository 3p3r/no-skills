import fs from 'node:fs';

import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

import { Logger } from './logger';

export interface PGliteRuntime {
  db: PGlite;
  socketServer: PGLiteSocketServer;
  host: string;
  port: number;
  bootstrapPath: string;
  isRunning(): boolean;
  stop(): Promise<void>;
}

export async function startPGliteRuntime(options: {
  pgPort: number;
  bootstrapPath: string;
  logger: Logger;
}): Promise<PGliteRuntime> {
  const logger = options.logger.child('pglite');
  const sql = await fs.promises.readFile(options.bootstrapPath, 'utf8');
  const db = await PGlite.create();

  logger.info('Running bootstrap SQL', { bootstrapPath: options.bootstrapPath });
  await db.exec(sql);

  const socketServer = new PGLiteSocketServer({
    db,
    host: '127.0.0.1',
    port: options.pgPort,
    maxConnections: 10,
  });
  await socketServer.start();

  let running = true;

  return {
    db,
    socketServer,
    host: '127.0.0.1',
    port: options.pgPort,
    bootstrapPath: options.bootstrapPath,
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