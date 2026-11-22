import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { instrument, pick } from '../../db/schema'
import { getEntrySeason } from '../../utils/season'

// GET /api/picks — sezon z otwartymi zapisami i wybory zalogowanego gracza (do kreatora wyboru).
// Gość dostaje sam sezon z pustą listą wyborów — strona główna pokazuje mu zaproszenie do zapisów.
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)

  const current = await getEntrySeason()
  if (!current) return { season: null, picks: [] }

  const picks = session
    ? await db
        .select({
          category: pick.category,
          symbol: pick.symbol,
          name: instrument.name,
          exchange: instrument.exchange,
        })
        .from(pick)
        .innerJoin(instrument, eq(instrument.symbol, pick.symbol))
        .where(and(eq(pick.seasonId, current.id), eq(pick.userId, session.user.id)))
    : []

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
