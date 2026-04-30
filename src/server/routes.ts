import type { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";

import { CLI_NAME } from "../runtime/packageInfo";
import type { RuntimeManager } from "../runtime/runtimeManager";
import { proxyPostgrestRequest } from "./postgrestProxy";

const HealthResponseSchema = z.object({ status: z.literal("healthy") });
const ReadyResponseSchema = z.object({ ready: z.boolean() });
const MetadataResponseSchema = z.object({
  service: z.string(),
  version: z.string(),
  pgliteVersion: z.string(),
});

export function registerRoutes(app: Hono, runtimeManager: RuntimeManager): void {
  app.get(
    "/",
    describeRoute({
      description: "Service metadata and runtime snapshot.",
      responses: {
        200: {
          description: "Metadata object",
          content: {
            "application/json": {
              schema: resolver(MetadataResponseSchema),
            },
          },
        },
      },
    }),
    async (context) => {
      const snapshot = runtimeManager.getSnapshot();
      return context.json({
        service: CLI_NAME,
        version: snapshot.cliVersion,
        pgliteVersion: snapshot.pgliteVersion ?? "unknown",
      });
    },
  );

  app.get(
    "/health",
    describeRoute({
      description: "Liveness probe. Returns 200 if the HTTP server is running.",
      responses: {
        200: {
          description: "Service is healthy",
          content: {
            "application/json": {
              schema: resolver(HealthResponseSchema),
            },
          },
        },
      },
    }),
    (context) => {
      return context.json({ status: "healthy" });
    },
  );

  app.get(
    "/ready",
    describeRoute({
      description: "Readiness probe. Returns 200 if PGlite, PostgREST, and the HTTP server are all ready.",
      responses: {
        200: {
          description: "Readiness status",
          content: {
            "application/json": {
              schema: resolver(ReadyResponseSchema),
            },
          },
        },
      },
    }),
    async (context) => {
      const readiness = await runtimeManager.getReadiness();
      return context.json({ ready: readiness.ready }, readiness.ready ? 200 : 503);
    },
  );

  app.all("/api", (context) => proxyPostgrestRequest(context, runtimeManager));
  app.all("/api/*", (context) => proxyPostgrestRequest(context, runtimeManager));
}
