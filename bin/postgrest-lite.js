#!/usr/bin/env node

const path = require('node:path');

async function run() {
  const entrypoint = path.resolve(__dirname, '../dist/src/cli/index.js');
  const cli = require(entrypoint);
  const exitCode = await cli.main(process.argv);
  process.exitCode = exitCode;
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});