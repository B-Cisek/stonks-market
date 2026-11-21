import { relations } from 'drizzle-orm'
import {
  pgTable,
  pgEnum,
  text,
  char,
  integer,
  date,
  numeric,
  timestamp,
  primaryKey,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core'
import { user } from './auth'

export const assetCategory = pgEnum('asset_category', ['pl', 'eu', 'world', 'commodity', 'crypto'])

export const instrumentType = pgEnum('instrument_type', ['stock', 'index', 'commodity', 'crypto'])

// Instrument zapisany raz; PK to ticker dostawcy danych (np. PKN.WA, ^GSPC).
export const instrument = pgTable('instrument', {
  symbol: text('symbol').primaryKey(),
  name: text('name').notNull(),
  exchange: text('exchange'),
  currency: char('currency', { length: 3 }).notNull(),
  type: instrumentType('type').notNull(),
  // null dla indeksów (benchmark nie jest do wyboru)
  category: assetCategory('category'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
})

// Zamknięcia dzienne skorygowane o splity; job robi upsert całej historii sezonu.
export const instrumentPrice = pgTable(
  'instrument_price',
  {
    symbol: text('symbol')
      .notNull()
      .references(() => instrument.symbol, { onDelete: 'cascade', onUpdate: 'cascade' }),
    date: date('date').notNull(),
    close: numeric('close').notNull(),
  },
  table => [primaryKey({ columns: [table.symbol, table.date] })],
)

export const season = pgTable('season', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  year: integer('year').notNull().unique(),
  entryOpensAt: timestamp('entry_opens_at', { withTimezone: true }).notNull(),
  entryClosesAt: timestamp('entry_closes_at', { withTimezone: true }).notNull(),
  // dzień, z którego zamknięcie jest ceną startową
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  // aktywne sloty
  categories: assetCategory('categories').array().notNull().default(['pl', 'eu', 'world']),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Wybór gracza w danej kategorii sezonu; cena startowa wyliczana z instrument_price.
export const pick = pgTable(
  'pick',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    seasonId: integer('season_id')
      .notNull()
      .references(() => season.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    category: assetCategory('category').notNull(),
    symbol: text('symbol')
      .notNull()
      .references(() => instrument.symbol, { onDelete: 'restrict', onUpdate: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  table => [
    // pokrywa też zapytania po samym season_id
    uniqueIndex('pick_season_user_category_uq').on(table.seasonId, table.userId, table.category),
    index('pick_symbol_idx').on(table.symbol),
  ],
)

export const instrumentRelations = relations(instrument, ({ many }) => ({
  prices: many(instrumentPrice),
  picks: many(pick),
}))

export const instrumentPriceRelations = relations(instrumentPrice, ({ one }) => ({
  instrument: one(instrument, {
    fields: [instrumentPrice.symbol],
    references: [instrument.symbol],
  }),
}))

export const seasonRelations = relations(season, ({ many }) => ({
  picks: many(pick),
}))

// user → many picks pominięte: userRelations żyje w generowanym auth.ts.
export const pickRelations = relations(pick, ({ one }) => ({
  season: one(season, {
    fields: [pick.seasonId],
    references: [season.id],
  }),
  instrument: one(instrument, {
    fields: [pick.symbol],
    references: [instrument.symbol],
  }),
  user: one(user, {
    fields: [pick.userId],
    references: [user.id],
  }),
}))
