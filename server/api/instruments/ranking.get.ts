import { getInstrumentRanking, getRankingSeason } from '../../utils/ranking'
import type { InstrumentRanking } from '../../utils/ranking'

// GET /api/instruments/ranking — spółki wybrane w bieżącym sezonie z wynikiem od startu sezonu i liczbą graczy.
export default defineEventHandler(async (event): Promise<InstrumentRanking> => {
  await requireUserSession(event)
  return getInstrumentRanking(await getRankingSeason())
})
