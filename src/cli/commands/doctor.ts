import fs from "node:fs";

import { resolveDoctorConfig } from "../../runtime/config";
import { CliError } from "../../runtime/errors";
import { isPortFree } from "../../runtime/network";

export async function runDoctorCommand(options: Record<string, unknown>): Promise<number> {
  try {
    const config = await resolveDoctorConfig(options);

    // Validate binary path
    const binaryPath = config.postgrestBin;
    const binaryExecutable = binaryPath
      ? await fs.promises
          .access(binaryPath, fs.constants.X_OK)
          .then(() => true)
          .catch(() => false)
      : false;

    const bootstrapReadable = await fs.promises
      .access(config.bootstrap, fs.constants.R_OK)
      .then(() => true)
      .catch(() => false);

    const honoPortFree = await isPortFree(config.host, config.port);

    const result = {
      ok: binaryExecutable && bootstrapReadable && honoPortFree,
      binary: {
        ok: binaryExecutable,
        path: binaryPath,
      },
      bootstrap: {
        ok: bootstrapReadable,
        path: config.bootstrap,
      },
      ports: {
        hono: {
          ok: honoPortFree,
          host: config.host,
          port: config.port,
        },
      },
    };

    if (config.json) {
      console.log(JSON.stringify(result));
    } else {
      console.log(`binary: ${result.binary.ok ? "ok" : "failed"} ${result.binary.path}`);
      console.log(`bootstrap: ${result.bootstrap.ok ? "ok" : "failed"} ${result.bootstrap.path}`);
      console.log(
        `hono port: ${result.ports.hono.ok ? "free" : "busy"} ${result.ports.hono.host}:${result.ports.hono.port}`,
      );
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
