import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { instrument, pick } from '../../db/schema'
import { getEntrySeason } from '../../utils/season'

// GET /api/picks — wybory zalogowanego gracza w sezonie z otwartymi zapisami (do kreatora wyboru).
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const current = await getEntrySeason()
  if (!current) return { season: null, picks: [] }

  const picks = await db
    .select({
      category: pick.category,
      symbol: pick.symbol,
      name: instrument.name,
      exchange: instrument.exchange,
    })
    .from(pick)
    .innerJoin(instrument, eq(instrument.symbol, pick.symbol))
    .where(and(eq(pick.seasonId, current.id), eq(pick.userId, user.id)))

  return {
    season: {
      year: current.year,
      categories: current.categories,
      entryClosesAt: current.entryClosesAt,
      startDate: current.startDate,
      endDate: current.endDate,
    },
    picks,
  }
})
