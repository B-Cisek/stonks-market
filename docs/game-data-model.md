# Model danych gry

Stonks Market to zabawa giełdowa dla społeczności streamera na Kicku (bez prawdziwych pieniędzy).
Widz loguje się przez Kick i w sezonie (rok kalendarzowy) wybiera po jednym instrumencie na kategorię:
z Polski, z Europy i ze świata. Ranking pokazuje średni wynik wyborów gracza na tle S&P 500 —
kto jest powyżej benchmarku, jest na zielono. Docelowo dojdą kategorie: surowiec i kryptowaluta.

Schemat: `server/db/schema/game.ts` (re-eksport w `server/db/schema/index.ts`), migracja `server/db/migrations/0001_game_schema.sql`.

Dostawca danych: **Yahoo Finance** przez `yahoo-finance2` (darmowe, bez klucza, nieoficjalne API). Tickery w formacie Yahoo
(`PKN.WA`, `SIE.DE`, `^GSPC`). Integracja: `docs/superpowers/specs/2026-11-21-yahoo-integration-design.md`.

## Założenia

- Każdy instrument (spółka, indeks, później surowiec/krypto) jest w bazie **raz** — job dzienny pobiera
  jego cenę raz, niezależnie od liczby graczy, którzy go wybrali.
- Wszyscy gracze liczeni od **wspólnej ceny startowej** — zamknięcia z dnia startu sezonu. Gracz wybierający
  później w oknie zapisów nie ma przewagi z wiedzy o ruchach cen.
- Nowa kategoria (krypto, surowiec) nie wymaga przebudowy tabel — wybór to wiersz `(sezon, gracz, kategoria, instrument)`,
  a sezon definiuje aktywne kategorie. Ranking liczony w locie z ostatnich cen.
- Poza zakresem: przeliczanie walut (wynik w % w walucie notowania), dywidendy (tylko zwrot z ceny),
  historia rankingu dzień po dniu (do dołożenia jako osobna tabela snapshotów, bez zmian w reszcie).

## Enumy

| enum | wartości |
|---|---|
| `asset_category` | `pl`, `eu`, `world`, `commodity`, `crypto` — wszystkie od razu (bez późniejszego `ALTER TYPE`), aktywne na start tylko trzy pierwsze |
| `instrument_type` | `stock`, `index`, `commodity`, `crypto` |

## Tabele

### `instrument` — instrument zapisany raz

| kolumna | typ | uwagi |
|---|---|---|
| `symbol` | `text` PK | ticker u dostawcy danych, np. `PKN.WA`, `^GSPC` |
| `name` | `text` not null | |
| `exchange` | `text` | kod giełdy z Yahoo (`WSE`, `GER`, `NMS`…) |
| `currency` | `char(3)` not null | |
| `type` | `instrument_type` not null | |
| `category` | `asset_category` | `null` dla indeksów (benchmark nie jest do wyboru) |
| `created_at`, `updated_at` | `timestamp` not null | `updated_at` odświeżany przez Drizzle (`$onUpdate`) |

W bazie są tylko instrumenty wybrane przez graczy oraz benchmark. Jeden dostawca danych — przy jego zmianie
symbole migruje się jednorazowo. Kategoria ustawiana raz przy tworzeniu; ręczna korekta admina to zwykła edycja `category`
(istniejące wybory nie są przenoszone automatycznie).

### `instrument_price` — zamknięcia dzienne

| kolumna | typ | uwagi |
|---|---|---|
| `symbol` | `text` not null | FK → `instrument.symbol`, on delete cascade, on update cascade |
| `date` | `date` not null | dzień sesji |
| `close` | `numeric` not null | zamknięcie skorygowane o splity (nie o dywidendy) |

PK `(symbol, date)`. Ostatnia cena to najnowszy wiersz
(`DISTINCT ON (symbol) … ORDER BY symbol, date DESC`) — korzysta z indeksu PK, bez cache w `instrument`.

### `season` — sezon gry

| kolumna | typ | uwagi |
|---|---|---|
| `id` | `integer` identity PK | |
| `year` | `integer` not null unique | |
| `entry_opens_at`, `entry_closes_at` | `timestamptz` not null | okno zapisów |
| `start_date` | `date` not null | dzień, z którego zamknięcie jest ceną startową (= zamknięcie zapisów) |
| `end_date` | `date` not null | koniec sezonu (31.12) |
| `categories` | `asset_category[]` not null, default `{pl,eu,world}` | aktywne sloty |
| `created_at` | `timestamp` not null | |

Benchmark to zawsze S&P 500 — bez kolumny w `season`; instrument wskazywany stałą w kodzie
(`BENCHMARK_SYMBOL = '^GSPC'` w `server/utils/benchmark.ts`). Job cen sam dodaje ten instrument do bazy, jeśli go brak (bez osobnego seeda).

### `pick` — wybór gracza w kategorii

| kolumna | typ | uwagi |
|---|---|---|
| `id` | `integer` identity PK | |
| `season_id` | `integer` not null | FK → `season.id`, on delete cascade |
| `user_id` | `text` not null | FK → `user.id`, on delete cascade (usunięcie konta kasuje wybory) |
| `category` | `asset_category` not null | |
| `symbol` | `text` not null | FK → `instrument.symbol`, on delete **restrict**, on update cascade |
| `created_at`, `updated_at` | `timestamp` not null | |

Indeksy: unikalny `pick_season_user_category_uq (season_id, user_id, category)` — jeden wybór na kategorię
w sezonie; obsługuje też zapytania po samym `season_id` (osobnego indeksu brak). `pick_symbol_idx (symbol)`.

Cena startowa **nie** jest zapisywana w `pick` — wyliczana z `instrument_price` i `season.start_date`
(bez duplikacji, automatycznie spójna po korekcie splitów). Gdyby kiedyś zapisy miały cenę od dnia wyboru,
dochodzi kolumna `pick.start_date` (migracja z wartością `season.start_date`), cena dalej z historii.

## Zachowanie kluczy obcych

- **Zmiana tickera** (np. FB → META): jeden `UPDATE instrument SET symbol = …` przenosi `pick` i `instrument_price`.
- **Usunięcie instrumentu z wyborami** się nie udaje. Postgres zgłasza `restrict_violation`, SQLSTATE `23001`
  (nie `23503 foreign_key_violation`) — kod łapiący ten błąd musi sprawdzać `23001`.
- **Usunięcie instrumentu bez wyborów** kasuje jego ceny.
- **Usunięcie sezonu** kasuje jego wybory.

## Relacje Drizzle

| relacja | definicja |
|---|---|
| instrument → many `prices`, many `picks` | `instrumentRelations` |
| instrumentPrice → one `instrument` | `instrumentPriceRelations` |
| season → many `picks` | `seasonRelations` |
| pick → one `season`, `instrument`, `user` | `pickRelations` |
| user → many `picks` | `userGameRelations` |

`userGameRelations` jest w `game.ts`, a nie w `auth.ts`, bo `auth.ts` generuje `pnpm auth:generate`
(zmiany zostałyby nadpisane). Drizzle scala oba wywołania `relations(user, …)`, więc
`db.query.user.findMany({ with: { picks: true, sessions: true } })` działa.

`numeric` zwracany jest przez Drizzle jako `string` — konwersja w kodzie liczącym.

## Reguły aplikacji (nie w bazie)

- Wybór lub zmiana tylko w `[entry_opens_at, entry_closes_at)` i tylko dla kategorii z `season.categories`.
  Gracz może zmieniać wybory dowolnie do zamknięcia zapisów; historii zmian nie trzymamy.
- Instrument musi przejść filtry (np. tylko akcje — bez ETF/funduszy/warrantów, opcjonalnie minimalna cena),
  nie może być indeksem, a jego kategoria musi być równa kategorii slotu. Filtry działają już w wynikach
  wyszukiwania (modal: searchbox → API dostawcy) i ponownie przy zapisie wyboru; niedozwolonych instrumentów nie zapisujemy.
- Instrument zapisywany (upsert) przy zapisie pierwszego wyboru z danym tickerem (dane z `lookupStock()`). Kategoria z białej
  listy giełd `EXCHANGE_CATEGORY` w `server/utils/market/normalize.ts`: `pl` (GPW) / `eu` (główne giełdy europejskie) / `world`
  (główne giełdy reszty świata). Giełdy spoza listy (OTC, regionalne niemieckie, parkiety wtórne) są niedozwolone.
  Podwójne notowania na głównych giełdach są świadomie dozwolone (np. ASML z NASDAQ trafia do `world`).
- Job dzienny pobiera ceny tylko instrumentów z wyborami w bieżącym sezonie oraz benchmarku („osierocone”
  instrumenty po zmianie wyboru są pomijane). Dla każdego symbolu pobiera **całą historię sezonu** (od kilku dni
  przed `start_date` do dziś, ceny skorygowane o splity) i robi upsert do `instrument_price` — jedno zapytanie na symbol.
  Dzięki temu splity, brakujące dni i korekty dostawcy poprawiają się same, bez wykrywania zdarzeń `split`.
  Implementacja: zadanie Nitro `prices:sync` (`server/tasks/prices/sync.ts`), cron 22:30 UTC; okno sezonu z zapasem 7 dni
  w obie strony, data sesji w strefie czasowej giełdy, ceny zaokrąglone do 4 miejsc.
- Cena startowa: `close` z ostatniej sesji ≤ `season.start_date` danego instrumentu (giełdy mają różne dni wolne).
- Wynik wyboru: `ostatnie close / cena startowa − 1`. Wynik gracza: średnia z jego wyborów.
  Benchmark liczony tak samo dla `BENCHMARK_SYMBOL`. Zielony = wynik gracza > wynik benchmarku.
- W rankingu są tylko gracze z kompletem wyborów we wszystkich aktywnych kategoriach. Udział w sezonie =
  posiadanie wyborów (bez osobnej tabeli; do dodania, jeśli pojawią się dane per gracz-sezon).

## Do zrobienia

- API zapisu wyboru, ranking, UI (modal wyboru korzysta z `GET /api/instruments/search`).
- Seed sezonu 2027.
- Rola admina (np. plugin `admin` Better Auth dodający `role` do `user`).
- Blokowanie konkretnych tickerów — jeśli będzie potrzebne, osobna lista/tabela.
