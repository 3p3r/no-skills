import { Hono } from "hono";

import type { RuntimeManager } from "../runtime/runtimeManager";
import { registerRoutes } from "./routes";

export function createApp(runtimeManager: RuntimeManager): Hono {
  const app = new Hono();
  registerRoutes(app, runtimeManager);

  app.onError((error, context) => {
    return context.json(
      {
        error: error.message,
      },
      500,
    );
  });

  return app;
}
