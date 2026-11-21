import { eq, sql } from 'drizzle-orm'
import { db } from '../../db'
import { instrument, pick } from '../../db/schema'
import type { assetCategory } from '../../db/schema'
import { lookupStock } from '../../utils/market/yahoo'
import { getEntrySeason } from '../../utils/season'

type Category = typeof assetCategory.enumValues[number]

interface PickInput {
  category: Category
  symbol: string
}

function parseBody(body: unknown, categories: Category[]): PickInput[] {
  const picks = (body as { picks?: unknown } | null)?.picks
  if (!Array.isArray(picks) || picks.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Brak wyborów do zapisania' })
  }

  const seen = new Set<Category>()
  return picks.map((p: unknown) => {
    const { category, symbol } = (p ?? {}) as Record<string, unknown>
    if (!categories.includes(category as Category) || seen.has(category as Category)) {
      throw createError({ statusCode: 400, statusMessage: 'Nieprawidłowa kategoria' })
    }
    if (typeof symbol !== 'string' || symbol.trim().length === 0 || symbol.length > 20) {
      throw createError({ statusCode: 400, statusMessage: 'Nieprawidłowy ticker' })
    }
    seen.add(category as Category)
    return { category: category as Category, symbol: symbol.trim() }
  })
}

// Instrument z bazy albo nowo zweryfikowany w Yahoo (filtry jak w wyszukiwarce). Zwraca kanoniczny ticker.
async function resolveInstrument({ category, symbol }: PickInput): Promise<string> {
  const [existing] = await db
    .select({ symbol: instrument.symbol, category: instrument.category })
    .from(instrument)
    .where(eq(instrument.symbol, symbol))

  if (existing) {
    // kategoria w bazie ma pierwszeństwo (mogła zostać poprawiona ręcznie); null = indeks, niedozwolony
    if (existing.category !== category) {
      throw createError({ statusCode: 400, statusMessage: `${symbol} nie pasuje do tej kategorii` })
    }
    return existing.symbol
  }

  let details
  try {
    details = await lookupStock(symbol)
  }
  catch (error) {
    console.error(`[picks] Yahoo lookup ${symbol} failed:`, error)
    throw createError({ statusCode: 502, statusMessage: 'Nie udało się sprawdzić instrumentu, spróbuj za chwilę' })
  }

  if (!details) {
    throw createError({ statusCode: 400, statusMessage: `${symbol} nie jest dozwolonym instrumentem` })
  }
  if (details.category !== category) {
    throw createError({ statusCode: 400, statusMessage: `${symbol} nie pasuje do tej kategorii` })
  }

  await db
    .insert(instrument)
    .values({ ...details, type: 'stock' })
    .onConflictDoNothing()

  return details.symbol
}

// PUT /api/picks { picks: [{ category, symbol }] } — zapis/zmiana wyborów w otwartym oknie zapisów.
// Można wysłać tylko część kategorii; pozostałe wybory zostają bez zmian.
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const current = await getEntrySeason()
  if (!current) {
    throw createError({ statusCode: 409, statusMessage: 'Zapisy do sezonu są zamknięte' })
  }

  const inputs = parseBody(await readBody(event), current.categories)

  // wybory zapisywane dopiero po walidacji wszystkich — błąd jednego tickera nie zapisuje pozostałych
  // (instrument dodany po drodze może zostać bez wyborów, jak po zmianie wyboru — job go pomija)
  const resolved: PickInput[] = []
  for (const input of inputs) {
    resolved.push({ category: input.category, symbol: await resolveInstrument(input) })
  }

  await db
    .insert(pick)
    .values(resolved.map(p => ({ seasonId: current.id, userId: user.id, ...p })))
    .onConflictDoUpdate({
      target: [pick.seasonId, pick.userId, pick.category],
      set: { symbol: sql`excluded.symbol`, updatedAt: new Date() },
    })

  return { ok: true }
})
