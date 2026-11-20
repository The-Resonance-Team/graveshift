FROM oven/bun:1.4.4
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY src ./src
USER bun
EXPOSE 3000 3001
CMD ["bun", "src/api-main.ts"]
