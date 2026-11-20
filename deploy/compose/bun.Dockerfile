# Shared image recipe for the daemon and the actuator: docker build --build-arg APP_PATH=apps/daemon
FROM oven/bun:1.4.4
WORKDIR /app
ARG APP_PATH
ENV NODE_ENV=production
COPY package.json bun.lock ./
COPY apps ./apps
COPY packages ./packages
RUN bun install --frozen-lockfile --production
RUN mkdir -p /data && chown bun:bun /data
WORKDIR /app/${APP_PATH}
USER bun
CMD ["bun", "src/index.ts"]
