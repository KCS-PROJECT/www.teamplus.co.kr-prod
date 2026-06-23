-- [2026-06-10 SECURITY] ci_hash UNIQUE 인덱스 — 반드시 백필 + 중복 0 확인 후 실행.
-- Prisma @unique 네이밍 규칙(users_ci_hash_key)과 일치시켜 introspection drift 방지.
CREATE UNIQUE INDEX IF NOT EXISTS "users_ci_hash_key" ON "users"("ci_hash");
