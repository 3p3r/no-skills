import { afterEach, describe, expect, it } from "vitest";

import { startTestRuntime, findPostgrestBinary } from "../helpers/runtime";

describe.sequential("runtime startup", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  describe.skipIf(!findPostgrestBinary())("binary-dependent tests", () => {
    it("starts and reports readiness through Hono", async () => {
      const runtime = await startTestRuntime();
      cleanups.push(runtime.stop);

      const readyResponse = await fetch(`http://${runtime.config.host}:${runtime.config.port}/ready`);
      expect(readyResponse.status).toBe(200);
      expect(await readyResponse.json()).toEqual({
        ready: true,
      });

      const rootResponse = await fetch(`http://${runtime.config.host}:${runtime.config.port}/`);
      expect(rootResponse.status).toBe(200);
      const rootPayload = await rootResponse.json();
      expect(rootPayload.postgrestVersion).toBe("14.10");
      expect(rootPayload.service).toBe("postgrest-lite");
    }, 120000);
  });
});
