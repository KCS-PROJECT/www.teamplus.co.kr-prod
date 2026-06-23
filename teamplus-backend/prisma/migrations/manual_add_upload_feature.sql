-- teamplus 업로드 기능 수동 마이그레이션
-- 2026-04-15 · avatar_url + uploaded_files + UploadCategory enum

BEGIN;

-- 1. UploadCategory enum 생성 (없을 때만)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UploadCategory') THEN
        CREATE TYPE "icehockey"."UploadCategory" AS ENUM ('IMAGE', 'DOCUMENT', 'VIDEO', 'AVATAR', 'ATTACHMENT');
    END IF;
END$$;

-- 2. users 테이블에 avatar_url 컬럼 추가 (없을 때만)
ALTER TABLE "icehockey"."users" ADD COLUMN IF NOT EXISTS "avatar_url" TEXT;

-- 3. uploaded_files 테이블 생성
CREATE TABLE IF NOT EXISTS "icehockey"."uploaded_files" (
    "id"            TEXT NOT NULL,
    "category"      "icehockey"."UploadCategory" NOT NULL,
    "original_name" TEXT NOT NULL,
    "stored_name"   TEXT NOT NULL,
    "mime_type"     TEXT NOT NULL,
    "size"          INTEGER NOT NULL,
    "path"          TEXT NOT NULL,
    "url"           TEXT NOT NULL,
    "sha256"        TEXT,
    "width"         INTEGER,
    "height"        INTEGER,
    "uploader_id"   TEXT NOT NULL,
    "ref_type"      TEXT,
    "ref_id"        TEXT,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploaded_files_pkey" PRIMARY KEY ("id")
);

-- 4. 인덱스
CREATE INDEX IF NOT EXISTS "uploaded_files_uploader_id_idx"
    ON "icehockey"."uploaded_files"("uploader_id");
CREATE INDEX IF NOT EXISTS "uploaded_files_ref_type_ref_id_idx"
    ON "icehockey"."uploaded_files"("ref_type", "ref_id");
CREATE INDEX IF NOT EXISTS "uploaded_files_created_at_idx"
    ON "icehockey"."uploaded_files"("created_at");
CREATE INDEX IF NOT EXISTS "uploaded_files_category_idx"
    ON "icehockey"."uploaded_files"("category");

-- 5. FK: uploader_id → users.id (CASCADE)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uploaded_files_uploader_id_fkey'
    ) THEN
        ALTER TABLE "icehockey"."uploaded_files"
          ADD CONSTRAINT "uploaded_files_uploader_id_fkey"
          FOREIGN KEY ("uploader_id")
          REFERENCES "icehockey"."users"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END$$;

COMMIT;
