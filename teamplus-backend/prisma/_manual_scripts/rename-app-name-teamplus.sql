-- =============================================================================
-- teamplus → TEAMPLUS 운영 DB 동기화 (2026-05-17)
-- =============================================================================
-- 목적: app_settings.app_name 컬럼에 저장된 브랜드명을 단일 SoT "TEAMPLUS" 로 통일.
--       schema.prisma 의 @default("TEAMPLUS") 및 seed.ts 의 appName 변경과 함께 적용.
--
-- 적용 대상: dev / staging / production DB
-- 실행 전 백업 권장:
--   pg_dump -U <user> -d <db_name> > backup_before_rename_$(date +%Y%m%d).sql
--
-- 실행 후 캐시 무효화 필수:
--   redis-cli -h <host> -p <port> DEL "app:settings:v1"
--   (또는 backend 재기동)
--
-- 검증:
--   curl -s http://<host>:5003/api/v1/app/settings | jq '.data.appName'
--   → "TEAMPLUS" 응답 확인
-- =============================================================================

BEGIN;

-- 1) app_settings.app_name 동기화 (단일 record 가정 — appSettings.findFirst 패턴)
UPDATE app_settings
SET app_name = 'TEAMPLUS',
    updated_at = NOW()
WHERE app_name IN ('teamplus', 'teamplus', '아이스타임', '아이스타임즈');

-- 2) 잔존 점검 (REPORT — 결과 0건 이어야 정상)
SELECT id, app_name, updated_at
FROM app_settings
WHERE app_name IN ('teamplus', 'teamplus', '아이스타임', '아이스타임즈');

-- 3) (선택) 다른 도메인 데이터에 브랜드 텍스트 잔존 점검 — REPORT only
--    실제 수정은 데이터 검토 후 별도 수행
SELECT 'notices' AS table_name, COUNT(*) AS hits
  FROM notices
  WHERE title ILIKE '%teamplus%' OR title ILIKE '%아이스타임%'
     OR content ILIKE '%teamplus%' OR content ILIKE '%아이스타임%';

-- banners 테이블이 존재하면 함께 점검 (없으면 위 쿼리는 에러 — 주석 처리하세요)
-- SELECT 'banners' AS table_name, COUNT(*) AS hits
--   FROM banners
--   WHERE title ILIKE '%teamplus%' OR title ILIKE '%아이스타임%';

COMMIT;

-- =============================================================================
-- ROLLBACK (필요 시)
-- =============================================================================
-- BEGIN;
-- UPDATE app_settings SET app_name = 'teamplus' WHERE app_name = 'TEAMPLUS';
-- COMMIT;
