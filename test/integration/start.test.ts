import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_POSTGREST_VERSION } from '../../src/runtime/packageInfo';
import { startTestRuntime } from '../helpers/runtime';

describe.sequential('runtime startup', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('starts and reports readiness through Hono', async () => {
    const runtime = await startTestRuntime();
    cleanups.push(runtime.stop);

    const readyResponse = await fetch(`http://${runtime.config.host}:${runtime.config.port}/ready`);
    expect(readyResponse.status).toBe(200);
    expect(await readyResponse.json()).toMatchObject({
      ready: true,
      pgliteReachable: true,
      postgrestReady: true,
    });

    const rootResponse = await fetch(`http://${runtime.config.host}:${runtime.config.port}/`);
    expect(rootResponse.status).toBe(200);
    const rootPayload = await rootResponse.json();
    expect(rootPayload.versions.postgrest).toBe(DEFAULT_POSTGREST_VERSION);
    expect(rootPayload.ready).toBe(true);
  }, 120000);
});