DO $$
DECLARE
  n bigint;
BEGIN
  IF to_regclass('public.matrix_identities') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM matrix_identities' INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'matrix_identities holds % rows; refusing to drop', n;
    END IF;
  END IF;

  IF to_regclass('public.matrix_rooms') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM matrix_rooms' INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'matrix_rooms holds % rows; refusing to drop', n;
    END IF;
  END IF;

  IF to_regclass('public.matrix_transactions') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM matrix_transactions' INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'matrix_transactions holds % rows; refusing to drop', n;
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS "matrix_transactions";
DROP TABLE IF EXISTS "matrix_rooms";
DROP TABLE IF EXISTS "matrix_identities";
