-- 2026-05-23: UploadedFile 인덱스 강화 (db-architect 설계)
--   1) (uploader_id, created_at DESC) — 본인 이력 최신순 조회 최적화
--   2) (category, created_at DESC)   — 카테고리별 최신순 조회 최적화
--   3) (sha256)                       — 중복 탐지 풀스캔 제거 + dedup 확장 대비
-- IF NOT EXISTS 로 idempotent — 멱등 재실행 안전.

CREATE INDEX IF NOT EXISTS "uploaded_files_uploader_id_created_at_idx"
  ON "uploaded_files" ("uploader_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "uploaded_files_category_created_at_idx"
  ON "uploaded_files" ("category", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "uploaded_files_sha256_idx"
  ON "uploaded_files" ("sha256");
