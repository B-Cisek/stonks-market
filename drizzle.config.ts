import { defineConfig } from 'drizzle-kit'

try { process.loadEnvFile() } catch {} // Node 22+, wczytuje .env bez dotenv

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema',
  out: './server/db/migrations',
  dbCredentials: { url: process.env.DATABASE_URL! },
})
