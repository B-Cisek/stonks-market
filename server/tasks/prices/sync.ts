import { setTimeout as sleep } from 'node:timers/promises'
import { eq, sql } from 'drizzle-orm'
import { db } from '../../db'
import { instrument, instrumentPrice, pick, season } from '../../db/schema'
import { BENCHMARK_INSTRUMENT, BENCHMARK_SYMBOL } from '../../utils/game'
import { fetchHistory } from '../../utils/market/yahoo'

// zapas na święta przed startem sezonu i późne korekty dostawcy po jego końcu
const SEASON_MARGIN_DAYS = 7
// odstęp między zapytaniami do Yahoo
const REQUEST_DELAY_MS = 500

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Pobiera całą historię zamknięć aktywnych sezonów (symbole z wyborami + benchmark) i robi upsert.
// Każdy przebieg nadpisuje całą historię, więc pominięty dzień, splity i korekty poprawiają się same.
export default defineTask({
  meta: {
    name: 'prices:sync',
    description: 'Pobiera zamknięcia dzienne instrumentów z wyborami i benchmarku',
  },
  async run() {
    await db.insert(instrument).values(BENCHMARK_INSTRUMENT).onConflictDoNothing()

    const today = new Date().toISOString().slice(0, 10)
    const seasons = await db
      .select({ id: season.id, startDate: season.startDate, endDate: season.endDate })
      .from(season)
      .where(sql`${season.startDate} - ${SEASON_MARGIN_DAYS}::int <= ${today}::date
        and ${season.endDate} + ${SEASON_MARGIN_DAYS}::int >= ${today}::date`)

    if (seasons.length === 0) {
      console.info('[prices:sync] Brak aktywnego sezonu')
      return { result: { ok: 0, failed: [] as string[] } }
    }

    let ok = 0
    const failed: string[] = []

    for (const s of seasons) {
      const picked = await db.selectDistinct({ symbol: pick.symbol }).from(pick).where(eq(pick.seasonId, s.id))
      const symbols = [...new Set([...picked.map(p => p.symbol), BENCHMARK_SYMBOL])]
      const from = addDays(s.startDate, -SEASON_MARGIN_DAYS)
      const to = addDays(today < s.endDate ? today : s.endDate, 1)

      for (const [i, symbol] of symbols.entries()) {
        if (i > 0) await sleep(REQUEST_DELAY_MS)
        try {
          const rows = await fetchHistory(symbol, from, to)
          if (rows.length > 0) {
            await db
              .insert(instrumentPrice)
              .values(rows.map(row => ({ symbol, ...row })))
              .onConflictDoUpdate({
                target: [instrumentPrice.symbol, instrumentPrice.date],
                set: { close: sql`excluded.close` },
              })
          }
          ok++
        }
        catch (error) {
          console.error(`[prices:sync] ${symbol} failed:`, error)
          failed.push(symbol)
        }
      }
    }

    console.info(`[prices:sync] ok: ${ok}, failed: ${failed.length}`, failed)
    return { result: { ok, failed } }
  },
})
