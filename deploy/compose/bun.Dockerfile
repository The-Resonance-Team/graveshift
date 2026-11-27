# Shared image recipe for deployable apps: docker build --build-arg APP_PATH=packages/actuator
FROM oven/bun:1.4.4
WORKDIR /app
ARG APP_PATH
ENV NODE_ENV=production
COPY package.json bun.lock ./
COPY apps ./apps
COPY packages ./packages
RUN bun install --frozen-lockfile --production
# Create and own the actuator state directory in the image. Docker copies this
# ownership into a new named volume, so the runtime user can write the store.
RUN mkdir -p /data/graveshift-actuator && chown -R bun:bun /data
WORKDIR /app/${APP_PATH}
USER bun
CMD ["bun", "src/index.ts"]
