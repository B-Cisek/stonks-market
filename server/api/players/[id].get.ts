import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../../db'
import { instrument, pick, user } from '../../db/schema'
import { BENCHMARK_SYMBOL } from '../../utils/benchmark'
import { averageReturns, getSeasonSeries } from '../../utils/history'
import { getRanking, getRankingSeason } from '../../utils/ranking'
import type { Category } from '../../utils/ranking'

export interface PlayerPick {
  category: Category
  symbol: string
  name: string
  exchange: string | null
  currency: string
  start: { date: string, close: number } | null
  last: { date: string, close: number } | null
  return: number | null
}

export interface PlayerHistoryPoint {
  date: string
  // średni wynik gracza; null, dopóki któraś spółka nie ma ceny
  player: number | null
  benchmark: number | null
  // wynik każdej spółki, w kolejności `picks`
  picks: (number | null)[]
}

// GET /api/players/:id — wyniki gracza w bieżącym sezonie: spółki z cenami i dzienna historia wyniku na tle S&P 500.
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const id = getRouterParam(event, 'id')!

  const [player] = await db
    .select({ id: user.id, name: user.name, image: user.image })
    .from(user)
    .where(eq(user.id, id))
  if (!player) {
    throw createError({ statusCode: 404, statusMessage: 'Nie ma takiego gracza' })
  }

  const current = await getRankingSeason()
  if (!current) {
    throw createError({ statusCode: 404, statusMessage: 'Sezon jeszcze nie wystartował' })
  }

  const [ranking, rows] = await Promise.all([
    getRanking(current),
    db
      .select({
        category: pick.category,
        symbol: pick.symbol,
        name: instrument.name,
        exchange: instrument.exchange,
        currency: instrument.currency,
      })
      .from(pick)
      .innerJoin(instrument, eq(instrument.symbol, pick.symbol))
      .where(and(
        eq(pick.seasonId, current.id),
        eq(pick.userId, id),
        inArray(pick.category, current.categories),
      )),
  ])
  rows.sort((a, b) => current.categories.indexOf(a.category) - current.categories.indexOf(b.category))

  const symbols = rows.map(r => r.symbol)
  const series = await getSeasonSeries(current, [...new Set([...symbols, BENCHMARK_SYMBOL])])
  const playerReturns = averageReturns(series, symbols)
  const benchmarkReturns = series.returns.get(BENCHMARK_SYMBOL)!

  const history: PlayerHistoryPoint[] = series.dates.map((date, d) => ({
    date,
    player: playerReturns[d] ?? null,
    benchmark: benchmarkReturns[d] ?? null,
    picks: symbols.map(s => series.returns.get(s)![d] ?? null),
  }))

  const picks: PlayerPick[] = rows.map((r) => {
    const start = series.starts.get(r.symbol) ?? null
    const last = series.lasts.get(r.symbol) ?? null
    return { ...r, start, last, return: start && last ? last.close / start.close - 1 : null }
  })

  const ranked = ranking.players.find(p => p.userId === id)

  return {
    player,
    season: ranking.season!,
    asOf: ranking.asOf,
    benchmark: ranking.benchmark,
    // null, gdy gracz nie ma kompletu wyborów (albo cen) — wtedy nie jest w rankingu
    rank: ranked ? { position: ranked.rank, of: ranking.players.length, return: ranked.return, beatsBenchmark: ranked.beatsBenchmark } : null,
    picks,
    history,
  }
})
