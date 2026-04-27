import fs from 'node:fs';

import { resolveDoctorConfig } from '../../runtime/config';
import { CliError } from '../../runtime/errors';
import { isPortFree } from '../../runtime/network';
import { ensurePostgrestBinary } from '../../runtime/postgrestBinary';

export async function runDoctorCommand(options: Record<string, unknown>): Promise<number> {
  try {
    const config = resolveDoctorConfig(options);
    const binaryPath = await ensurePostgrestBinary({
      version: config.postgrestVersion,
      overridePath: config.postgrestBin,
    });
    const bootstrapReadable = await fs.promises
      .access(config.bootstrap, fs.constants.R_OK)
      .then(() => true)
      .catch(() => false);

    const portResults = await Promise.all([
      isPortFree(config.host, config.port),
      isPortFree('127.0.0.1', config.pgPort),
      isPortFree('127.0.0.1', config.postgrestPort),
      isPortFree('127.0.0.1', config.adminPort),
    ]);

    const result = {
      ok: bootstrapReadable && portResults.every(Boolean),
      binary: {
        ok: true,
        path: binaryPath,
      },
      bootstrap: {
        ok: bootstrapReadable,
        path: config.bootstrap,
      },
      ports: {
        hono: {
          ok: portResults[0],
          host: config.host,
          port: config.port,
        },
        postgresWire: {
          ok: portResults[1],
          host: '127.0.0.1',
          port: config.pgPort,
        },
        postgrest: {
          ok: portResults[2],
          host: '127.0.0.1',
          port: config.postgrestPort,
        },
        admin: {
          ok: portResults[3],
          host: '127.0.0.1',
          port: config.adminPort,
        },
      },
    };

    if (config.json) {
      console.log(JSON.stringify(result));
    } else {
      console.log(`binary: ${result.binary.ok ? 'ok' : 'failed'} ${result.binary.path}`);
      console.log(`bootstrap: ${result.bootstrap.ok ? 'ok' : 'failed'} ${result.bootstrap.path}`);
      console.log(`hono port: ${result.ports.hono.ok ? 'free' : 'busy'} ${result.ports.hono.host}:${result.ports.hono.port}`);
      console.log(`postgres wire port: ${result.ports.postgresWire.ok ? 'free' : 'busy'} 127.0.0.1:${result.ports.postgresWire.port}`);
      console.log(`postgrest port: ${result.ports.postgrest.ok ? 'free' : 'busy'} 127.0.0.1:${result.ports.postgrest.port}`);
      console.log(`admin port: ${result.ports.admin.ok ? 'free' : 'busy'} 127.0.0.1:${result.ports.admin.port}`);
    }

    return result.ok ? 0 : 1;
  } catch (error) {
    if (error instanceof CliError) {
      console.error(error.message);
      return error.exitCode;
    }
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}