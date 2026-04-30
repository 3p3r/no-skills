import type { Hono } from "hono";
import { generateSpecs } from "hono-openapi";
import { merge, isErrorResult } from "openapi-merge";
import type { OpenAPIV3 } from "openapi-types";
import { serve } from "@hono/node-server";

import type { StartConfig } from "./config";
import { OPENAPI_PATH } from "./config";
import { CliError } from "./errors";
import type { createLogger } from "./logger";
import { isTcpEndpointReachable } from "./network";
import { type PGliteRuntime, startPGliteRuntime } from "./pglite";
import { type PostgrestRuntime, startPostgrestRuntime } from "./postgrest";
import { createApp } from "../server/app";
import { serveSkillsHandler } from "../server/skills";
import { CLI_VERSION } from "./packageInfo";
import packageJson from "../../package.json";

export class RuntimeManager {
  private readonly config: StartConfig;
  private readonly logger: ReturnType<typeof createLogger>;
  private pgliteRuntime?: PGliteRuntime;
  private postgrestRuntime?: PostgrestRuntime;
  private httpServer?: ManagedHttpServer;
  private stopPromise?: Promise<void>;
  private app?: Hono;
  private mergedSpec?: OpenAPIV3.Document;

  constructor(config: StartConfig, logger: ReturnType<typeof createLogger>) {
    this.config = config;
    this.logger = logger.extend("runtime");
  }

  async startCore(): Promise<void> {
    this.pgliteRuntime = await startPGliteRuntime({
      pgPort: this.config.pgPort,
      bootstrapPath: this.config.bootstrap,
      logger: this.logger,
    });

    if (!this.config.postgrestBin) {
      throw new CliError(
        "PostgREST binary path is required. Provide it with --postgrest-bin or POSTGREST_LITE_POSTGREST_BIN.",
        1,
      );
    }

    this.postgrestRuntime = await startPostgrestRuntime({
      binaryPath: this.config.postgrestBin,
      pgPort: this.config.pgPort,
      postgrestPort: this.config.postgrestPort,
      adminPort: this.config.adminPort,
      logger: this.logger,
    });
  }

  async start(): Promise<void> {
    if (!this.config.httpEnabled) {
      return;
    }

    this.app = createApp(this);
    await this.generateOpenApiSpec(this.app);
    await this.generateSkills();

    if (this.mergedSpec) {
      this.app.get(OPENAPI_PATH, (c) => c.json(this.mergedSpec));
    }

    this.app.get("/skills/*", serveSkillsHandler);

    const server = serve({
      fetch: this.app.fetch,
      port: this.config.port,
      hostname: this.config.host,
    });
    this.httpServer = server as ManagedHttpServer;

    await new Promise<void>((resolve, reject) => {
      server.once("listening", () => resolve());
      server.once("error", reject);
    });
  }

  registerHttpServer(server: ManagedHttpServer): void {
    this.httpServer = server;
  }

  private async fetchPostgrestOpenApi(): Promise<OpenAPIV3.Document | undefined> {
    try {
      const res = await fetch(`http://127.0.0.1:${this.config.postgrestPort}/`, {
        headers: { Accept: "application/openapi+json" },
      });
      if (!res.ok) {
        this.logger(`PostgREST OpenAPI fetch failed: ${res.status} ${res.statusText}`);
        return undefined;
      }
      return (await res.json()) as OpenAPIV3.Document;
    } catch (e) {
      this.logger(`PostgREST OpenAPI fetch error: ${e}`);
      return undefined;
    }
  }

  private async generateOpenApiSpec(app: Hono): Promise<void> {
    const honoSpec = await generateSpecs(app, {
      documentation: {
        info: {
          title: "postgrest-lite",
          version: packageJson.version,
          description: "API documentation for postgrest-lite",
        },
        servers: [
          {
            url: `http://${this.config.host}:${this.config.port}`,
            description: "Hono server",
          },
        ],
      },
    });

    const postgrestSpec = await this.fetchPostgrestOpenApi();

    if (postgrestSpec) {
      type MergeOas = Parameters<typeof merge>[0][number]["oas"];
      const mergeResult = merge([
        { oas: honoSpec as unknown as MergeOas },
        { oas: postgrestSpec as unknown as MergeOas, pathModification: { prepend: "/api" } },
      ]);

      if (isErrorResult(mergeResult)) {
        this.logger(`OpenAPI merge failed: ${mergeResult.message}. Serving Hono spec only.`);
        this.mergedSpec = { ...honoSpec, openapi: "3.0.0" } as OpenAPIV3.Document;
      } else {
        this.mergedSpec = mergeResult.output as OpenAPIV3.Document;
        this.mergedSpec.openapi = "3.0.0";
      }
    } else {
      this.logger("PostgREST spec unavailable. Serving Hono spec only.");
      this.mergedSpec = { ...honoSpec, openapi: "3.0.0" } as OpenAPIV3.Document;
    }
  }

  private async generateSkills(): Promise<void> {
    if (!this.mergedSpec) return;

    const { convertOpenAPIToSkill } = await import("openapi-to-skills");
    const { configure, InMemory } = await import("@zenfs/core");
    const { writeFile, mkdir } = await import("@zenfs/core/promises");

    await configure({
      mounts: {
        "/skillfiles": { backend: InMemory, label: "skills-storage" },
      },
    });

    const zenFSWriter = {
      async writeFile(path: string, content: string): Promise<void> {
        await writeFile(path, content, "utf-8");
      },
      async mkdir(dirPath: string): Promise<void> {
        await mkdir(dirPath, { recursive: true });
      },
    };

    try {
      await convertOpenAPIToSkill(this.mergedSpec, {
        outputDir: "/skillfiles",
        parser: { skillName: "api" },
        writer: zenFSWriter,
      });
      this.logger("Skills generated in memory.");
    } catch (e) {
      this.logger(`Skills generation failed: ${e}`);
    }
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
    pgliteVersion: string;
    host: string;
    port: number;
    pgPort: number;
    postgrestPort: number;
    adminPort: number;
    postgrestBinaryPath?: string;
    postgrestRunning: boolean;
    postgrestReady: boolean;
    pgliteRunning: boolean;
    httpServerListening: boolean;
  } {
    return {
      cliVersion: CLI_VERSION,
      pgliteVersion: this.pgliteRuntime?.pgliteVersion ?? "unknown",
      host: this.config.host,
      port: this.config.port,
      pgPort: this.config.pgPort,
      postgrestPort: this.config.postgrestPort,
      adminPort: this.config.adminPort,
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
    const pgliteReachable = await isTcpEndpointReachable("127.0.0.1", this.config.pgPort, 500);
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
      const response = await fetch(`${this.postgrestRuntime.adminUrl}/ready`, { redirect: "manual" });
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
