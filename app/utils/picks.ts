// Odpowiednik enuma `asset_category` z server/db/schema/game.ts
export type Category = 'pl' | 'eu' | 'world' | 'commodity' | 'crypto'

export const CATEGORY_LABELS: Record<Category, string> = {
  pl: 'Polska',
  eu: 'Europa',
  world: 'Świat',
  commodity: 'Surowiec',
  crypto: 'Krypto',
}

// Spółka w searchboxie wyboru — z wyników wyszukiwania albo z zapisanego wyboru.
export interface StockOption {
  symbol: string
  name: string
  exchange: string | null
}
