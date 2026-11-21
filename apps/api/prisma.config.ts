import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// The connection string lives here and in the environment, never in schema.prisma.
export default defineConfig({
  schema: 'prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? '',
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL ?? '',
  },
  migrations: {
    path: 'prisma/migrations',
  },
});
