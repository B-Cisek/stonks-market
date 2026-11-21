// Czysta logika mapowania odpowiedzi Yahoo Finance — bez importów runtime,
// żeby dało się ją sprawdzić gołym Node (skrypt weryfikacyjny).

export type PickCategory = 'pl' | 'eu' | 'world'

// Biała lista giełd po kodzie `exchange` z Yahoo. Poza listą celowo: OTC (PNK, OQX, OID),
// regionalne niemieckie (FRA, MUN, STU, DUS, HAM, HAN), parkiety wtórne / MTF (IOB, CXE, BTS, TLO, NEO)
// i PCX (prawie same ETF-y).
export const EXCHANGE_CATEGORY: Record<string, PickCategory> = {
  WSE: 'pl',

  GER: 'eu', // XETRA
  PAR: 'eu',
  AMS: 'eu',
  BRU: 'eu',
  LIS: 'eu',
  MIL: 'eu',
  MCE: 'eu', // Madryt
  LSE: 'eu',
  EBS: 'eu', // Szwajcaria
  VIE: 'eu',
  STO: 'eu',
  CPH: 'eu',
  HEL: 'eu',
  OSL: 'eu',
  ISE: 'eu',
  PRA: 'eu',
  BUD: 'eu',
  BVB: 'eu', // Bukareszt

  NYQ: 'world',
  NMS: 'world',
  NGM: 'world',
  NCM: 'world',
  ASE: 'world',
  TOR: 'world',
  JPX: 'world',
  HKG: 'world',
  ASX: 'world',
  KSC: 'world',
  NSI: 'world',
  SAO: 'world',
  SES: 'world',
}

export interface StockCandidate {
  symbol: string
  name: string
  exchange: string
  exchangeName: string
  category: PickCategory
}

export interface StockDetails {
  symbol: string
  name: string
  exchange: string
  currency: string
  category: PickCategory
}

export interface PriceRow {
  date: string // YYYY-MM-DD w strefie giełdy
  close: string
}

export function categoryForExchange(exchange: string | undefined): PickCategory | null {
  if (!exchange || !Object.hasOwn(EXCHANGE_CATEGORY, exchange)) return null
  return EXCHANGE_CATEGORY[exchange]!
}

// Znaki, których NFD nie rozkłada na literę + znak diakrytyczny.
const SPECIAL_LETTERS: Record<string, string> = { ł: 'l', ø: 'o', ß: 'ss', æ: 'ae', œ: 'oe' }

// Zapytanie do wyszukiwarki Yahoo (i klucz cache): bez diakrytyków, małymi literami, pojedyncze spacje.
// Yahoo gubi wyniki dla części znaków diakrytycznych („żabka” nie znajduje ZAB.WA, „zabka” znajduje).
export function toSearchQuery(q: string): string {
  return q
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[łøßæœ]/g, ch => SPECIAL_LETTERS[ch]!)
    .replace(/\s+/g, ' ')
}

// Pozycja z wyników wyszukiwania → kandydat do wyboru albo null (nie-akcja, giełda spoza listy).
export function toStockCandidate(q: {
  symbol?: string
  quoteType?: string
  exchange?: string
  exchDisp?: string
  longname?: string
  shortname?: string
}): StockCandidate | null {
  if (!q.symbol || q.quoteType !== 'EQUITY') return null

  const category = categoryForExchange(q.exchange)

  if (!category) return null

  return {
    symbol: q.symbol,
    // shortname bywa nieczytelne (np. „PKN C.XWAR PLN”)
    name: (q.longname ?? q.shortname ?? q.symbol).trim(),
    exchange: q.exchange!,
    exchangeName: q.exchDisp ?? q.exchange!,
    category,
  }
}

// Notowanie z quote() → dane do zapisu instrumentu albo null (te same filtry + wymagana waluta).
export function toStockDetails(q: {
  symbol: string
  quoteType?: string
  exchange?: string
  currency?: string
  longName?: string
  shortName?: string
}): StockDetails | null {
  if (q.quoteType !== 'EQUITY' || !q.currency) return null
  const category = categoryForExchange(q.exchange)
  if (!category) return null
  return {
    symbol: q.symbol,
    name: (q.longName ?? q.shortName ?? q.symbol).trim(),
    exchange: q.exchange!,
    currency: q.currency,
    category,
  }
}

// Świece dzienne → wiersze instrument_price. `close` od Yahoo jest skorygowane o splity (bez dywidend).
export function toPriceRows(
  quotes: { date: Date, close?: number | null }[],
  timeZone: string,
): PriceRow[] {
  const formatDate = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  // Yahoo potrafi dorzucić dodatkową świecę w chwili zdarzenia (dywidenda, split) — dwa wiersze z tą samą datą
  // wywaliłyby upsert („ON CONFLICT DO UPDATE command cannot affect row a second time”), więc zostaje ostatni.
  const byDate = new Map<string, PriceRow>()
  for (const q of quotes) {
    if (q.close == null) continue
    const date = formatDate.format(q.date)
    byDate.set(date, { date, close: q.close.toFixed(4) })
  }
  return [...byDate.values()]
}
