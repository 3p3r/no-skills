import { afterEach, describe, expect, it } from 'vitest';

import { startTestRuntime } from '../helpers/runtime';

describe.sequential('proxy behavior', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('creates and reads rows through /api/*', async () => {
    const runtime = await startTestRuntime();
    cleanups.push(runtime.stop);

    const createResponse = await fetch(`http://${runtime.config.host}:${runtime.config.port}/api/todos`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        prefer: 'return=representation',
      },
      body: JSON.stringify({ title: 'write tests', done: false }),
    });

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(Array.isArray(created)).toBe(true);
    expect(created[0].title).toBe('write tests');

    const listResponse = await fetch(`http://${runtime.config.host}:${runtime.config.port}/api/todos?select=title,done&order=id.desc&limit=1`);
    expect(listResponse.status).toBe(200);
    expect(listResponse.headers.get('content-range')).toBeTruthy();
    const rows = await listResponse.json();
    expect(rows[0]).toMatchObject({ title: 'write tests', done: false });

    const rpcResponse = await fetch(`http://${runtime.config.host}:${runtime.config.port}/api/rpc/hello`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    expect(rpcResponse.status).toBe(200);
    expect(await rpcResponse.json()).toMatchObject({ message: 'hello from postgrest-lite' });
  }, 120000);
});