# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projekt

Stonks Market — zabawa giełdowa (bez prawdziwych pieniędzy) dla społeczności streamera na Kicku. Gracz loguje się
kontem Kick, w sezonie (rok kalendarzowy) wybiera po jednym instrumencie na kategorię (`pl`, `eu`, `world`),
ranking porównuje średni wynik jego wyborów z S&P 500. Teksty UI i komentarze w kodzie są po polsku.

Model danych gry, reguły i decyzje: `docs/game-data-model.md`.

## Stack i wersje

Wersje zainstalowane wg `pnpm-lock.yaml`. W `package.json` część zależności ma `^`, więc obowiązują wersje z locka.

| Warstwa | Technologia | Wersja |
|---|---|---|
| Runtime | Node.js | 24 (obraz Dockera `node:24-slim`) |
| Menedżer pakietów | pnpm | 12.18.0 (`packageManager`, przez corepack) |
| Framework | Nuxt | 4.6.4 |
| | Nitro (`nitropack`) | 2.13.6 |
| | Vite | 8.3.8 |
| | Vue | 3.5.45 |
| | Vue Router | 5.5.1 |
| UI | Nuxt UI (`@nuxt/ui`) | 4.12.0 |
| | Tailwind CSS | 4.3.5 |
| | Tiptap (`@tiptap/*`) | 3.34.0 (zainstalowany, jeszcze nieużywany w `app/`) |
| | TanStack Charts (`@tanstack/charts`, peer dla `UChart`) | 1.5.0 |
| Auth | Better Auth (`better-auth`, `auth` CLI, `@better-auth/drizzle-adapter`) | 1.7.25 |
| | `@nuxtjs/better-auth` | 0.3.17 |
| Baza | PostgreSQL | 18.7 (`postgres:18.7-alpine`) |
| | Drizzle ORM | 0.45.4 |
| | drizzle-kit | 0.31.11 |
| | `pg` (node-postgres) | 8.23.1 |
| Dane rynkowe | `yahoo-finance2` (Yahoo Finance, bez klucza) | 4.0.6 |
| Język | TypeScript (`typescript` → alias `@typescript/typescript6`) | 6.0.2 |
| | `@typescript/native` (alias `typescript@7`, natywny kompilator) | 7.0.2 |
| Jakość | ESLint | 10.15.0 |
| | `@nuxt/eslint` | 1.17.0 |
| | `@nuxt/hints` | 1.1.5 |
| Kontenery lokalnie | Podman (`podman compose`) | 4.9.3 |
| Deploy | Docker + GHCR + GitHub Actions + Traefik (na VPS) | — |

## Komendy

```bash
pnpm db:up                          # Postgres 18 w podman compose (kontener sm-db, admin/admin, baza stonks_market)
pnpm dev                            # http://localhost:3000; przy starcie stosuje migracje
pnpm lint                           # ESLint (@nuxt/eslint, stylistic: bez średników, pojedyncze cudzysłowy)
pnpm lint:fix
pnpm build && pnpm preview

pnpm db:generate --name <nazwa>     # migracja z różnicy schematu → server/db/migrations
pnpm db:migrate                     # zastosuj migracje lokalnie (drizzle-kit)
pnpm db:studio
pnpm auth:generate                  # regeneruje server/db/schema/auth.ts z konfiguracji Better Auth
```

Brak frameworka testów i `vue-tsc` (więc `nuxt typecheck` nie działa) — weryfikacja to `pnpm lint`
oraz to, że `drizzle-kit generate` ładuje schemat. Konfiguracja lokalna: `.env` wg `.env.example`
(`DATABASE_URL`, `BETTER_AUTH_SECRET`, `KICK_CLIENT_ID/SECRET`).

## Architektura

Nuxt 4: frontend w `app/`, backend (Nitro) w `server/`, UI na Nuxt UI 4 (domyślne warianty w `app/app.config.ts`).

**Auth** — `@nuxtjs/better-auth` z jedynym providerem społecznościowym Kick (`server/auth.config.ts`),
adapter Drizzle na tym samym `db`. Ochrona stron przez `definePageMeta({ auth: 'user' | 'guest' })`,
przekierowania w `nuxt.config.ts` (`auth.redirects`). `auth.cli.ts` istnieje tylko po to, żeby CLI `auth generate`
mogło odczytać konfigurację serwera.

**Baza** — Drizzle ORM (`node-postgres`), klient w `server/db/index.ts`, schemat w `server/db/schema/`
re-eksportowany z `index.ts`:
- `auth.ts` jest **generowany** (`pnpm auth:generate`) — nie edytować ręcznie, zmiany zostaną nadpisane.
  Relacje dla tabeli `user` dotyczące gry dodawaj w `game.ts` jako osobne `relations(user, …)`
  (Drizzle scala je z `userRelations` z `auth.ts`).
- `game.ts` — `instrument` (PK = ticker dostawcy danych, np. `PKN.WA`), `instrument_price` (dzienne zamknięcia,
  PK `(symbol, date)`), `season`, `pick` (unikalny na sezon + gracz + kategoria).
- Kolumny w bazie `snake_case`, pola TS `camelCase`. Ceny to `numeric` — Drizzle zwraca `string`.
- Cena startowa wyboru nie jest zapisywana — wyliczana z `instrument_price` dla `season.start_date`.
- FK na `instrument.symbol` mają `ON UPDATE CASCADE` (zmiana tickera = jeden `UPDATE instrument`);
  `pick.symbol` ma `ON DELETE RESTRICT`, który Postgres zgłasza jako SQLSTATE `23001` (nie `23503`).

**Dane rynkowe** — Yahoo Finance przez `yahoo-finance2`, moduł `server/utils/market/`: `normalize.ts` (czysta logika:
biała lista giełd → kategoria, mapowanie odpowiedzi, zapytanie bez diakrytyków) i `yahoo.ts` (`searchStocks` z cache 1 h,
`lookupStock`, `fetchHistory`). Endpoint `GET /api/instruments/search?q=&category=` tylko dla zalogowanych.
Zadanie Nitro `prices:sync` (`server/tasks/prices/sync.ts`) — cron 22:30 UTC w `nuxt.config.ts`; w dev ręcznie przez
`/_nitro/tasks/prices:sync`. Zmiana `nuxt.config.ts` lub nowy plik w `server/tasks/` może wymagać restartu `pnpm dev`.

**Migracje** — generowane przez drizzle-kit (`drizzle.config.ts`), stosowane automatycznie przy starcie serwera
przez `server/plugins/migrate.ts` (dev i produkcja; błąd migracji kończy proces). Obraz Dockera kopiuje
`server/db/migrations` obok `.output`. Każda wygenerowana migracja trafia więc na produkcję przy następnym deployu.

## Deploy

Push na `main` = deploy produkcyjny (`.github/workflows/deploy.yml`): obraz z `Dockerfile` → GHCR
(`sha-<commit>` i `latest`) → `deploy/docker-compose.yml` kopiowany na VPS przez SSH → `docker compose pull && up -d`
za istniejącym Traefikiem. Praca toczy się na `develop`. Setup VPS, sekrety i rollback — `README.md`.
