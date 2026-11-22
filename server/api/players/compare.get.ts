import { BENCHMARK_SYMBOL } from '../../utils/benchmark'
import { averageReturns, getSeasonSeries } from '../../utils/history'
import { getRanking, getRankingSeason } from '../../utils/ranking'
import type { RankingPlayer } from '../../utils/ranking'

// tyle, ile kolorów ma domyślna paleta UChart (--ui-chart-1…6); to samo w app/pages/porownanie.vue
const MAX_COMPARED = 6

export interface CompareHistoryPoint {
  date: string
  benchmark: number | null
  // średni wynik każdego gracza, w kolejności `players`; null, dopóki któraś spółka nie ma ceny
  players: (number | null)[]
}

// GET /api/players/compare?ids=<id>,<id> — dzienna historia wyników kilku graczy na tle S&P 500.
// Bierze tylko graczy z rankingu (z kompletem wyborów); pozostałe id pomija.
export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const raw = getQuery(event).ids
  const ids = [...new Set((typeof raw === 'string' ? raw : '').split(',').map(s => s.trim()).filter(Boolean))]
  if (ids.length > MAX_COMPARED) {
    throw createError({ statusCode: 400, statusMessage: `Można porównać najwyżej ${MAX_COMPARED} graczy` })
  }

  // bez sezonu — pusty wynik jak w /api/ranking, żeby strona pokazała zwykły komunikat
  const current = await getRankingSeason()
  const ranking = await getRanking(current)
  if (!current) {
    return { ...ranking, total: 0, history: [] as CompareHistoryPoint[] }
  }

  const byId = new Map(ranking.players.map(p => [p.userId, p]))
  // kolejność z zapytania — tak samo jak tagi w polu wyboru
  const players = ids.map(id => byId.get(id)).filter((p): p is RankingPlayer => !!p)

  const symbols = [...new Set([...players.flatMap(p => p.picks.map(pick => pick.symbol)), BENCHMARK_SYMBOL])]
  const series = await getSeasonSeries(current, symbols)
  const perPlayer = players.map(p => averageReturns(series, p.picks.map(pick => pick.symbol)))
  const benchmark = series.returns.get(BENCHMARK_SYMBOL)!

  const history: CompareHistoryPoint[] = series.dates.map((date, d) => ({
    date,
    benchmark: benchmark[d] ?? null,
    players: perPlayer.map(r => r[d] ?? null),
  }))

  return {
    season: ranking.season,
    asOf: ranking.asOf,
    benchmark: ranking.benchmark,
    total: ranking.players.length,
    players,
    history,
  }
})
