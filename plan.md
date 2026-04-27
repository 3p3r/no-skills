## Plan: CLI Hono PostgREST PGlite

Build a TypeScript CLI utility whose primary responsibility is to start a local Hono HTTP server in the foreground, create an in-memory PGlite instance, expose that instance over the PostgreSQL wire protocol through `PGLiteSocketServer`, launch the PostgREST binary against that local socket endpoint, and proxy PostgREST traffic through Hono. The runtime is intentionally ephemeral end to end: no database persistence layer, no filesystem-backed PGlite mode, no snapshotting, and no mounted data volumes. AWS deployment uses the same HTTP server bootstrap through a container image deployed by AWS CDK and fronted in Lambda by Lambda Web Adapter.

**Phases**
1. Phase 1 - Project skeleton and runtime contract. Replace the current Python-oriented ignore rules with Node and TypeScript rules, add the CLI package scaffold, define the configuration precedence model, and establish a single runtime-manager contract that owns the full lifecycle of PGlite, the socket server, PostgREST, and Hono. This blocks all later work.
2. Phase 2 - PostgREST binary acquisition. Implement a binary manager that resolves the exact PostgREST version from configuration, accepts an explicit binary override path, and otherwise downloads the correct GitHub release artifact for the current platform and architecture into a CLI cache directory. The binary manager must also support Linux x64 prefetching during container builds. This blocks the PostgREST runner.
3. Phase 3 - Ephemeral database runtime. Implement the PGlite runtime so it always starts in memory, never accepts a persistent database path, attaches `PGLiteSocketServer` to localhost on a dedicated PostgreSQL port, and runs the bootstrap SQL before PostgREST starts. This blocks the Hono proxy because PostgREST readiness depends on it.
4. Phase 4 - PostgREST process lifecycle. Implement the child-process runner for PostgREST, including environment and config generation, startup logging, readiness polling against the PostgREST admin server, and graceful shutdown on process signals. The runtime manager must fail fast if PostgREST does not become ready inside the configured timeout.
5. Phase 5 - Hono server and proxy contract. Implement the Hono HTTP server that exposes a small fixed surface: `GET /` returns a JSON description of the service and resolved ports, `GET /health` returns process liveness, `GET /ready` returns end-to-end readiness, and `/api/*` reverse-proxies to the local PostgREST HTTP port after stripping the `/api` prefix. This phase depends on PostgREST readiness behavior being fixed.
6. Phase 6 - CLI command surface. Implement the exact command set defined below, with exact flag names, defaults, exit codes, and configuration precedence. No additional commands should be added in the first version.
7. Phase 7 - Local container workflow. Add a Dockerfile and docker-compose workflow that run the same foreground `start` command, expose only the Hono HTTP port, and keep the runtime fully ephemeral. No Docker volumes should be mounted for database state.
8. Phase 8 - AWS Lambda container deployment through CDK. Add an AWS CDK application that builds and deploys the same container image as a `DockerImageFunction`, includes Lambda Web Adapter in the image, exposes a Lambda Function URL, and sets the environment needed for the CLI HTTP server to bind on `0.0.0.0`. No zip deployment path should be created.
9. Phase 9 - Verification. Add startup, proxy, binary-resolution, container, and Lambda smoke coverage so the runtime contract is validated end to end.
10. Phase 10 - Documentation. Rewrite the README so it describes the product accurately as a CLI utility with local and Lambda container workflows, exact commands, runtime sequence, and explicitly ephemeral data behavior.

**Exact CLI Contract**
1. `postgrest-lite start`
   Behavior:
   Start in the foreground and never daemonize. Resolve config in this order: CLI flags, environment variables, then built-in defaults. Resolve the PostgREST binary, start in-memory PGlite, run bootstrap SQL, start the PGlite socket server, launch PostgREST, poll the admin `/ready` endpoint until success or timeout, then start the Hono server and print the ready endpoints. On `SIGINT` or `SIGTERM`, stop Hono first, then PostgREST, then the socket server, then PGlite, and exit with code `0`.
   Flags and defaults:
   `--host` default `127.0.0.1`
   `--port` default `8080`
   `--pg-port` default `5432`
   `--postgrest-port` default `3000`
   `--admin-port` default `3001`
   `--postgrest-version` default pinned package constant
   `--postgrest-bin` optional absolute binary override path
   `--schema` default `api`
   `--db-anon-role` default `anon`
   `--bootstrap` default bundled `sql/bootstrap.sql`
   `--ready-timeout-ms` default `30000`
   `--log-level` default `info`
   `--json` default `false`
   Exit codes:
   `0` clean shutdown
   `1` runtime startup failure
   `2` invalid config or invalid flags
2. `postgrest-lite download`
   Behavior:
   Resolve the requested PostgREST version and ensure the matching binary exists in the cache directory, then print the resolved absolute path. Do not start PGlite, PostgREST, or Hono.
   Flags and defaults:
   `--postgrest-version` default pinned package constant
   `--postgrest-bin-dir` default platform cache directory for the CLI
   `--force` default `false`
   Exit codes:
   `0` binary present or downloaded successfully
   `1` download or extraction failure
   `2` invalid config or unsupported platform
3. `postgrest-lite doctor`
   Behavior:
   Validate that the runtime can start without actually binding the Hono port. Confirm the binary can be resolved, the bootstrap SQL file exists and is readable, and the configured ports are syntactically valid and currently free. Print a structured summary in text by default and JSON when `--json` is present. Do not start the long-lived server processes.
   Flags and defaults:
   `--host` default `127.0.0.1`
   `--port` default `8080`
   `--pg-port` default `5432`
   `--postgrest-port` default `3000`
   `--admin-port` default `3001`
   `--postgrest-version` default pinned package constant
   `--postgrest-bin` optional absolute binary override path
   `--bootstrap` default bundled `sql/bootstrap.sql`
   `--json` default `false`
   Exit codes:
   `0` all checks pass
   `1` one or more checks fail
   `2` invalid config or invalid flags
4. `postgrest-lite version`
   Behavior:
   Print the CLI version and the default pinned PostgREST version without performing network requests.
   Flags and defaults:
   No flags.
   Exit codes:
   `0` always

**Environment Variables**
- `POSTGREST_LITE_HOST`
- `POSTGREST_LITE_PORT`
- `POSTGREST_LITE_PG_PORT`
- `POSTGREST_LITE_POSTGREST_PORT`
- `POSTGREST_LITE_ADMIN_PORT`
- `POSTGREST_LITE_POSTGREST_VERSION`
- `POSTGREST_LITE_POSTGREST_BIN`
- `POSTGREST_LITE_SCHEMA`
- `POSTGREST_LITE_DB_ANON_ROLE`
- `POSTGREST_LITE_BOOTSTRAP`
- `POSTGREST_LITE_READY_TIMEOUT_MS`
- `POSTGREST_LITE_LOG_LEVEL`
- `POSTGREST_LITE_JSON`

**Relevant files**
- /home/sep/postgrest-lite-fastapi/README.md — replace the placeholder description with real CLI, Docker, and Lambda/CDK usage.
- /home/sep/postgrest-lite-fastapi/.gitignore — replace the current Python template with Node and TypeScript ignores plus CLI cache and build output ignores.
- /home/sep/postgrest-lite-fastapi/package.json — declare the CLI package, scripts, dependencies, `bin` entry, and pinned PostgREST version constant.
- /home/sep/postgrest-lite-fastapi/tsconfig.json — compile target for the Node CLI and tests.
- /home/sep/postgrest-lite-fastapi/bin/postgrest-lite.js — executable entry shim.
- /home/sep/postgrest-lite-fastapi/src/cli/index.ts — command parser and dispatch.
- /home/sep/postgrest-lite-fastapi/src/cli/commands/start.ts — `start` command orchestration.
- /home/sep/postgrest-lite-fastapi/src/cli/commands/download.ts — `download` command.
- /home/sep/postgrest-lite-fastapi/src/cli/commands/doctor.ts — `doctor` command.
- /home/sep/postgrest-lite-fastapi/src/cli/commands/version.ts — `version` command.
- /home/sep/postgrest-lite-fastapi/src/runtime/config.ts — config loading and precedence.
- /home/sep/postgrest-lite-fastapi/src/runtime/postgrestBinary.ts — binary resolution, download, extraction, cache, and platform checks.
- /home/sep/postgrest-lite-fastapi/src/runtime/pglite.ts — in-memory PGlite and socket-server startup.
- /home/sep/postgrest-lite-fastapi/src/runtime/postgrest.ts — PostgREST child-process launcher, readiness polling, and shutdown.
- /home/sep/postgrest-lite-fastapi/src/runtime/runtimeManager.ts — startup order and stop order for all components.
- /home/sep/postgrest-lite-fastapi/src/server/app.ts — Hono app factory and route registration.
- /home/sep/postgrest-lite-fastapi/src/server/routes.ts — root, health, ready, and proxy route definitions.
- /home/sep/postgrest-lite-fastapi/src/server/postgrestProxy.ts — reverse-proxy implementation and hop-by-hop header filtering.
- /home/sep/postgrest-lite-fastapi/sql/bootstrap.sql — bundled bootstrap schema, roles, and example objects.
- /home/sep/postgrest-lite-fastapi/Dockerfile — single container build path used both locally and by CDK.
- /home/sep/postgrest-lite-fastapi/docker-compose.yml — local container workflow using the same `start` command.
- /home/sep/postgrest-lite-fastapi/infra/cdk/bin/postgrest-lite.ts — CDK app entrypoint.
- /home/sep/postgrest-lite-fastapi/infra/cdk/lib/postgrest-lite-stack.ts — Lambda container, Function URL, log retention, and outputs.
- /home/sep/postgrest-lite-fastapi/test/integration/start.test.ts — startup and readiness smoke coverage.
- /home/sep/postgrest-lite-fastapi/test/integration/proxy.test.ts — proxy behavior and header preservation.
- /home/sep/postgrest-lite-fastapi/test/integration/container.test.ts — local container smoke path.
- /home/sep/postgrest-lite-fastapi/test/integration/lambda-container.test.ts — Lambda container smoke path.

**AWS Deployment Contract**
1. Deployment target is AWS Lambda container images only.
2. Infrastructure tool is AWS CDK only.
3. CDK must create exactly one primary runtime stack for v1.
4. The stack must build the image from the repository Dockerfile using `DockerImageCode.fromImageAsset` and deploy it as a `DockerImageFunction`.
5. The function must use `Architecture.X86_64` so the baked PostgREST Linux binary target is unambiguous.
6. The function must set `memorySize` to `2048`, `timeout` to `30` seconds, and `ephemeralStorageSize` to `1024` MiB.
7. The function environment must include `POSTGREST_LITE_HOST=0.0.0.0`, `POSTGREST_LITE_PORT=8080`, `AWS_LWA_PORT=8080`, and `AWS_LWA_READINESS_CHECK_PATH=/ready`.
8. The stack must expose the service through a Lambda Function URL with `NONE` auth for the first version.
9. The Dockerfile must bake the Linux x64 PostgREST binary into the image during build and must also include Lambda Web Adapter as an extension.
10. No API Gateway, no EFS, no S3 persistence, and no RDS resources are included in v1.

**Verification**
1. Local CLI smoke: run `postgrest-lite start` and verify `GET /ready` returns `200` only after the PGlite socket and PostgREST admin readiness both succeed.
2. Proxy contract: create and fetch a sample record through `/api/*` and verify PostgREST status codes and headers are preserved.
3. Binary resolution: verify `download` succeeds on a clean machine and `doctor` passes with both cached-binary and explicit-binary-path configurations.
4. Shutdown behavior: send `SIGINT` to the foreground process and verify all child processes stop cleanly with exit code `0`.
5. Docker smoke: run docker-compose and confirm the same `start` path exposes the Hono endpoint without any mounted persistent volumes.
6. Lambda container smoke: run the Lambda image locally and verify Lambda Web Adapter waits for `/ready` before serving traffic.
7. CDK deployment smoke: synth and deploy the CDK stack, then hit the Function URL and confirm the root, health, ready, and proxy endpoints behave as specified.

**Decisions**
- Runtime data is fully ephemeral. There is no persistent PGlite mode in v1.
- The CLI command surface is fixed to `start`, `download`, `doctor`, and `version` in v1.
- The Hono server is the only public HTTP surface in both local and Lambda flows.
- Lambda deployment is container-only and CDK-only in v1.
- AWS Lambda Web Adapter is the chosen bridge so the same foreground HTTP server runs locally and in Lambda.
- The only durable filesystem artifact permitted in v1 is the downloaded PostgREST executable cache used by the CLI tool itself; application data remains non-persistent.
