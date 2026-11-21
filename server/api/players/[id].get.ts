import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm'
import { db } from '../../db'
import { instrument, instrumentPrice, pick, user } from '../../db/schema'
import { BENCHMARK_SYMBOL } from '../../utils/benchmark'
import { getRanking, getRankingSeason, lastDateOf } from '../../utils/ranking'
import type { Category } from '../../utils/ranking'

// zapas przed startem sezonu, żeby znaleźć cenę startową, gdy start wypada w dzień wolny giełdy
const LOOKBACK_DAYS = 10

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

function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
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

  // cała historia sezonu naraz — jedno zapytanie, dalej liczone w pamięci
  const symbols = [...new Set([...rows.map(r => r.symbol), BENCHMARK_SYMBOL])]
  const lastDate = lastDateOf(current)
  const prices = await db
    .select({ symbol: instrumentPrice.symbol, date: instrumentPrice.date, close: instrumentPrice.close })
    .from(instrumentPrice)
    .where(and(
      inArray(instrumentPrice.symbol, symbols),
      gte(instrumentPrice.date, shiftDate(current.startDate, -LOOKBACK_DAYS)),
      lte(instrumentPrice.date, lastDate),
    ))
    .orderBy(asc(instrumentPrice.date))

  const series = new Map<string, { date: string, close: number }[]>(symbols.map(s => [s, []]))
  for (const p of prices) series.get(p.symbol)!.push({ date: p.date, close: Number(p.close) })

  // cena startowa: ostatnie zamknięcie ≤ start_date (tak samo jak w rankingu)
  const startOf = (symbol: string) => series.get(symbol)!.findLast(p => p.date <= current.startDate) ?? null
  const starts = new Map(symbols.map(s => [s, startOf(s)]))

  // oś dat: dzień startu + każda sesja po nim na którejkolwiek giełdzie; ceny przenoszone przez dni wolne
  const dates = [current.startDate, ...new Set(prices.map(p => p.date).filter(d => d > current.startDate))]
  const cursor = new Map(symbols.map(s => [s, -1]))
  const closeOn = (symbol: string, date: string) => {
    const list = series.get(symbol)!
    let i = cursor.get(symbol)!
    while (i + 1 < list.length && list[i + 1]!.date <= date) i++
    cursor.set(symbol, i)
    return i >= 0 ? list[i]!.close : null
  }
  const returnOn = (symbol: string, date: string) => {
    const start = starts.get(symbol)?.close
    const close = closeOn(symbol, date)
    return start && close !== null ? close / start - 1 : null
  }

  const history: PlayerHistoryPoint[] = dates.map((date) => {
    const pickReturns = rows.map(r => returnOn(r.symbol, date))
    const complete = pickReturns.length > 0 && pickReturns.every(r => r !== null)
    return {
      date,
      player: complete ? (pickReturns as number[]).reduce((a, b) => a + b, 0) / pickReturns.length : null,
      benchmark: returnOn(BENCHMARK_SYMBOL, date),
      picks: pickReturns,
    }
  })

  const picks: PlayerPick[] = rows.map((r) => {
    const start = starts.get(r.symbol) ?? null
    const last = series.get(r.symbol)!.at(-1) ?? null
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
