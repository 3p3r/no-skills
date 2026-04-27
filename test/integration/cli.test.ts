import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

import { getFreePort } from '../../src/runtime/network';

describe.sequential('cli contract', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    while (temporaryDirectories.length > 0) {
      const directory = temporaryDirectories.pop();
      if (directory) {
        await fs.promises.rm(directory, { recursive: true, force: true });
      }
    }
  });

  it('prints versions, downloads the binary, validates with doctor, and shuts down cleanly on SIGINT', async () => {
    const versionResult = spawnSync('node', ['bin/postgrest-lite.js', 'version'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    expect(versionResult.status).toBe(0);
    expect(versionResult.stdout).toContain('postgrest-lite 0.1.0');
    expect(versionResult.stdout).toContain('postgrest 14.10');

    const downloadDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'postgrest-lite-download-'));
    temporaryDirectories.push(downloadDirectory);
    const downloadResult = spawnSync('node', ['bin/postgrest-lite.js', 'download', '--postgrest-bin-dir', downloadDirectory], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    expect(downloadResult.status).toBe(0);
    const binaryPath = downloadResult.stdout.trim();
    expect(binaryPath).toBe(path.join(downloadDirectory, 'postgrest'));
    expect(fs.existsSync(binaryPath)).toBe(true);

    const port = await getFreePort('127.0.0.1');
    const pgPort = await getFreePort('127.0.0.1');
    const postgrestPort = await getFreePort('127.0.0.1');
    const adminPort = await getFreePort('127.0.0.1');

    const doctorResult = spawnSync(
      'node',
      [
        'bin/postgrest-lite.js',
        'doctor',
        '--port',
        String(port),
        '--pg-port',
        String(pgPort),
        '--postgrest-port',
        String(postgrestPort),
        '--admin-port',
        String(adminPort),
        '--postgrest-bin',
        binaryPath,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );
    expect(doctorResult.status).toBe(0);
    expect(doctorResult.stdout).toContain('binary: ok');

    const child = spawn(
      'node',
      [
        'bin/postgrest-lite.js',
        'start',
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--pg-port',
        String(pgPort),
        '--postgrest-port',
        String(postgrestPort),
        '--admin-port',
        String(adminPort),
        '--postgrest-bin',
        binaryPath,
        '--log-level',
        'error',
      ],
      {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    await waitForHttp(`http://127.0.0.1:${port}/ready`, 120000);
    child.kill('SIGINT');
    const [code, signal] = (await once(child, 'exit')) as [number | null, NodeJS.Signals | null];
    expect(code).toBe(0);
    expect(signal).toBeNull();
    expect(stderr).toBe('');
    expect(stdout).toContain('postgrest-lite is ready');
  }, 120000);
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
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}