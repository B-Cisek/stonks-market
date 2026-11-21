# Model danych gry — design

## Po co

Stonks Market to zabawa giełdowa dla społeczności streamera na Kicku (bez prawdziwych pieniędzy).
Widz loguje się przez Kick, w sezonie (rok kalendarzowy) wybiera 3 spółki: z Polski, z Europy i ze świata.
Ranking graczy pokazuje średni wynik ich spółek na tle S&P 500 — kto jest powyżej benchmarku, jest na zielono.
Docelowo dojdą kategorie: surowiec i kryptowaluta.

## Cele

- Każdy instrument (spółka, indeks, później surowiec/krypto) zapisany w bazie **raz** — codzienna aktualizacja
  pobiera jego cenę raz, niezależnie od liczby graczy, którzy go wybrali.
- Sprawiedliwy ranking: wszyscy liczeni od **wspólnej ceny startowej** (zamknięcie z dnia startu sezonu).
- Dodanie nowej kategorii (krypto, surowiec) bez przebudowy tabel.
- Historia cen dziennych (wykresy).

## Non-goals

- API, UI, joby pobierające ceny, wybór dostawcy danych — osobne zadania. Tu tylko schemat.
- Przeliczanie walut — wynik liczony w % w walucie notowania.
- Dywidendy (liczymy sam zwrot z ceny).
- Historia rankingu dzień po dniu (wariant 2 — do dołożenia później jako osobna tabela, bez zmian w reszcie).

## Anty-cele

- Gracz, który wybiera później w oknie zapisów, nie może mieć przewagi z wiedzy o ruchach cen.
- Duplikaty tej samej spółki w bazie.

## Rozważone podejścia

1. **Elastyczne sloty + ranking liczony w locie** — każdy wybór to wiersz (gracz, sezon, kategoria, instrument);
   sezon definiuje aktywne kategorie; ranking z zapytania na ostatnich cenach. **Wybrane** — rozszerzalne,
   proste, wystarczająco szybkie dla tysięcy graczy.
2. Jak 1 + codzienny snapshot wyników/pozycji graczy — daje historię rankingu, ale to dodatkowa tabela
   i logika do utrzymania. Odłożone; da się dodać później.
3. Sztywne kolumny `pl_/eu_/world_instrument_id` w tabeli gracza — najprostsze, ale każda nowa kategoria
   to migracja i zmiany w zapytaniach. Odrzucone.

## Decyzje użytkownika

- Cena startowa wspólna dla wszystkich: zamknięcie z dnia startu sezonu (= zamknięcia zapisów).
- Spółki trafiają do bazy, gdy gracz wyszuka i wybierze je z zewnętrznego źródła danych;
  kategoria ustalana automatycznie po giełdzie; admin może ją poprawić.
- W `instrument` są tylko instrumenty już wybrane przez graczy (+ benchmark). Gracz szuka w modalu
  (searchbox → API dostawcy); niedozwolone instrumenty odfiltrowujemy przed zapisem, nie trzymamy ich w bazie.
- PK instrumentu to ticker dostawcy (np. `PKN.WA`).
- Podejście 1.
- Benchmark zawsze S&P 500 — bez kolumny w `season`; instrument wskazywany stałą w kodzie
  (`BENCHMARK_SYMBOL`, np. `^GSPC` u wybranego dostawcy).

## Schemat

Nowy plik `server/db/schema/game.ts`, eksportowany z `server/db/schema/index.ts`. Drizzle, Postgres.

### Enumy

- `asset_category`: `pl`, `eu`, `world`, `commodity`, `crypto` — wszystkie od razu (unikamy późniejszego
  `ALTER TYPE`), na start aktywne tylko trzy pierwsze.
- `instrument_type`: `stock`, `index`, `commodity`, `crypto`.

### `instrument` — instrument zapisany raz

| kolumna | typ | uwagi |
|---|---|---|
| `symbol` | text PK | ticker u dostawcy danych, np. `PKN.WA`, `^GSPC` |
| `name` | text not null | |
| `exchange` | text | kod giełdy od dostawcy |
| `currency` | char(3) not null | |
| `type` | `instrument_type` not null | |
| `category` | `asset_category` null | null dla indeksów (benchmark nie jest do wyboru) |
| `created_at`, `updated_at` | timestamp | jak w `auth.ts` |

PK `symbol` gwarantuje „spółka raz w bazie”. Jeden dostawca danych — przy ewentualnej zmianie
dostawcy symbole migruje się jednorazowo. Kategoria ustawiana raz przy tworzeniu instrumentu; job dzienny
zmienia tylko ceny, więc ręczna korekta admina to zwykła edycja `category`.

### `instrument_price` — ceny dzienne

| kolumna | typ | uwagi |
|---|---|---|
| `symbol` | FK → instrument, on delete cascade, on update cascade | |
| `date` | date | dzień sesji |
| `close` | numeric not null | zamknięcie skorygowane o splity (nie o dywidendy) |

PK `(symbol, date)`. Job robi upsert. Ostatnia cena instrumentu to najnowszy wiersz
(`DISTINCT ON (symbol) ... ORDER BY symbol, date DESC`) — korzysta z indeksu PK, bez cache w `instrument`.

### `season` — sezon gry

| kolumna | typ | uwagi |
|---|---|---|
| `id` | integer identity PK | |
| `year` | integer not null unique | |
| `entry_opens_at` | timestamptz not null | |
| `entry_closes_at` | timestamptz not null | |
| `start_date` | date not null | dzień, z którego zamknięcie jest ceną startową |
| `end_date` | date not null | koniec sezonu (31.12) |
| `categories` | `asset_category[]` not null default `{pl,eu,world}` | aktywne sloty |
| `created_at` | timestamp | |

### `pick` — wybór gracza w danej kategorii

| kolumna | typ | uwagi |
|---|---|---|
| `id` | integer identity PK | |
| `season_id` | FK → season, cascade | |
| `user_id` | text FK → user, cascade | |
| `category` | `asset_category` not null | |
| `symbol` | FK → instrument, on delete restrict, on update cascade | |
| `created_at`, `updated_at` | timestamp | |

`unique(season_id, user_id, category)`, indeksy na `season_id` i `symbol`.

FK z `on update cascade`: gdy spółka zmieni ticker (np. FB → META), wystarczy jeden `UPDATE instrument`.

Cena startowa nie jest zapisywana w `pick` — wyliczana z `instrument_price` i `season.start_date`
(brak duplikacji, automatycznie spójna po korekcie splitów). Jeśli kiedyś zapisy będą dłuższe z ceną od dnia
wyboru, dochodzi kolumna `pick.start_date` (migracja z wartością `season.start_date`), cena dalej z historii.

### Relacje

Drizzle `relations` dla: instrument ↔ prices, instrument ↔ picks, season ↔ picks, user ↔ picks.

## Reguły (logika aplikacji, nie DB)

- Wybór/zmiana możliwa tylko w `[entry_opens_at, entry_closes_at)`, dla kategorii z `season.categories`,
  instrument musi przejść filtry (np. tylko akcje — bez ETF/funduszy/warrantów, opcjonalnie minimalna cena),
  nie może być indeksem, a jego kategoria musi być równa kategorii slotu. Filtry działają już w wynikach
  wyszukiwania i ponownie przy zapisie wyboru.
- Instrument zapisujemy (upsert) w momencie zapisu pierwszego wyboru z danym tickerem.
- Job dzienny dociąga brakujące dni (od ostatniej zapisanej daty lub, dla nowego instrumentu, od kilku dni przed
  `season.start_date`), żeby `close` z dnia startu zawsze był w historii — również gdy job któregoś dnia nie zadziała.
- Job dzienny pobiera ceny tylko instrumentów, które mają wybory w bieżącym sezonie, oraz benchmarku
  (po zmianie wyboru w oknie zapisów mogą zostać „osierocone” instrumenty — po prostu są pomijane).
- Cena startowa: `close` z ostatniej sesji ≤ `season.start_date` danego instrumentu (giełdy mają różne dni wolne).
- Wynik wyboru: `ostatnie close / cena startowa - 1`. Wynik gracza: średnia z jego wyborów.
  Benchmark: to samo dla instrumentu o `symbol = BENCHMARK_SYMBOL`, z tą samą ceną startową. Zielony = wynik gracza > wynik benchmarku.
- Kategoria przy tworzeniu instrumentu: z mapowania giełda → `pl` (GPW) / `eu` (giełdy europejskie) / `world` (reszta).

## Decyzje podjęte przeze mnie (do sprawdzenia)

- Gracz może zmieniać wybory dowolnie do zamknięcia zapisów; nie trzymamy historii zmian.
- W rankingu są tylko gracze z kompletem wyborów we wszystkich aktywnych kategoriach.
- Brak blokowania konkretnych tickerów — jeśli admin kiedyś będzie chciał zbanować ticker, który przechodzi
  filtry, dojdzie osobna lista/tabela.
- Zmiana kategorii przez admina nie przenosi istniejących wyborów automatycznie.
- `numeric` dla cen (Drizzle zwraca string — konwersja w kodzie liczącym).
- Ceny skorygowane o splity; przy splicie job odświeża historię instrumentu (cena startowa wylicza się sama).
- Brak osobnej tabeli „udział gracza w sezonie” — udział = posiadanie wyborów. Do dodania, jeśli pojawią się
  dane per gracz-sezon (np. nick drużyny).

## Zostawione budowniczemu

- Rola admina (np. plugin `admin` Better Auth dodający `role` do `user`) — poza tym schematem.
- Dokładna lista giełd w mapowaniu na kategorie.
- Seed sezonu 2027 i instrumentu S&P 500.
