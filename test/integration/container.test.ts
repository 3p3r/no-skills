import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

import { getFreePort } from '../../src/runtime/network';

const dockerAvailable = spawnSync('docker', ['version'], { stdio: 'ignore' }).status === 0;

describe.skipIf(!dockerAvailable)('docker workflow', () => {
  const containers: string[] = [];
  const images: string[] = [];

  afterEach(() => {
    while (containers.length > 0) {
      const container = containers.pop();
      if (container) {
        spawnSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
      }
    }
    while (images.length > 0) {
      const image = images.pop();
      if (image) {
        spawnSync('docker', ['rmi', '-f', image], { stdio: 'ignore' });
      }
    }
  });

  it('builds and serves the local Docker image', async () => {
    const image = `postgrest-lite:test-${randomUUID()}`;
    images.push(image);

    const build = spawnSync('docker', ['build', '-t', image, '.'], {
      cwd: process.cwd(),
      stdio: 'inherit',
    });
    expect(build.status).toBe(0);

    const hostPort = await getFreePort('127.0.0.1');
    const run = spawnSync('docker', ['run', '-d', '-p', `${hostPort}:8080`, image], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    expect(run.status).toBe(0);
    const containerId = run.stdout.trim();
    containers.push(containerId);

    await waitForHttp(`http://127.0.0.1:${hostPort}/ready`, 120000);
    const response = await fetch(`http://127.0.0.1:${hostPort}/api/todos`);
    expect(response.status).toBe(200);
  }, 300000);
});

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // keep trying
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}