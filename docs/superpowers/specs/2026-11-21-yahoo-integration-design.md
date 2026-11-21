# Integracja z Yahoo Finance — wyszukiwanie spółek i ceny

Data: 2026-11-21. Uzupełnia `docs/game-data-model.md` (wybór dostawcy danych z sekcji „Do zrobienia”).

## Po co

Gracz w modalu wyboru wpisuje nazwę spółki i dostaje tylko instrumenty dozwolone w danym slocie (`pl`/`eu`/`world`).
Ranking potrzebuje dziennych zamknięć wybranych instrumentów i S&P 500. Obie rzeczy obsługuje jeden darmowy dostawca.

## Cele

- Moduł dostawcy po stronie serwera: wyszukiwanie, sprawdzenie pojedynczego tickera, historia zamknięć.
- Endpoint wyszukiwania dla modala (z filtrami i cache).
- Job dzienny pobierający historię sezonu i robiący upsert do `instrument_price`.

## Poza zakresem

- API zapisu wyboru i UI modala. Moduł daje im `lookupStock()`, z którego skorzystają później.
- Podwójne notowania (np. ASML na NASDAQ trafia do `world`). Świadomie akceptowane na razie.
- Filtr minimalnej ceny, blokowanie tickerów, waluty, dywidendy.

## Ograniczenia

- Za darmo, bez klucza API. Yahoo jest nieoficjalne: może zmienić format albo przyciąć limity, a VPS wychodzi
  przez współdzielone IPv4 (NAT mikr.us). Dlatego cache wyszukiwań, sekwencyjne pobieranie w jobie
  i job odporny na pojedyncze błędy.
- Brak frameworka testów — weryfikacja przez `pnpm lint` i ręczne uruchomienie.

## Podejścia (wybrane: 1)

Dostawca: Yahoo przez `yahoo-finance2` (wybrane, bo darmowe). EODHD odrzucone (płatne ~20 $/mies.),
Twelve Data / Alpha Vantage odrzucone (limity, słabe pokrycie GPW).

Uruchamianie joba:

1. **Zadanie Nitro w aplikacji** (`scheduledTasks`) — **wybrane**. Zero zmian w deployu i sekretów; pominięty
   przebieg nie szkodzi, bo każdy przebieg pobiera całą historię sezonu.
2. Endpoint z sekretem wołany przez GitHub Actions / crontab — kolejny sekret i workflow, `schedule` w Actions bywa zawodny.
3. Osobny kontener-worker — przesada przy kilkudziesięciu zapytaniach dziennie.

## Projekt

### Zależność

`yahoo-finance2` w wersji `4.0.6` (przypięta, wymaga Node ≥ 22). Jedna instancja
`new YahooFinance({ suppressNotices: ['yahooSurvey'] })` na proces.

### Moduł dostawcy — `server/utils/market/`

- `exchanges.ts` — biała lista `EXCHANGE_CATEGORY: Record<string, 'pl' | 'eu' | 'world'>` po kodzie `exchange` z Yahoo.
  Pierwsza wersja (kody sprawdzone na żywych wynikach, Madryt do potwierdzenia):
  - `pl`: `WSE`
  - `eu`: `GER` (XETRA), `PAR`, `AMS`, `BRU`, `LIS`, `MIL`, `MCE` (Madryt), `LSE`, `EBS` (Szwajcaria), `VIE`, `STO`,
    `CPH`, `HEL`, `OSL`, `ISE`, `PRA`, `BUD`, `BVB`
  - `world`: `NYQ`, `NMS`, `NGM`, `NCM`, `ASE`, `TOR`, `JPX`, `HKG`, `ASX`, `KSC`, `NSI`, `SAO`, `SES`
  - Celowo poza listą: OTC (`PNK`, `OQX`, `OID`), regionalne niemieckie (`FRA`, `MUN`, `STU`, `DUS`, `HAM`, `HAN`),
    parkiety wtórne / MTF (`IOB`, `CXE`, `BTS`, `TLO`, `NEO`), `PCX` (prawie same ETF-y).
- `yahoo.ts`:
  - `searchStocks(q)` → `{ symbol, name, exchange, exchangeName, category }[]`. Z `search(q, { quotesCount: 20, newsCount: 0 })`
    zostają tylko pozycje z `symbol`, `quoteType === 'EQUITY'` i giełdą z białej listy. Nazwa z `longname ?? shortname`
    (`shortname` bywa nieczytelne, np. `PKN C.XWAR PLN`). Opakowane w `defineCachedFunction`
    (TTL 1 h, klucz = `q.trim().toLowerCase()`).
  - `lookupStock(symbol)` → `{ symbol, name, exchange, currency, category } | null` z `quote()`. Ponowna walidacja
    przy zapisie wyboru i źródło `currency` (wynik wyszukiwania nie zawiera waluty).
  - `fetchHistory(symbol, from, to)` → `{ date: 'YYYY-MM-DD', close: string }[]` z `chart(symbol, { period1, period2, interval: '1d' })`.
    Bierze `close` (skorygowane o splity, bez dywidend; `adjclose` ignorowane), pomija wiersze bez `close`, zaokrągla
    do 4 miejsc (`toFixed(4)`, bo Yahoo zwraca floaty typu `145.3000030517578`). Data sesji wyliczana w strefie giełdy
    (`meta.exchangeTimezoneName` + `Intl.DateTimeFormat('en-CA', { timeZone })`), nie z UTC.

### Endpoint wyszukiwania — `server/api/instruments/search.get.ts`

- `GET /api/instruments/search?q=<tekst>&category=<pl|eu|world>`.
- Wymaga zalogowanego gracza (`requireUserSession` z `@nuxtjs/better-auth`) — chroni limity Yahoo przed anonimowym ruchem.
- Walidacja: `q` 2–50 znaków po `trim`, `category` opcjonalne, jedna z trzech aktywnych. Najpierw auth, potem cachowane
  `searchStocks(q)`, na końcu filtr po `category` (cache nie zależy od kategorii).
- Błąd Yahoo → `502` z komunikatem po polsku („Wyszukiwarka chwilowo nie działa, spróbuj za chwilę”).

### Job cen — `server/tasks/prices/sync.ts` (nazwa `prices:sync`)

- `nuxt.config.ts`: `nitro: { experimental: { tasks: true }, scheduledTasks: { '30 22 * * *': ['prices:sync'] } }`.
  Kontener `node:24-slim` działa w UTC; 22:30 UTC wypada po zamknięciu USA i przed otwarciem Azji.
- Kroki:
  1. Upewnia się, że benchmark istnieje: `insert … onConflictDoNothing` dla `BENCHMARK_SYMBOL = '^GSPC'`
     (`name: 'S&P 500'`, `exchange: 'SNP'`, `currency: 'USD'`, `type: 'index'`, `category: null`). Stała w `server/utils/game.ts`.
     To zastępuje osobny seed instrumentu S&P 500.
  2. Wybiera sezony, dla których dziś ∈ `[start_date − 7 dni, end_date + 7 dni]` (zapas na święta przed startem
     i późne korekty po końcu). Brak takiego sezonu → log i koniec.
  3. Dla każdego sezonu: symbole = `DISTINCT pick.symbol` z tego sezonu + benchmark. Zakres `period1 = start_date − 7 dni`,
     `period2 = min(dziś, end_date) + 1 dzień`.
  4. Symbole po kolei, z przerwą ~500 ms. Na symbol jedno `fetchHistory` i jeden upsert:
     `insert into instrument_price … on conflict (symbol, date) do update set close = excluded.close`.
  5. Błąd pojedynczego symbolu → log i dalej. Wynik zadania: `{ ok: n, failed: [symbole] }`.
- Ręczne uruchomienie w dev: `/_nitro/tasks/prices:sync` (albo Nuxt DevTools). Niedokończona świeca z ręcznego przebiegu
  w trakcie sesji zostanie nadpisana przez nocny upsert.

### Dokumentacja

- `CLAUDE.md`: `yahoo-finance2` w tabeli stacku, krótko o zadaniu `prices:sync` w „Architekturze”.
- `docs/game-data-model.md`: dostawca = Yahoo, tickery w formacie Yahoo, benchmark `^GSPC`, biała lista giełd.
  Z „Do zrobienia” usunąć wybór dostawcy, job cen i seed S&P 500.

## Zostawione wykonawcy

- Potwierdzenie kodu Madrytu (`MCE`) i ewentualne dopisanie giełd, które wyjdą przy testach.
- Typy zwracane przez `yahoo-finance2` vs własne interfejsy — wg wygody, byle publiczne funkcje modułu miały własne typy.
- Rozkład plików w `server/utils/market/`.
