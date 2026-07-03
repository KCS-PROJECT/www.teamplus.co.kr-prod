-- Precheck / audit for Step 2 (env-agnostic; run on dev and prod).
-- Purpose: confirm timestamp type distribution and enumerate conversion targets before ALTER.

SET search_path TO icehockey;

-- 1) type distribution across app schema
SELECT data_type, count(*) AS n
FROM information_schema.columns
WHERE table_schema = 'icehockey' AND data_type LIKE 'timestamp%'
GROUP BY data_type
ORDER BY data_type;

-- 2) any timestamptz already present in app tables (expect only _prisma_migrations)
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'icehockey' AND data_type = 'timestamp with time zone'
ORDER BY table_name, column_name;

-- 3) full list of timestamp(without tz) columns (conversion universe)
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'icehockey' AND data_type = 'timestamp without time zone'
ORDER BY table_name, column_name;

-- 4) representative sample values (epoch) for post-apply identity proof
SELECT 'users' AS t, id, extract(epoch FROM created_at) AS created_epoch, extract(epoch FROM updated_at) AS updated_epoch
FROM icehockey.users ORDER BY id LIMIT 5;
