# Model danych gry — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodać do bazy tabele gry (`instrument`, `instrument_price`, `season`, `pick`) jako schemat Drizzle + migrację.

**Architecture:** Nowy plik `server/db/schema/game.ts` obok wygenerowanego `auth.ts`, eksportowany z `schema/index.ts`.
Migracja generowana przez `drizzle-kit generate` i stosowana przez istniejący plugin `server/plugins/migrate.ts`
(oraz `pnpm db:migrate` lokalnie). Ograniczenia bazy weryfikuje skrypt SQL uruchamiany w kontenerze Postgresa
w transakcji z `ROLLBACK`.

**Tech Stack:** Nuxt 4, Drizzle ORM 0.45 (`drizzle-orm/pg-core`), drizzle-kit 0.31, Postgres 18 (podman compose, kontener `sm-db`).

**Spec:** `docs/superpowers/specs/2026-11-21-game-data-model-design.md`

## Global Constraints

- Tylko schemat i migracja — bez API, UI, jobów pobierania cen, seedów.
- Nie edytować `server/db/schema/auth.ts` (generowany przez `pnpm auth:generate`, zostałby nadpisany).
- Nazwy kolumn w bazie w `snake_case`, pola TS w `camelCase` — jak w `auth.ts`.
- Ceny jako `numeric` bez precyzji (Drizzle zwraca `string`).
- `pnpm lint` musi przechodzić (ESLint stylistic).

## Review Focus

1. Zmiana tickera (FB → META): `UPDATE instrument SET symbol = …` musi przenieść `pick` i `instrument_price` (on update cascade) — test w skrypcie.
2. Usunięcie instrumentu, który ma wybory, musi się nie udać (on delete restrict); bez wyborów — kasuje też jego ceny (cascade) — test w skrypcie.
3. Drugi wybór tej samej kategorii przez tego samego gracza w sezonie musi się nie udać; ta sama kategoria w innym sezonie — OK — test w skrypcie.
4. Usunięcie konta gracza kasuje jego wybory — test w skrypcie.
5. Nowy sezon bez podanych kategorii dostaje `{pl,eu,world}` — test w skrypcie.

---

### Task 1: Schemat gry, migracja i test ograniczeń

**Files:**
- Create: `server/db/tests/game-schema.sql`
- Create: `server/db/schema/game.ts`
- Modify: `server/db/schema/index.ts`
- Modify: `package.json` (skrypt `db:test`)
- Create (generowane): `server/db/migrations/0001_game_schema.sql`, `server/db/migrations/meta/0001_snapshot.json`, zmiana `meta/_journal.json`

**Interfaces:**
- Consumes: `user` z `server/db/schema/auth.ts` (`user.id: text`).
- Produces (eksporty `server/db/schema/game.ts`, dostępne też przez `~/server/db/schema`):
  - enumy: `assetCategory` (`'asset_category'`: `pl`, `eu`, `world`, `commodity`, `crypto`),
    `instrumentType` (`'instrument_type'`: `stock`, `index`, `commodity`, `crypto`)
  - tabele: `instrument`, `instrumentPrice`, `season`, `pick`
  - relacje: `instrumentRelations`, `instrumentPriceRelations`, `seasonRelations`, `pickRelations`

- [ ] **Step 1: Uruchom bazę**

Run: `pnpm db:up && podman exec sm-db pg_isready -U admin -d stonks_market`
Expected: `accepting connections`

- [ ] **Step 2: Napisz test ograniczeń `server/db/tests/game-schema.sql`**

Cały skrypt w `BEGIN … ROLLBACK`, każde oczekiwanie jako blok `DO` rzucający `RAISE EXCEPTION`, gdy się nie spełni:

```sql
BEGIN;

INSERT INTO "user" (id, name, email) VALUES ('u1', 'u1', 'u1@test.local');
INSERT INTO instrument (symbol, name, exchange, currency, type, category)
VALUES ('PKN.WA', 'Orlen', 'WSE', 'PLN', 'stock', 'pl'),
       ('^GSPC', 'S&P 500', 'SNP', 'USD', 'index', NULL);
INSERT INTO season (year, entry_opens_at, entry_closes_at, start_date, end_date)
VALUES (2027, '2026-12-15T00:00:00+01', '2027-01-04T23:59:00+01', '2027-01-04', '2027-12-31'),
       (2028, '2027-12-15T00:00:00+01', '2028-01-03T23:59:00+01', '2028-01-03', '2028-12-31');
INSERT INTO pick (season_id, user_id, category, symbol)
SELECT id, 'u1', 'pl', 'PKN.WA' FROM season;              -- po jednym w 2027 i 2028
INSERT INTO instrument_price (symbol, date, close) VALUES ('PKN.WA', '2027-01-04', '60.5');

DO $$ BEGIN
  IF (SELECT categories FROM season WHERE year = 2027) <> '{pl,eu,world}'::asset_category[] THEN
    RAISE EXCEPTION 'season.categories default is not {pl,eu,world}';
  END IF;

  BEGIN
    INSERT INTO pick (season_id, user_id, category, symbol)
    SELECT id, 'u1', 'pl', 'PKN.WA' FROM season WHERE year = 2027;
    RAISE EXCEPTION 'duplicate pick in same season/category allowed';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  BEGIN
    INSERT INTO instrument_price (symbol, date, close) VALUES ('PKN.WA', '2027-01-04', '61');
    RAISE EXCEPTION 'duplicate price for same symbol/date allowed';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  BEGIN
    INSERT INTO instrument (symbol, name, exchange, currency, type, category)
    VALUES ('PKN.WA', 'dup', 'WSE', 'PLN', 'stock', 'pl');
    RAISE EXCEPTION 'duplicate instrument symbol allowed';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  BEGIN
    DELETE FROM instrument WHERE symbol = 'PKN.WA';
    RAISE EXCEPTION 'instrument with picks deleted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;

UPDATE instrument SET symbol = 'PKN2.WA' WHERE symbol = 'PKN.WA';
DO $$ BEGIN
  IF (SELECT count(*) FROM pick WHERE symbol = 'PKN2.WA') <> 2
     OR (SELECT count(*) FROM instrument_price WHERE symbol = 'PKN2.WA') <> 1 THEN
    RAISE EXCEPTION 'symbol rename did not cascade';
  END IF;
END $$;

DELETE FROM "user" WHERE id = 'u1';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pick) THEN RAISE EXCEPTION 'user delete did not cascade to picks'; END IF;
END $$;

DELETE FROM instrument WHERE symbol = 'PKN2.WA';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM instrument_price) THEN RAISE EXCEPTION 'instrument delete did not cascade to prices'; END IF;
END $$;

ROLLBACK;
```

Dodaj do `package.json` → `scripts`:
`"db:test": "podman exec -i sm-db psql -U admin -d stonks_market -v ON_ERROR_STOP=1 -q < server/db/tests/game-schema.sql"`

- [ ] **Step 3: Uruchom test — ma nie przejść**

Run: `pnpm db:test`
Expected: FAIL, `ERROR:  relation "instrument" does not exist`

- [ ] **Step 4: Napisz `server/db/schema/game.ts`**

Wzoruj się na stylu `auth.ts` (`pgTable(name, columns, table => [...])`, `timestamp(...).defaultNow()`, `$onUpdate`).

| tabela (TS / SQL) | kolumny |
|---|---|
| `instrument` / `instrument` | `symbol` text PK · `name` text not null · `exchange` text · `currency` `char({ length: 3 })` not null · `type` `instrumentType` not null · `category` `assetCategory` (nullable — null dla indeksów) · `createdAt`/`updatedAt` jak `user` w `auth.ts` |
| `instrumentPrice` / `instrument_price` | `symbol` text not null → `instrument.symbol` (`onDelete: 'cascade', onUpdate: 'cascade'`) · `date` `date` not null · `close` `numeric` not null · PK `primaryKey({ columns: [symbol, date] })` |
| `season` / `season` | `id` `integer().primaryKey().generatedAlwaysAsIdentity()` · `year` integer not null unique · `entryOpensAt`/`entryClosesAt` `timestamp({ withTimezone: true })` not null · `startDate`/`endDate` `date` not null · `categories` `assetCategory().array()` not null default `['pl', 'eu', 'world']` · `createdAt` |
| `pick` / `pick` | `id` identity PK · `seasonId` integer not null → `season.id` (`onDelete: 'cascade'`) · `userId` text not null → `user.id` (`onDelete: 'cascade'`) · `category` `assetCategory` not null · `symbol` text not null → `instrument.symbol` (`onDelete: 'restrict', onUpdate: 'cascade'`) · `createdAt`/`updatedAt` · `uniqueIndex('pick_season_user_category_uq').on(seasonId, userId, category)` · `index('pick_symbol_idx').on(symbol)` |

Osobny indeks na `season_id` z spec pomijamy — pokrywa go unikalny indeks zaczynający się od `season_id`.

Relacje (`relations` z `drizzle-orm`): instrument → many prices, many picks; instrumentPrice → one instrument;
season → many picks; pick → one season, one instrument, one user.
Relacji `user → many picks` nie dodajemy, bo `userRelations` żyje w generowanym `auth.ts`; wybory gracza czytamy od strony `pick`.

W `server/db/schema/index.ts` dodaj `export * from './game'`.

- [ ] **Step 5: Wygeneruj migrację**

Run: `pnpm db:generate --name game_schema`
Expected: powstaje `server/db/migrations/0001_game_schema.sql` z `CREATE TYPE "public"."asset_category"`, `"instrument_type"`,
czterema `CREATE TABLE`, FK z `ON DELETE restrict ON UPDATE cascade` dla `pick.symbol` i `ON UPDATE cascade` dla `instrument_price.symbol`,
oraz `DEFAULT '{"pl","eu","world"}'` dla `season.categories`. Przejrzyj plik — żadnych zmian w tabelach auth.

- [ ] **Step 6: Zastosuj migrację**

Run: `pnpm db:migrate`
Expected: kończy się bez błędu.

- [ ] **Step 7: Uruchom test — ma przejść**

Run: `pnpm db:test`
Expected: brak wyjścia, exit code 0.

- [ ] **Step 8: Lint**

Run: `pnpm lint`
Expected: brak błędów. (`nuxt typecheck` pominięty — w projekcie nie ma `vue-tsc`; poprawność typów schematu
potwierdza to, że `drizzle-kit generate` załadował plik, a zapytania typów sprawdzi IDE.)

- [ ] **Step 9: Commit**

```bash
git add server/db/schema/game.ts server/db/schema/index.ts server/db/tests/game-schema.sql server/db/migrations package.json
git commit -m "Add game data model schema"
```
