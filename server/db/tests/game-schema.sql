-- Test ograniczeń schematu gry. Używa tylko własnych danych (symbole TEST*, lata 9998/9999,
-- użytkownik u1), więc działa też na bazie z prawdziwymi/seedowanymi danymi. Wszystko w ROLLBACK.
BEGIN;

INSERT INTO "user" (id, name, email) VALUES ('u1', 'u1', 'u1@test.local');
INSERT INTO instrument (symbol, name, exchange, currency, type, category)
VALUES ('TEST1.WA', 'Test 1', 'WSE', 'PLN', 'stock', 'pl');
INSERT INTO season (year, entry_opens_at, entry_closes_at, start_date, end_date)
VALUES (9998, '9997-12-15T00:00:00+01', '9998-01-04T23:59:00+01', '9998-01-04', '9998-12-31'),
       (9999, '9998-12-15T00:00:00+01', '9999-01-03T23:59:00+01', '9999-01-03', '9999-12-31');
INSERT INTO pick (season_id, user_id, category, symbol)
SELECT id, 'u1', 'pl', 'TEST1.WA' FROM season WHERE year IN (9998, 9999);  -- po jednym w każdym sezonie
INSERT INTO instrument_price (symbol, date, close) VALUES ('TEST1.WA', '9998-01-04', '60.5');

DO $$ BEGIN
  IF (SELECT categories FROM season WHERE year = 9998) <> '{pl,eu,world}'::asset_category[] THEN
    RAISE EXCEPTION 'season.categories default is not {pl,eu,world}';
  END IF;

  BEGIN
    INSERT INTO pick (season_id, user_id, category, symbol)
    SELECT id, 'u1', 'pl', 'TEST1.WA' FROM season WHERE year = 9998;
    RAISE EXCEPTION 'duplicate pick in same season/category allowed';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  BEGIN
    INSERT INTO instrument_price (symbol, date, close) VALUES ('TEST1.WA', '9998-01-04', '61');
    RAISE EXCEPTION 'duplicate price for same symbol/date allowed';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  BEGIN
    INSERT INTO instrument (symbol, name, exchange, currency, type, category)
    VALUES ('TEST1.WA', 'dup', 'WSE', 'PLN', 'stock', 'pl');
    RAISE EXCEPTION 'duplicate instrument symbol allowed';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  BEGIN
    DELETE FROM instrument WHERE symbol = 'TEST1.WA';
    RAISE EXCEPTION 'instrument with picks deleted';
  EXCEPTION WHEN restrict_violation THEN NULL; END;
END $$;

UPDATE instrument SET symbol = 'TEST2.WA' WHERE symbol = 'TEST1.WA';
DO $$ BEGIN
  IF (SELECT count(*) FROM pick WHERE symbol = 'TEST2.WA') <> 2
     OR (SELECT count(*) FROM instrument_price WHERE symbol = 'TEST2.WA') <> 1 THEN
    RAISE EXCEPTION 'symbol rename did not cascade';
  END IF;
END $$;

DELETE FROM "user" WHERE id = 'u1';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pick WHERE user_id = 'u1') THEN
    RAISE EXCEPTION 'user delete did not cascade to picks';
  END IF;
END $$;

DELETE FROM instrument WHERE symbol = 'TEST2.WA';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM instrument_price WHERE symbol = 'TEST2.WA') THEN
    RAISE EXCEPTION 'instrument delete did not cascade to prices';
  END IF;
END $$;

ROLLBACK;
