import { CLI_NAME, CLI_VERSION, DEFAULT_POSTGREST_VERSION } from '../../runtime/packageInfo';

export async function runVersionCommand(): Promise<number> {
  console.log(`${CLI_NAME} ${CLI_VERSION}`);
  console.log(`postgrest ${DEFAULT_POSTGREST_VERSION}`);
  return 0;
}