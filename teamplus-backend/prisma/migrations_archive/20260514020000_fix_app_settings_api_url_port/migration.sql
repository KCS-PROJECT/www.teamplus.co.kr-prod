-- AlterTable: AppSettings.api_url default 컬럼을 운영 표준 포트(5003)로 정정.
-- 기존 default 'http://localhost:5003' 는 과거 백엔드 포트로, 현재 SoT(CLAUDE.md)는 5003 입니다.
ALTER TABLE "app_settings" ALTER COLUMN "api_url" SET DEFAULT 'http://localhost:5003';

-- Data: 5003 포트를 사용 중인 기존 레코드를 5003 으로 보정 (싱글턴 1행이지만 안전하게 LIKE 패턴).
UPDATE "app_settings"
SET "api_url" = 'http://localhost:5003',
    "updated_at" = NOW()
WHERE "api_url" LIKE '%localhost:5003%';
