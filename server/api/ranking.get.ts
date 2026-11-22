import { getRanking, getRankingSeason } from '../utils/ranking'
import type { Ranking } from '../utils/ranking'

// GET /api/ranking — ranking bieżącego sezonu (ostatni, który już wystartował), liczony w locie z ostatnich cen.
// Publiczny — ranking widać bez logowania.
export default defineEventHandler(async (): Promise<Ranking> => {
  return getRanking(await getRankingSeason())
})
