import { and, asc, gte, inArray, lte } from 'drizzle-orm'
import { db } from '../db'
import { instrumentPrice } from '../db/schema'
import { lastDateOf } from './ranking'
import type { RankingSeason } from './ranking'

// zapas przed startem sezonu, żeby znaleźć cenę startową, gdy start wypada w dzień wolny giełdy
const LOOKBACK_DAYS = 10

type Close = { date: string, close: number }

export interface SeasonSeries {
  // oś dat: dzień startu + każda sesja po nim na którejkolwiek giełdzie
  dates: string[]
  // cena startowa: ostatnie zamknięcie ≤ start_date (tak samo jak w rankingu)
  starts: Map<string, Close | null>
  // ostatnie zamknięcie w sezonie
  lasts: Map<string, Close | null>
  // wynik od startu na każdy dzień z `dates` (ceny przenoszone przez dni wolne); null, dopóki brak ceny
  returns: Map<string, (number | null)[]>
}

function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Dzienna historia wyników symboli w sezonie — jedno zapytanie o ceny, dalej liczone w pamięci.
export async function getSeasonSeries(current: RankingSeason, symbols: string[]): Promise<SeasonSeries> {
  const prices = symbols.length
    ? await db
        .select({ symbol: instrumentPrice.symbol, date: instrumentPrice.date, close: instrumentPrice.close })
        .from(instrumentPrice)
        .where(and(
          inArray(instrumentPrice.symbol, symbols),
          gte(instrumentPrice.date, shiftDate(current.startDate, -LOOKBACK_DAYS)),
          lte(instrumentPrice.date, lastDateOf(current)),
        ))
        .orderBy(asc(instrumentPrice.date))
    : []

  const series = new Map<string, Close[]>(symbols.map(s => [s, []]))
  for (const p of prices) series.get(p.symbol)!.push({ date: p.date, close: Number(p.close) })

  const starts = new Map(symbols.map(s => [s, series.get(s)!.findLast(p => p.date <= current.startDate) ?? null]))
  const lasts = new Map(symbols.map(s => [s, series.get(s)!.at(-1) ?? null]))

  const dates = [current.startDate, ...new Set(prices.map(p => p.date).filter(d => d > current.startDate))]

  // jeden przebieg po dacie rosnąco na symbol (kursor), żeby nie szukać zamknięcia od nowa dla każdego dnia
  const returns = new Map(symbols.map((symbol) => {
    const list = series.get(symbol)!
    const start = starts.get(symbol)?.close
    let i = -1
    return [symbol, dates.map((date) => {
      while (i + 1 < list.length && list[i + 1]!.date <= date) i++
      return start && i >= 0 ? list[i]!.close / start - 1 : null
    })]
  }))

  return { dates, starts, lasts, returns }
}

// Średni wynik zestawu spółek na każdy dzień; null, dopóki któraś spółka nie ma ceny.
export function averageReturns(series: SeasonSeries, symbols: string[]): (number | null)[] {
  return series.dates.map((_, d) => {
    const values = symbols.map(s => series.returns.get(s)?.[d] ?? null)
    return values.length && values.every(v => v !== null)
      ? (values as number[]).reduce((a, b) => a + b, 0) / values.length
      : null
  })
}
