import { resolveDownloadConfig } from '../../runtime/config';
import { CliError } from '../../runtime/errors';
import { ensurePostgrestBinary } from '../../runtime/postgrestBinary';

export async function runDownloadCommand(options: Record<string, unknown>): Promise<number> {
  try {
    const config = resolveDownloadConfig(options);
    const binaryPath = await ensurePostgrestBinary({
      version: config.postgrestVersion,
      binDir: config.postgrestBinDir,
      force: config.force,
    });
    console.log(binaryPath);
    return 0;
  } catch (error) {
    if (error instanceof CliError) {
      console.error(error.message);
      return error.exitCode;
    }
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}