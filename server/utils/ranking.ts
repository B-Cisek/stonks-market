import { and, count, desc, eq, inArray, lte } from 'drizzle-orm'
import { db } from '../db'
import { instrument, instrumentPrice, pick, season, user } from '../db/schema'
import type { assetCategory } from '../db/schema'
import { BENCHMARK_SYMBOL } from './benchmark'

export type Category = typeof assetCategory.enumValues[number]
export type RankingSeason = typeof season.$inferSelect

export interface RankingPick {
  category: Category
  symbol: string
  name: string
  // ułamek, np. 0.12 = +12%
  return: number
}

export interface RankingPlayer {
  rank: number
  userId: string
  name: string
  image: string | null
  return: number
  beatsBenchmark: boolean
  picks: RankingPick[]
}

export interface Ranking {
  season: { year: number, startDate: string, endDate: string, categories: Category[] } | null
  // data najnowszego zamknięcia użytego w wyliczeniach
  asOf: string | null
  benchmark: { symbol: string, return: number } | null
  players: RankingPlayer[]
}

export const todayUtc = () => new Date().toISOString().slice(0, 10)

// Ostatni dzień wyceny sezonu: dziś, a po zakończeniu sezonu jego koniec.
export const lastDateOf = (s: RankingSeason) => (todayUtc() < s.endDate ? todayUtc() : s.endDate)

// Bieżący sezon rankingu — ostatni, który już wystartował.
export async function getRankingSeason(): Promise<RankingSeason | null> {
  const [current] = await db
    .select()
    .from(season)
    .where(lte(season.startDate, todayUtc()))
    .orderBy(desc(season.startDate))
    .limit(1)
  return current ?? null
}

// Ostatnie zamknięcie ≤ `date` dla każdego symbolu (giełdy mają różne dni wolne).
// LATERAL: dla każdego symbolu jeden odczyt indeksu PK (symbol, date) od końca — bez sortowania całej historii,
// więc czas nie rośnie z długością sezonu. Każdy symbol z cenami ma wiersz w `instrument` (FK).
export async function closesOnOrBefore(symbols: string[], date: string) {
  const last = db
    .select({ date: instrumentPrice.date, close: instrumentPrice.close })
    .from(instrumentPrice)
    .where(and(eq(instrumentPrice.symbol, instrument.symbol), lte(instrumentPrice.date, date)))
    .orderBy(desc(instrumentPrice.date))
    .limit(1)
    .as('last')

  const rows = await db
    .select({ symbol: instrument.symbol, date: last.date, close: last.close })
    .from(instrument)
    .crossJoinLateral(last)
    .where(inArray(instrument.symbol, symbols))

  return new Map(rows.map(r => [r.symbol, { date: r.date, close: Number(r.close) }]))
}

// Ranking sezonu liczony w locie z ostatnich cen.
export async function getRanking(current: RankingSeason | null): Promise<Ranking> {
  if (!current) {
    return { season: null, asOf: null, benchmark: null, players: [] }
  }

  const picks = await db
    .select({
      userId: pick.userId,
      userName: user.name,
      userImage: user.image,
      category: pick.category,
      symbol: pick.symbol,
      instrumentName: instrument.name,
    })
    .from(pick)
    .innerJoin(user, eq(user.id, pick.userId))
    .innerJoin(instrument, eq(instrument.symbol, pick.symbol))
    .where(and(eq(pick.seasonId, current.id), inArray(pick.category, current.categories)))

  const symbols = [...new Set([...picks.map(p => p.symbol), BENCHMARK_SYMBOL])]
  const [startCloses, lastCloses] = await Promise.all([
    closesOnOrBefore(symbols, current.startDate),
    closesOnOrBefore(symbols, lastDateOf(current)),
  ])

  // wynik instrumentu: ostatnie close / cena startowa − 1; null, gdy brak cen (np. job jeszcze nie przeszedł)
  const returnOf = (symbol: string): number | null => {
    const start = startCloses.get(symbol)?.close
    const last = lastCloses.get(symbol)?.close
    return start && last !== undefined ? last / start - 1 : null
  }

  const benchmarkReturn = returnOf(BENCHMARK_SYMBOL)

  const byUser = new Map<string, { name: string, image: string | null, picks: RankingPick[], complete: boolean }>()
  for (const p of picks) {
    const entry = byUser.get(p.userId) ?? { name: p.userName, image: p.userImage, picks: [], complete: true }
    const ret = returnOf(p.symbol)
    if (ret === null) entry.complete = false
    else entry.picks.push({ category: p.category, symbol: p.symbol, name: p.instrumentName, return: ret })
    byUser.set(p.userId, entry)
  }

  // tylko gracze z kompletem wyborów (i cen) we wszystkich aktywnych kategoriach
  const players = [...byUser.entries()]
    .filter(([, e]) => e.complete && e.picks.length === current.categories.length)
    .map(([userId, e]) => {
      const ret = e.picks.reduce((sum, p) => sum + p.return, 0) / e.picks.length
      return {
        userId,
        name: e.name,
        image: e.image,
        return: ret,
        beatsBenchmark: benchmarkReturn !== null && ret > benchmarkReturn,
        picks: e.picks.sort((a, b) => current.categories.indexOf(a.category) - current.categories.indexOf(b.category)),
      }
    })
    .sort((a, b) => b.return - a.return)
    .map((p, i) => ({ rank: i + 1, ...p }))

  const usedDates = symbols.map(s => lastCloses.get(s)?.date).filter((d): d is string => !!d)
  const asOf = usedDates.length ? usedDates.reduce((a, b) => (a > b ? a : b)) : null

  return {
    season: {
      year: current.year,
      startDate: current.startDate,
      endDate: current.endDate,
      categories: current.categories,
    },
    asOf,
    benchmark: benchmarkReturn === null ? null : { symbol: BENCHMARK_SYMBOL, return: benchmarkReturn },
    players,
  }
}

export interface RankingInstrument {
  symbol: string
  name: string
  exchange: string | null
  currency: string
  category: Category
  // ilu graczy wybrało spółkę w tej kategorii
  pickers: number
  start: { date: string, close: number } | null
  last: { date: string, close: number } | null
  // null, gdy brak cen (np. job jeszcze nie przeszedł)
  return: number | null
}

export interface InstrumentRanking {
  season: Ranking['season']
  asOf: string | null
  benchmark: Ranking['benchmark']
  instruments: RankingInstrument[]
}

// Ranking spółek wybranych w sezonie (przez kogokolwiek, także bez kompletu), od najlepszego wyniku.
export async function getInstrumentRanking(current: RankingSeason | null): Promise<InstrumentRanking> {
  if (!current) {
    return { season: null, asOf: null, benchmark: null, instruments: [] }
  }

  const rows = await db
    .select({
      symbol: instrument.symbol,
      name: instrument.name,
      exchange: instrument.exchange,
      currency: instrument.currency,
      category: pick.category,
      pickers: count(),
    })
    .from(pick)
    .innerJoin(instrument, eq(instrument.symbol, pick.symbol))
    .where(and(eq(pick.seasonId, current.id), inArray(pick.category, current.categories)))
    .groupBy(instrument.symbol, pick.category)

  const symbols = [...new Set([...rows.map(r => r.symbol), BENCHMARK_SYMBOL])]
  const [startCloses, lastCloses] = await Promise.all([
    closesOnOrBefore(symbols, current.startDate),
    closesOnOrBefore(symbols, lastDateOf(current)),
  ])

  const returnOf = (symbol: string): number | null => {
    const start = startCloses.get(symbol)?.close
    const last = lastCloses.get(symbol)?.close
    return start && last !== undefined ? last / start - 1 : null
  }
  const benchmarkReturn = returnOf(BENCHMARK_SYMBOL)

  const instruments = rows
    .map(r => ({
      ...r,
      start: startCloses.get(r.symbol) ?? null,
      last: lastCloses.get(r.symbol) ?? null,
      return: returnOf(r.symbol),
    }))
    // najlepszy wynik pierwszy, spółki bez cen na końcu
    .sort((a, b) => (b.return ?? -Infinity) - (a.return ?? -Infinity) || b.pickers - a.pickers)

  const usedDates = symbols.map(s => lastCloses.get(s)?.date).filter((d): d is string => !!d)
  const asOf = usedDates.length ? usedDates.reduce((a, b) => (a > b ? a : b)) : null

  return {
    season: {
      year: current.year,
      startDate: current.startDate,
      endDate: current.endDate,
      categories: current.categories,
    },
    asOf,
    benchmark: benchmarkReturn === null ? null : { symbol: BENCHMARK_SYMBOL, return: benchmarkReturn },
    instruments,
  }
}
