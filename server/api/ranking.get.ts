import { getRanking, getRankingSeason } from '../utils/ranking'
import type { Ranking } from '../utils/ranking'

// GET /api/ranking — ranking bieżącego sezonu (ostatni, który już wystartował), liczony w locie z ostatnich cen.
export default defineEventHandler(async (event): Promise<Ranking> => {
  await requireUserSession(event)
  return getRanking(await getRankingSeason())
})
