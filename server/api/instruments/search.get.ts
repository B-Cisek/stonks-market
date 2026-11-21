import { searchStocks } from '../../utils/market/yahoo'
import type { PickCategory } from '../../utils/market/normalize'

const CATEGORIES: PickCategory[] = ['pl', 'eu', 'world']

// GET /api/instruments/search?q=<tekst>&category=<pl|eu|world> — wyszukiwarka do modala wyboru.
export default defineEventHandler(async (event) => {
  // tylko zalogowani — chroni limity Yahoo przed anonimowym ruchem
  await requireUserSession(event)

  const query = getQuery(event)
  const q = typeof query.q === 'string' ? query.q.trim() : ''
  if (q.length < 2 || q.length > 50) {
    throw createError({ statusCode: 400, statusMessage: 'Wpisz od 2 do 50 znaków' })
  }

  const category = query.category
  if (category !== undefined && !CATEGORIES.includes(category as PickCategory)) {
    throw createError({ statusCode: 400, statusMessage: 'Nieznana kategoria' })
  }

  let results
  try {
    results = await searchStocks(q)
  }
  catch (error) {
    console.error('[search] Yahoo search failed:', error)
    throw createError({ statusCode: 502, statusMessage: 'Wyszukiwarka chwilowo nie działa, spróbuj za chwilę' })
  }

  return category ? results.filter(c => c.category === category) : results
})
