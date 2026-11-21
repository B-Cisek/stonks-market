# Integracja z Yahoo Finance — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wyszukiwanie spółek do modala wyboru i dzienny job zamknięć z Yahoo Finance.

**Architecture:** Czysta logika (biała lista giełd, mapowanie odpowiedzi Yahoo) w jednym pliku bez importów runtime,
cienki klient `yahoo-finance2` obok niego, endpoint Nitro z `requireUserSession` i cache, zadanie Nitro `prices:sync`
uruchamiane cronem w aplikacji.

**Tech Stack:** Nuxt 4 / Nitro 2.13 (tasks, `defineCachedFunction`), `yahoo-finance2` 4.0.6, Drizzle ORM, `@nuxtjs/better-auth`.

**Spec:** `docs/superpowers/specs/2026-11-21-yahoo-integration-design.md`

## Global Constraints

- `yahoo-finance2` przypięte dokładnie na `4.0.6` (bez `^`).
- Teksty dla użytkownika i komentarze po polsku; styl ESLint projektu (bez średników, pojedyncze cudzysłowy).
- Brak frameworka testów: weryfikacja = `pnpm lint` bez błędów + skrypty/żądania opisane w krokach.
- Skrypty weryfikacyjne i dane tymczasowe w scratchpadzie, nie w repo; dane testowe w bazie sprzątane po weryfikacji.
- Nowy kod serwera importuje własne moduły jawnie (jak `server/plugins/migrate.ts`); z auto-importów tylko API Nitro/H3 i `requireUserSession`.
- Cron `'30 22 * * *'` (UTC), TTL cache wyszukiwania 3600 s, przerwa między symbolami 500 ms, zapas okna sezonu 7 dni.

## Review Focus

- Yahoo niedostępne / 429 / błąd crumb przy wyszukiwaniu → `502` z polskim komunikatem, nie `500` ze stackiem (sprawdzane przeglądem kodu — awarii Yahoo nie da się wywołać lokalnie na żądanie).
- Ticker z wyborów, którego Yahoo już nie zna (delisting) → błąd tylko tego symbolu w `failed`, reszta się zapisuje (Task 3, krok 4).
- Świece z `close: null` (święta, dane częściowe) → pominięte, bez naruszenia `NOT NULL` (Task 1, krok 1).
- Pusty zakres historii (brak sesji w oknie) → zero wierszy i brak `insert` z pustą tablicą (Drizzle rzuca przy `values([])`) (Task 1, krok 1; Task 3, krok 3).
- Zapytanie z polskimi znakami / samymi spacjami / 1 znakiem / > 50 znaków → wynik dla „żabka”, `400` dla pozostałych (Task 2, krok 4).

---

### Task 1: Zależność i czyste mapowanie odpowiedzi Yahoo

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (dodanie `yahoo-finance2`)
- Create: `server/utils/market/normalize.ts`
- Test: skrypt w scratchpadzie `verify-normalize.ts`

**Interfaces:**
- Produces (`server/utils/market/normalize.ts`, bez importów runtime — tylko `import type`, żeby skrypt mógł go odpalić gołym Node):
  - `type PickCategory = 'pl' | 'eu' | 'world'`
  - `const EXCHANGE_CATEGORY: Record<string, PickCategory>` — listy kodów dokładnie jak w specu (sekcja „Moduł dostawcy”); `MCE` potwierdzony (`TEF.MC`, `IBE.MC`, `ITX.MC`).
  - `function categoryForExchange(exchange: string | undefined): PickCategory | null`
  - `interface StockCandidate { symbol: string, name: string, exchange: string, exchangeName: string, category: PickCategory }`
  - `interface StockDetails { symbol: string, name: string, exchange: string, currency: string, category: PickCategory }`
  - `interface PriceRow { date: string /* YYYY-MM-DD */, close: string }`
  - `function toStockCandidate(q: { symbol?: string, quoteType?: string, exchange?: string, exchDisp?: string, longname?: string, shortname?: string }): StockCandidate | null` — `null` gdy brak `symbol`, `quoteType !== 'EQUITY'` lub giełda spoza listy; `name = longname ?? shortname ?? symbol` (trim); `exchangeName = exchDisp ?? exchange`.
  - `function toStockDetails(q: { symbol: string, quoteType?: string, exchange?: string, currency?: string, longName?: string, shortName?: string }): StockDetails | null` — te same filtry + `null` bez `currency`.
  - `function toPriceRows(quotes: { date: Date, close: number | null | undefined }[], timeZone: string): PriceRow[]` — pomija `close == null`, `close.toFixed(4)`, data przez `Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })`.

- [ ] **Step 1: Napisz skrypt weryfikacyjny** `<scratchpad>/verify-normalize.ts` (importuje `normalize.ts` po ścieżce absolutnej, `node:assert/strict`, `yahoo-finance2` z `node_modules` projektu przez `createRequire`/ścieżkę absolutną):

```ts
// stałe przypadki
assert.equal(categoryForExchange('WSE'), 'pl')
assert.equal(categoryForExchange('GER'), 'eu')
assert.equal(categoryForExchange('MCE'), 'eu')
assert.equal(categoryForExchange('NMS'), 'world')
for (const x of ['PNK', 'FRA', 'MUN', 'IOB', 'PCX', undefined]) assert.equal(categoryForExchange(x), null)
assert.equal(toStockCandidate({ symbol: 'PKN.WA', quoteType: 'EQUITY', exchange: 'WSE', exchDisp: 'WSE', shortname: 'PKN C.XWAR PLN', longname: 'Orlen S.A.' })?.name, 'Orlen S.A.')
assert.equal(toStockCandidate({ symbol: 'ETFW20L.WA', quoteType: 'ETF', exchange: 'WSE' }), null)
assert.equal(toStockCandidate({ quoteType: 'EQUITY', exchange: 'WSE' }), null)
assert.deepEqual(toPriceRows([
  { date: new Date('2026-11-17T14:30:00Z'), close: 7340.52978515625 },
  { date: new Date('2026-11-18T14:30:00Z'), close: null },
], 'America/New_York'), [{ date: '2026-11-17', close: '7340.5298' }])
assert.deepEqual(toPriceRows([{ date: new Date('2026-11-17T00:00:00Z'), close: 3414 }], 'Asia/Tokyo'), [{ date: '2026-11-17', close: '3414.0000' }])
assert.deepEqual(toPriceRows([{ date: new Date('2026-11-16T23:30:00Z'), close: 1 }], 'Europe/Warsaw'), [{ date: '2026-11-17', close: '1.0000' }])
assert.deepEqual(toPriceRows([], 'Europe/Warsaw'), [])
// na żywo
const orlen = (await yf.search('orlen', { quotesCount: 20, newsCount: 0 })).quotes.map(toStockCandidate).filter(Boolean)
assert.deepEqual(orlen.map(c => c.symbol), ['PKN.WA', 'PKN.PR'])   // PKY1.F, PKY1.MU, ORLNY odfiltrowane
assert.deepEqual(toStockDetails(await yf.quote('SIE.DE')), { symbol: 'SIE.DE', name: <longName z Yahoo>, exchange: 'GER', currency: 'EUR', category: 'eu' })
const chart = await yf.chart('PKN.WA', { period1: '2026-11-02', period2: '2026-11-07', interval: '1d' })
assert.equal(toPriceRows(chart.quotes, chart.meta.exchangeTimezoneName)[0].date, '2026-11-02')
```

- [ ] **Step 2: Uruchom — ma się wysypać** `node <scratchpad>/verify-normalize.ts` → FAIL (brak pliku `normalize.ts`).
- [ ] **Step 3: Dodaj zależność** `pnpm add yahoo-finance2@4.0.6 --save-exact`.
- [ ] **Step 4: Zaimplementuj `server/utils/market/normalize.ts`** wg Interfaces.
- [ ] **Step 5: Uruchom skrypt** → wszystkie asercje przechodzą (jeśli Yahoo zmieni kolejność/zbiór wyników „orlen”, porównaj zbiór, nie kolejność). `pnpm lint` → bez błędów.
- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml server/utils/market/normalize.ts docs/superpowers/specs/2026-11-21-yahoo-integration-design.md docs/superpowers/plans/2026-11-21-yahoo-integration.md
git commit -m "Add Yahoo Finance dependency and stock normalization"
```

### Task 2: Klient Yahoo i endpoint wyszukiwania

**Files:**
- Create: `server/utils/market/yahoo.ts`
- Create: `server/api/instruments/search.get.ts`

**Interfaces:**
- Consumes: `toStockCandidate`, `toStockDetails`, `toPriceRows`, typy z Task 1.
- Produces (`server/utils/market/yahoo.ts`):
  - jedna instancja `new YahooFinance({ suppressNotices: ['yahooSurvey'] })` na moduł
  - `const searchStocks: (q: string) => Promise<StockCandidate[]>` — `defineCachedFunction`, `name: 'market-search'`, `maxAge: 3600`, `getKey: q => q.trim().toLowerCase()`; w środku `search(q, { quotesCount: 20, newsCount: 0 })` → `toStockCandidate` → bez `null`.
  - `function lookupStock(symbol: string): Promise<StockDetails | null>` — `quote(symbol)`; nieznany ticker → `null`, błąd sieci/Yahoo leci dalej.
  - `function fetchHistory(symbol: string, from: string, to: string): Promise<PriceRow[]>` — `chart(symbol, { period1: from, period2: to, interval: '1d' })` → `toPriceRows(quotes, meta.exchangeTimezoneName)`; `to` wyłączne.
- Produces (HTTP): `GET /api/instruments/search?q=&category=` → `200 StockCandidate[]` | `400` | `401` | `502`.

- [ ] **Step 1: Zaimplementuj `yahoo.ts`** wg Interfaces.
- [ ] **Step 2: Zaimplementuj `search.get.ts`**: kolejność `requireUserSession(event)` → walidacja (`q` po `trim` 2–50 znaków; `category` brak lub `'pl' | 'eu' | 'world'`; inaczej `createError({ statusCode: 400, statusMessage: … })` po polsku) → `searchStocks(q)` w `try/catch` (błąd → log `[search]` + `createError({ statusCode: 502, statusMessage: 'Wyszukiwarka chwilowo nie działa, spróbuj za chwilę' })`) → filtr po `category`.
- [ ] **Step 3: Przygotuj sesję testową** (`pnpm db:up`, `pnpm dev`): w bazie użytkownik `plan-test-user` + wiersz `session` (kolumny wg `server/db/schema/auth.ts`, `expires_at` za godzinę); ciasteczko `better-auth.session_token=<token>.<podpis>` gdzie podpis = base64 HMAC-SHA256(`BETTER_AUTH_SECRET`, token), URL-encoded. Jeśli podpis nie przejdzie, poproś użytkownika o sprawdzenie zalogowanym w przeglądarce.
- [ ] **Step 4: Sprawdź endpoint curlem**
  - bez ciasteczka `?q=orlen` → `401`
  - `?q=orlen` → `200`, zawiera `PKN.WA` z `category: 'pl'`, nie zawiera `PKY1.F` ani `ORLNY`
  - `?q=orlen&category=pl` → tylko pozycje `pl`; `?q=siemens&category=eu` → zawiera `SIE.DE`
  - `?q=%C5%BCabka` („żabka”) → `200`, zawiera `ZAB.WA`
  - `?q=a`, `?q=%20%20%20`, `q` z 51 znaków, `?q=orlen&category=crypto` → `400`
  - drugie identyczne żądanie wyraźnie szybsze (cache)
- [ ] **Step 5: Posprzątaj** sesję i użytkownika testowego. `pnpm lint` → bez błędów.
- [ ] **Step 6: Commit**

```bash
git add server/utils/market/yahoo.ts server/api/instruments/search.get.ts
git commit -m "Add Yahoo client and instrument search endpoint"
```

### Task 3: Zadanie `prices:sync` i dokumentacja

**Files:**
- Create: `server/utils/game.ts`
- Create: `server/tasks/prices/sync.ts`
- Modify: `nuxt.config.ts` (blok `nitro`)
- Modify: `CLAUDE.md`, `docs/game-data-model.md`

**Interfaces:**
- Consumes: `fetchHistory(symbol, from, to)` z Task 2; `db` z `server/db`; `instrument`, `instrumentPrice`, `season`, `pick` z `server/db/schema`.
- Produces:
  - `server/utils/game.ts`: `BENCHMARK_SYMBOL = '^GSPC'`, `BENCHMARK_INSTRUMENT` (`{ symbol: BENCHMARK_SYMBOL, name: 'S&P 500', exchange: 'SNP', currency: 'USD', type: 'index', category: null }`, typ zgodny z `typeof instrument.$inferInsert`).
  - Zadanie Nitro `prices:sync` (`meta.description` po polsku), wynik `{ result: { ok: number, failed: string[] } }`.

- [ ] **Step 1: Konfiguracja** w `nuxt.config.ts`: `nitro: { experimental: { tasks: true }, scheduledTasks: { '30 22 * * *': ['prices:sync'] } }` (komentarz: cron w UTC, po zamknięciu USA, przed Azją).
- [ ] **Step 2: Zaimplementuj `server/utils/game.ts` i `server/tasks/prices/sync.ts`** wg speca (sekcja „Job cen”):
  - benchmark: `insert(instrument).values(BENCHMARK_INSTRUMENT).onConflictDoNothing()`
  - „dziś” = data UTC `YYYY-MM-DD`; sezony: `start_date - 7 <= dziś AND end_date + 7 >= dziś` (warunek w SQL przez `sql`); brak → log `[prices:sync] Brak aktywnego sezonu` i `{ ok: 0, failed: [] }`
  - na sezon: `selectDistinct` symboli z `pick` + `BENCHMARK_SYMBOL` (bez duplikatu); `from = start_date − 7 dni`, `to = min(dziś, end_date) + 1 dzień`
  - symbole sekwencyjnie z przerwą 500 ms; `fetchHistory` → gdy wiersze niepuste: `insert(instrumentPrice).values(rows z symbol).onConflictDoUpdate({ target: [instrumentPrice.symbol, instrumentPrice.date], set: { close: sql\`excluded.close\` } })`
  - błąd symbolu → `console.error('[prices:sync] …', symbol, error)`, symbol do `failed`; podsumowanie `console.info` na końcu
- [ ] **Step 3: Dane testowe** (psql w kontenerze `sm-db`): użytkownik `plan-test-user`, sezon `year = 2099`, `start_date = '2026-11-02'`, `end_date = '2026-12-31'`, okno zapisów dowolne w przeszłości; instrumenty `PKN.WA` (`pl`, PLN, stock) i `NIEMA.WA` (`pl`, PLN, stock); dwa wybory tego użytkownika w tym sezonie (`pl` → `PKN.WA`, `eu` → `NIEMA.WA`). Najpierw sprawdź, czy lokalna baza nie ma innego sezonu obejmującego dziś — jeśli ma, uwzględnij jego symbole w oczekiwanym wyniku.
- [ ] **Step 4: Uruchom zadanie** `curl http://localhost:3000/_nitro/tasks/prices:sync` → `result.ok === 2`, `result.failed` = `['NIEMA.WA']`. W bazie: `^GSPC` istnieje jako `index` z `category IS NULL`; `PKN.WA` ma wiersze od ostatniej sesji ≥ `2026-10-26` do ostatniej zakończonej sesji, tylko dni robocze, `close` z 4 miejscami. Drugie uruchomienie → ta sama liczba wierszy (upsert, bez duplikatów).
- [ ] **Step 5: Posprzątaj**: usuń sezon 2099 (wybory kaskadowo), `plan-test-user`, instrumenty `PKN.WA`, `NIEMA.WA`, `^GSPC` (ceny kaskadowo).
- [ ] **Step 6: Dokumentacja**:
  - `CLAUDE.md`: wiersz `Dane rynkowe | yahoo-finance2 | 4.0.6` w tabeli stacku; w „Architekturze” akapit **Dane rynkowe** — moduł `server/utils/market/` (biała lista giełd w `normalize.ts`), endpoint `/api/instruments/search` (tylko zalogowani, cache 1 h), zadanie `prices:sync` (cron 22:30 UTC, ręcznie w dev przez `/_nitro/tasks/prices:sync`).
  - `docs/game-data-model.md`: dostawca = Yahoo Finance (`yahoo-finance2`), tickery w formacie Yahoo, `BENCHMARK_SYMBOL = '^GSPC'` w `server/utils/game.ts` dodawany przez job; kategoria z białej listy giełd (podwójne notowania świadomie dozwolone); z „Do zrobienia” usuń wybór dostawcy, job cen, seed S&P 500 i „Dokładna lista giełd”.
- [ ] **Step 7: Weryfikacja** `pnpm lint` → bez błędów; `pnpm build` → kończy się sukcesem (zadania i `scheduledTasks` w buildzie produkcyjnym).
- [ ] **Step 8: Commit**

```bash
git add nuxt.config.ts server/utils/game.ts server/tasks/prices/sync.ts CLAUDE.md docs/game-data-model.md
git commit -m "Add daily price sync task and document market data integration"
```
