# postgrest-lite

`postgrest-lite` is a TypeScript CLI utility that starts four components in one process tree:

1. An in-memory `PGlite` database.
2. A `PGLiteSocketServer` that exposes that database over the PostgreSQL wire protocol.
3. The real `PostgREST` binary connected to that local PostgreSQL socket.
4. A `Hono` HTTP server that exposes `/`, `/health`, `/ready`, and `/api/*` in front of PostgREST.

The runtime is intentionally ephemeral. Database state is never persisted. The only durable artifact is the cached PostgREST executable.

## Requirements

- Node.js 20+
- `tar` with xz support on Unix-like hosts for PostgREST archive extraction
- Docker for container workflows
- AWS credentials for CDK deployment

## Install

```bash
npm install
npm run build
```

## CLI

### `postgrest-lite start`

Starts the full foreground runtime.

```bash
node bin/postgrest-lite.js start
```

Defaults:

- `--host 127.0.0.1`
- `--port 8080`
- `--pg-port 5432`
- `--postgrest-port 3000`
- `--admin-port 3001`
- `--postgrest-version 14.10`
- `--schema api`
- `--db-anon-role anon`
- `--bootstrap sql/bootstrap.sql`
- `--ready-timeout-ms 30000`
- `--log-level info`

Example:

```bash
node bin/postgrest-lite.js start --port 8080 --log-level debug
curl http://127.0.0.1:8080/ready
curl http://127.0.0.1:8080/api/todos
curl http://127.0.0.1:8080/api/rpc/hello -X POST
```

### `postgrest-lite download`

Downloads or resolves the pinned PostgREST binary into the CLI cache or a custom directory.

```bash
node bin/postgrest-lite.js download
node bin/postgrest-lite.js download --postgrest-bin-dir /tmp/postgrest-bin --force
```

### `postgrest-lite doctor`

Validates binary resolution, bootstrap SQL readability, and port availability without starting the runtime.

```bash
node bin/postgrest-lite.js doctor
node bin/postgrest-lite.js doctor --json
```

### `postgrest-lite version`

Prints the CLI version and pinned PostgREST version.

```bash
node bin/postgrest-lite.js version
```

## Environment Variables

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

CLI flags override environment variables. Environment variables override built-in defaults.

## HTTP Contract

- `GET /` returns service metadata, versions, ports, and resolved endpoints.
- `GET /health` returns process liveness.
- `GET /ready` returns `200` only when the PGlite socket and PostgREST admin endpoint are both healthy.
- `/api/*` proxies directly to the local PostgREST instance after stripping the `/api` prefix.

## Bundled Bootstrap

The bundled SQL in [sql/bootstrap.sql](sql/bootstrap.sql) creates:

- The `anon` role.
- The `api` schema.
- The `api.todos` table.
- The `api.hello()` RPC function.

That is enough to smoke-test both table routes and RPC routes through PostgREST.

## Local Docker Workflow

Build and run the same foreground CLI server inside a container:

```bash
docker compose up --build
curl http://127.0.0.1:8080/ready
curl http://127.0.0.1:8080/api/todos
```

The container remains ephemeral. No volumes are mounted for application data.

## AWS Lambda via CDK

The Lambda deployment path is container-only and CDK-only.

### What gets deployed

- A `DockerImageFunction`
- `x86_64` architecture
- `2048` MB memory
- `30` second timeout
- `1024` MiB ephemeral storage
- Lambda Web Adapter included as an extension
- A Lambda Function URL with `NONE` auth

### Synthesize

```bash
npm run cdk:synth
```

### Deploy

```bash
npm run cdk:deploy
```

After deploy, CDK outputs the Function URL. That URL exposes the same HTTP contract as the local server.

## Tests

Run the integration suite:

```bash
npm test
```

The test suite covers:

- Local runtime startup and readiness
- Proxy behavior through Hono
- Binary resolution and doctor checks
- Docker image startup
- Lambda image wiring and readiness path

## Runtime Sequence

1. Resolve or download the PostgREST binary.
2. Start in-memory PGlite.
3. Run the bootstrap SQL directly against PGlite.
4. Start `PGLiteSocketServer` on localhost.
5. Spawn PostgREST and wait for its admin `/ready` endpoint.
6. Start Hono and expose the public HTTP routes.

## Notes

- Database state is discarded every time the process exits.
- The CLI does not support a persistent database mode in v1.
- Lambda deploys use the same HTTP server bootstrap through Lambda Web Adapter.
