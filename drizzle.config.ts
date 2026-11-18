import { defineConfig } from 'drizzle-kit'

// Node 22+, wczytuje .env bez dotenv
try {
  process.loadEnvFile()
}
catch {
  // brak .env (np. CI) — zmienne przychodzą ze środowiska
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema',
  out: './server/db/migrations',
  dbCredentials: { url: process.env.DATABASE_URL! },
})
