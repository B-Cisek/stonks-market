import { and, gt, lte } from 'drizzle-orm'
import { db } from '../db'
import { season } from '../db/schema'

// Sezon z otwartym oknem zapisów [entry_opens_at, entry_closes_at) albo null.
export async function getEntrySeason() {
  const now = new Date()
  const [current] = await db
    .select()
    .from(season)
    .where(and(lte(season.entryOpensAt, now), gt(season.entryClosesAt, now)))
    .limit(1)
  return current ?? null
}
