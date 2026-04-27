import { StartConfig } from './config';
import { ensurePostgrestBinary } from './postgrestBinary';
import { Logger } from './logger';
import { isTcpEndpointReachable } from './network';
import { CLI_VERSION } from './packageInfo';
import { PGliteRuntime, startPGliteRuntime } from './pglite';
import { PostgrestRuntime, startPostgrestRuntime } from './postgrest';

export class RuntimeManager {
  private readonly config: StartConfig;
  private readonly logger: Logger;
  private pgliteRuntime?: PGliteRuntime;
  private postgrestRuntime?: PostgrestRuntime;
  private httpServer?: ManagedHttpServer;
  private stopPromise?: Promise<void>;

  constructor(config: StartConfig, logger: Logger) {
    this.config = config;
    this.logger = logger.child('runtime');
  }

  async startCore(): Promise<void> {
    const binaryPath = await ensurePostgrestBinary({
      version: this.config.postgrestVersion,
      overridePath: this.config.postgrestBin,
      logger: this.logger,
    });

    this.pgliteRuntime = await startPGliteRuntime({
      pgPort: this.config.pgPort,
      bootstrapPath: this.config.bootstrap,
      logger: this.logger,
    });

    this.postgrestRuntime = await startPostgrestRuntime({
      binaryPath,
      pgPort: this.config.pgPort,
      schema: this.config.schema,
      dbAnonRole: this.config.dbAnonRole,
      postgrestPort: this.config.postgrestPort,
      adminPort: this.config.adminPort,
      logLevel: this.config.logLevel,
      readyTimeoutMs: this.config.readyTimeoutMs,
      logger: this.logger,
    });
  }

  registerHttpServer(server: ManagedHttpServer): void {
    this.httpServer = server;
  }

  async stop(): Promise<void> {
    if (this.stopPromise) {
      return this.stopPromise;
    }

    this.stopPromise = (async () => {
      await this.closeHttpServer();
      if (this.postgrestRuntime) {
        await this.postgrestRuntime.stop();
      }
      if (this.pgliteRuntime) {
        await this.pgliteRuntime.stop();
      }
    })();

    await this.stopPromise;
  }

  getConfig(): StartConfig {
    return this.config;
  }

  getSnapshot(): {
    cliVersion: string;
    postgrestVersion: string;
    host: string;
    port: number;
    pgPort: number;
    postgrestPort: number;
    adminPort: number;
    schema: string;
    dbAnonRole: string;
    postgrestBinaryPath?: string;
    postgrestRunning: boolean;
    postgrestReady: boolean;
    pgliteRunning: boolean;
    httpServerListening: boolean;
  } {
    return {
      cliVersion: CLI_VERSION,
      postgrestVersion: this.config.postgrestVersion,
      host: this.config.host,
      port: this.config.port,
      pgPort: this.config.pgPort,
      postgrestPort: this.config.postgrestPort,
      adminPort: this.config.adminPort,
      schema: this.config.schema,
      dbAnonRole: this.config.dbAnonRole,
      postgrestBinaryPath: this.postgrestRuntime?.binaryPath,
      postgrestRunning: this.postgrestRuntime?.isRunning() ?? false,
      postgrestReady: this.postgrestRuntime?.isReady() ?? false,
      pgliteRunning: this.pgliteRuntime?.isRunning() ?? false,
      httpServerListening: Boolean(this.httpServer?.listening),
    };
  }

  async getReadiness(): Promise<{
    ready: boolean;
    pgliteReachable: boolean;
    postgrestReady: boolean;
    httpServerListening: boolean;
  }> {
    const pgliteReachable = await isTcpEndpointReachable('127.0.0.1', this.config.pgPort, 500);
    const postgrestReady = await this.checkPostgrestReady();

    return {
      ready: pgliteReachable && postgrestReady && Boolean(this.httpServer?.listening),
      pgliteReachable,
      postgrestReady,
      httpServerListening: Boolean(this.httpServer?.listening),
    };
  }

  getPostgrestBaseUrl(): string {
    return `http://127.0.0.1:${this.config.postgrestPort}`;
  }

  private async checkPostgrestReady(): Promise<boolean> {
    if (!this.postgrestRuntime?.isRunning()) {
      return false;
    }
    try {
      const response = await fetch(`${this.postgrestRuntime.adminUrl}/ready`, { redirect: 'manual' });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async closeHttpServer(): Promise<void> {
    if (!this.httpServer?.listening) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.httpServer?.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

export interface ManagedHttpServer {
  listening: boolean;
  close(callback: (error?: Error) => void): void;
}