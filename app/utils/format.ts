// Formatery i drobne helpery widoków rankingu.

export const percent = new Intl.NumberFormat('pl-PL', {
  style: 'percent',
  signDisplay: 'exceptZero',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export const longDate = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'long', timeZone: 'UTC' })

export function trendClass(value: number | null | undefined) {
  if (!value) return 'text-muted'
  return value > 0 ? 'text-success' : 'text-error'
}

// porównanie bez wielkości liter i polskich znaków (ł nie rozkłada się w NFD)
export const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLowerCase()

// czy któryś z tekstów zawiera frazę (po `fold`); pusta fraza pasuje do wszystkiego
export function matchesText(texts: (string | null | undefined)[], query: string) {
  const q = fold(query.trim())
  return !q || texts.some(text => !!text && fold(text).includes(q))
}

const price = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 4 })

// waluta jako kod z Yahoo (np. GBp = pensy), bez Intl.currency, które nie zna jednostek typu GBp
export const formatPrice = (close: number, currency: string) => `${price.format(close)} ${currency}`

// punkty procentowe, np. różnica wyniku do S&P 500
export const points = new Intl.NumberFormat('pl-PL', { signDisplay: 'exceptZero', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const shortDate = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', timeZone: 'UTC' })
