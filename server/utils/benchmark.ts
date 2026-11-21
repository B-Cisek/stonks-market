import type { instrument } from '../db/schema'

// Benchmark sezonu — zawsze S&P 500 (ticker Yahoo). Job cen dodaje go do bazy, jeśli go brak.
export const BENCHMARK_SYMBOL = '^GSPC'

export const BENCHMARK_INSTRUMENT: typeof instrument.$inferInsert = {
  symbol: BENCHMARK_SYMBOL,
  name: 'S&P 500',
  exchange: 'SNP',
  currency: 'USD',
  type: 'index',
  category: null,
}
