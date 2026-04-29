# AGENTS.md — postgrest-lite

High-signal context for agents working in this repo. When in doubt, trust executable sources (package.json, tsconfig.json, Dockerfile) over this file.

## Project Overview

CLI utility that runs an ephemeral stack in one process tree: in-memory PGlite database → PostgreSQL wire socket → real PostgREST binary → Hono HTTP server. No persistence. The only durable artifact is the cached PostgREST executable.

## Build & Dev

- **Node 20+ required** (`engines.node` in package.json).
- **Module system**: Node16 ESM/CJS hybrid (`"module": "Node16"`, `"moduleResolution": "Node16"`).
- **Build**: `npm run build` runs `tsc -p tsconfig.json` and emits to `dist/`.
- **Dev without build**: `npm run dev` uses `tsx src/cli/index.ts start`.
- **CLI entry point**: `bin/postgrest-lite.js` is a CommonJS wrapper that `require()`s `../dist/src/cli/index.js`. **You must build before running the CLI via `node bin/postgrest-lite.js …`.**
- **Clean**: `npm run clean` removes `dist/`, `coverage/`, `cdk.out/`.

## Test

- **Runner**: Vitest (`vitest.config.ts`).
- **All tests are integration tests** in `test/integration/`. They spin up real server processes, allocate ports, and exercise the full stack.
- **Tests are sequential**: Every suite uses `describe.sequential()` because they bind real TCP ports.
- **Timeouts**: 120s for most tests; 300s for Docker-based tests.
- **Test helper**: `test/helpers/runtime.ts` exports `startTestRuntime()` and `buildTestConfig()` — use these instead of hand-rolling port allocation.
- **Pretest build**: `npm test` triggers `npm run build` first via `pretest`. `npm run test:watch` does **not**.
- **Docker tests auto-skip** if `docker` is unavailable (`describe.skipIf(!dockerAvailable)`).

## Commands (non-obvious ones)

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the stack via tsx (no build needed) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm test` | Build + run integration tests |
| `npm run test:watch` | Vitest watch mode (no auto-build) |
| `npm run download` | Download/cache the pinned PostgREST binary |
| `npm run doctor` | Validate binary, SQL, and port availability |
| `npm run docker:build` | Build the local Docker image |
| `npm run cdk:synth` | CDK synth (requires AWS creds) |
| `npm run cdk:deploy` | CDK deploy (requires AWS creds) |

## Architecture

- **`src/cli/`**: Commander-based CLI. Entry: `src/cli/index.ts`. Commands in `src/cli/commands/`.
- **`src/runtime/`**: Runtime orchestration (config resolution, PGlite lifecycle, PostgREST binary management, process spawning, logging, port utilities).
- **`src/server/`**: Hono app (`app.ts`), routes (`routes.ts`), and PostgREST proxy (`postgrestProxy.ts`).
- **`bin/postgrest-lite.js`**: Production CLI wrapper. Requires compiled `dist/src/cli/index.js`.
- **`sql/bootstrap.sql`**: Default bootstrap SQL (creates `anon` role, `api` schema, `api.todos`, `api.hello()`).
- **`infra/cdk/`**: AWS CDK stack deploying a `DockerImageFunction` with Lambda Web Adapter.

## Runtime Behavior

1. Resolve or download PostgREST binary (cached per version/platform/arch).
2. Start in-memory PGlite.
3. Execute bootstrap SQL against PGlite.
4. Start `PGLiteSocketServer` on localhost wire port.
5. Spawn PostgREST process pointing at the local socket.
6. Wait for PostgREST admin `/ready` endpoint.
7. Start Hono HTTP server.

**Shutdown**: SIGINT/SIGTERM → stop Hono → stop PostgREST (SIGTERM, then SIGKILL after 5s) → stop PGlite socket → close PGlite.

## PostgREST Binary

- Downloaded from GitHub releases (`https://github.com/PostgREST/postgrest/releases/download/v${version}/…`).
- Cached in platform-specific directory (see `src/runtime/paths.ts`).
- Supports Linux (x64/arm64), macOS (x64/arm64), Windows (x64), FreeBSD (x64).
- `tar` with xz support required on Unix for extraction.
- Version pinned in `package.json` under `postgrestLite.defaultPostgrestVersion`.

## Docker

- **Multi-stage Dockerfile**: build stage installs deps + builds + downloads binary; runtime stage is slim Node image with Lambda Web Adapter extension.
- **Lambda Web Adapter** is copied from `public.ecr.aws/awsguru/aws-lambda-adapter:1.0.0` into `/opt/extensions/lambda-adapter`.
- **Docker Compose** exposes port 8080 and sets `POSTGREST_LITE_HOST=0.0.0.0`.
- Container is ephemeral — no volumes for DB state.

## CDK / AWS Lambda

- `cdk.json` app entry: `npx tsx infra/cdk/bin/postgrest-lite.ts`.
- Deploys a `DockerImageFunction` (x86_64, 2048 MB, 30s timeout, 1024 MiB ephemeral storage).
- Function URL with `NONE` auth.
- Lambda Web Adapter env vars are baked in: `AWS_LWA_PORT=8080`, `AWS_LWA_READINESS_CHECK_PATH=/ready`.

## Code Style & Conventions

- **No linter or formatter** is configured. TypeScript strict mode is the only guard.
- Use `node:` prefix for built-in modules.
- Logger is a custom class (`src/runtime/logger.ts`) supporting text and JSON output, scoped children, and log levels.
- Errors: prefer `CliError` (extends `Error` with `exitCode`) for CLI-facing errors.
- Config resolution lives in `src/runtime/config.ts` and reads CLI flags → env vars → defaults.
- Env var prefix: `POSTGREST_LITE_*`.

## Important Constraints

- **Database is ephemeral**: PGlite is in-memory only. No persistence across restarts.
- **Port uniqueness**: Config validation enforces all four ports (Hono, PG wire, PostgREST, admin) must be distinct.
- **Bootstrap SQL path**: Must exist at resolution time; defaults to `sql/bootstrap.sql` relative to project root (discovered by walking up from `__dirname`).
- **No CI config**: There are no `.github/workflows/`, pre-commit hooks, or lint/format checks in this repo.
