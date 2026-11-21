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
  EXCEPTION WHEN restrict_violation THEN NULL; END;
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
