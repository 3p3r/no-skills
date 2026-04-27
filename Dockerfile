FROM node:20-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends xz-utils ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN mkdir -p /opt/postgrest-lite/bin \
  && node dist/src/cli/index.js download --postgrest-bin-dir /opt/postgrest-lite/bin

FROM node:20-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:1.0.0 /lambda-adapter /opt/extensions/lambda-adapter

WORKDIR /var/task

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/bin ./bin
COPY --from=build /app/sql ./sql
COPY --from=build /opt/postgrest-lite/bin /opt/postgrest-lite/bin

RUN chmod +x /opt/postgrest-lite/bin/postgrest /var/task/bin/postgrest-lite.js

ENV NODE_ENV=production \
  POSTGREST_LITE_HOST=0.0.0.0 \
  POSTGREST_LITE_PORT=8080 \
  POSTGREST_LITE_POSTGREST_BIN=/opt/postgrest-lite/bin/postgrest \
  PORT=8080 \
  AWS_LWA_PORT=8080 \
  AWS_LWA_READINESS_CHECK_PATH=/ready

EXPOSE 8080

CMD ["node", "bin/postgrest-lite.js", "start"]