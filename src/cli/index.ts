import { Command, CommanderError } from 'commander';

import { CliError } from '../runtime/errors';
import { runDoctorCommand } from './commands/doctor';
import { runDownloadCommand } from './commands/download';
import { runStartCommand } from './commands/start';
import { runVersionCommand } from './commands/version';

export async function main(argv: string[] = process.argv): Promise<number> {
  const program = new Command();
  program
    .name('postgrest-lite')
    .description('Run Hono in front of a PostgREST binary backed by in-memory PGlite.')
    .showHelpAfterError()
    .exitOverride();

  program
    .command('start')
    .description('Start the foreground Hono, PGlite, and PostgREST runtime.')
    .option('--host <host>')
    .option('--port <port>')
    .option('--pg-port <port>')
    .option('--postgrest-port <port>')
    .option('--admin-port <port>')
    .option('--postgrest-version <version>')
    .option('--postgrest-bin <path>')
    .option('--schema <schema>')
    .option('--db-anon-role <role>')
    .option('--bootstrap <path>')
    .option('--ready-timeout-ms <ms>')
    .option('--log-level <level>')
    .option('--json')
    .action(async (options) => {
      process.exitCode = await runStartCommand(options);
    });

  program
    .command('download')
    .description('Download or resolve the PostgREST binary into the CLI cache or a target directory.')
    .option('--postgrest-version <version>')
    .option('--postgrest-bin-dir <path>')
    .option('--force')
    .action(async (options) => {
      process.exitCode = await runDownloadCommand(options);
    });

  program
    .command('doctor')
    .description('Validate binary resolution, bootstrap SQL, and port availability.')
    .option('--host <host>')
    .option('--port <port>')
    .option('--pg-port <port>')
    .option('--postgrest-port <port>')
    .option('--admin-port <port>')
    .option('--postgrest-version <version>')
    .option('--postgrest-bin <path>')
    .option('--bootstrap <path>')
    .option('--json')
    .action(async (options) => {
      process.exitCode = await runDoctorCommand(options);
    });

  program
    .command('version')
    .description('Print the CLI version and pinned PostgREST version.')
    .action(async () => {
      process.exitCode = await runVersionCommand();
    });

  try {
    await program.parseAsync(argv);
    return typeof process.exitCode === 'number' ? process.exitCode : 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      console.error(error.message);
      return 2;
    }
    if (error instanceof CliError) {
      console.error(error.message);
      return error.exitCode;
    }
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (require.main === module) {
  main(process.argv)
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}