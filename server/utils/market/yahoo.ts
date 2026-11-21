import YahooFinance from 'yahoo-finance2'
import { toPriceRows, toSearchQuery, toStockCandidate, toStockDetails } from './normalize'
import type { PriceRow, StockCandidate, StockDetails } from './normalize'

// Jedna instancja na proces (trzyma ciasteczka/crumb Yahoo).
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] })

// Wyszukiwanie z cache (1 h) — kilku widzów wpisujących to samo nie generuje osobnych zapytań do Yahoo.
// Błędy nie są cache'owane.
export const searchStocks = defineCachedFunction(
  async (q: string): Promise<StockCandidate[]> => {
    const { quotes } = await yf.search(toSearchQuery(q), { quotesCount: 20, newsCount: 0 })
    return quotes
      .map(quote => toStockCandidate(quote as Parameters<typeof toStockCandidate>[0]))
      .filter(candidate => candidate !== null)
  },
  {
    name: 'market-search',
    maxAge: 3600,
    getKey: (q: string) => toSearchQuery(q),
  },
)

// Ponowna walidacja tickera przy zapisie wyboru; null = nieznany albo niedozwolony.
export async function lookupStock(symbol: string): Promise<StockDetails | null> {
  const quote = await yf.quote(symbol)
  if (!quote) return null
  return toStockDetails(quote)
}

// Dzienne zamknięcia w zakresie [from, to), daty YYYY-MM-DD.
export async function fetchHistory(symbol: string, from: string, to: string): Promise<PriceRow[]> {
  const { meta, quotes } = await yf.chart(symbol, { period1: from, period2: to, interval: '1d' })
  return toPriceRows(quotes, meta.exchangeTimezoneName)
}
