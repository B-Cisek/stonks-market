import { resolve } from 'node:path'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { db } from '../db'

// Odpala migracje Drizzle przy starcie serwera (dev i produkcja).
// Już wykonane migracje są pomijane (tabela drizzle.__drizzle_migrations).
// W obrazie Dockera folder jest kopiowany do /app/server/db/migrations, a WORKDIR to /app.
export default defineNitroPlugin(async () => {
  const migrationsFolder = resolve(process.cwd(), 'server/db/migrations')

  try {
    await migrate(db, { migrationsFolder })
    console.info('[migrate] Database migrations applied')
  }
  catch (error) {
    console.error('[migrate] Database migration failed:', error)
    process.exit(1)
  }
})
