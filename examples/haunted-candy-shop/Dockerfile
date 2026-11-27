FROM oven/bun:1.4.4
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY src ./src
USER bun
EXPOSE 2600 2601
CMD ["bun", "src/api-main.ts"]
