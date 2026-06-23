-- =========================================================================
-- BE-038 백필: ChildProfile 누락 자녀 복구
-- =========================================================================
-- 작성일: 2026-04-29
-- 목적:   `users` 테이블에 `userType IN ('CHILD', 'TEEN')` 으로 존재하지만
--         `child_profiles` 레코드가 없는 자녀의 ChildProfile 을 백필한다.
-- 대상:   PostgreSQL 16
-- 실행 환경: psql 또는 Prisma Studio SQL Tab
--
-- ⚠️ 실행 전 확인 사항
--   1. 운영 DB 는 반드시 백업 후 진행 (pg_dump)
--   2. 트랜잭션 BEGIN..COMMIT 안에서 실행 권장
--   3. `birthDate` 가 NULL 인 자녀는 백필 불가 → 별도 운영 정책 필요
--
-- 영향 범위
--   - 누락 자녀 식별: SELECT 만 (READ-ONLY)
--   - 백필: child_profiles 에 INSERT (User 의 birthDate 복사)
--   - User 데이터 변경 없음
-- =========================================================================


-- -------------------------------------------------------------------------
-- STEP 1. 진단: ChildProfile 누락 자녀 식별 (READ-ONLY · 안전)
-- -------------------------------------------------------------------------
-- 운영 DB 에서 먼저 실행하여 누락 자녀 규모 파악.
--
SELECT
  u.id                    AS user_id,
  u.email,
  u.first_name,
  u.last_name,
  u.user_type,
  u.birth_date            AS user_birth_date,
  u.created_at            AS user_created_at,
  CASE
    WHEN u.birth_date IS NULL THEN 'BLOCKED: birthDate NULL'
    ELSE 'BACKFILL_READY'
  END                     AS backfill_status
FROM users u
LEFT JOIN child_profiles cp ON cp.user_id = u.id
WHERE u.user_type IN ('CHILD', 'TEEN')
  AND cp.id IS NULL
ORDER BY u.created_at ASC;


-- -------------------------------------------------------------------------
-- STEP 2. 통계: 누락 자녀 카테고리별 카운트
-- -------------------------------------------------------------------------
SELECT
  u.user_type,
  COUNT(*)                                                  AS total_missing,
  COUNT(*) FILTER (WHERE u.birth_date IS NOT NULL)          AS backfill_ready,
  COUNT(*) FILTER (WHERE u.birth_date IS NULL)              AS blocked_no_birthdate
FROM users u
LEFT JOIN child_profiles cp ON cp.user_id = u.id
WHERE u.user_type IN ('CHILD', 'TEEN')
  AND cp.id IS NULL
GROUP BY u.user_type;


-- -------------------------------------------------------------------------
-- STEP 3. 백필 (BEGIN..COMMIT 안에서 실행) — birthDate 가 있는 자녀만
-- -------------------------------------------------------------------------
-- ⚠️ 이 블록은 데이터를 변경합니다. 트랜잭션 안에서 실행 후 결과를 검토하고
--    문제가 없을 때만 COMMIT, 의심되면 ROLLBACK 하세요.
--
-- 멱등성: ChildProfile.user_id 가 UNIQUE 이므로 ON CONFLICT 로 안전.
--
-- BEGIN;
--
-- INSERT INTO child_profiles (
--   id,
--   user_id,
--   birth_date,
--   current_level,
--   level_label,
--   progress_percent,
--   created_at
-- )
-- SELECT
--   'cp_be038_' || substr(md5(random()::text || u.id), 1, 16),
--   u.id,
--   u.birth_date,
--   1,
--   '입문',
--   0,
--   NOW()
-- FROM users u
-- LEFT JOIN child_profiles cp ON cp.user_id = u.id
-- WHERE u.user_type IN ('CHILD', 'TEEN')
--   AND cp.id IS NULL
--   AND u.birth_date IS NOT NULL
-- ON CONFLICT (user_id) DO NOTHING;
--
-- -- 백필 결과 확인
-- SELECT COUNT(*) AS remaining_missing
-- FROM users u
-- LEFT JOIN child_profiles cp ON cp.user_id = u.id
-- WHERE u.user_type IN ('CHILD', 'TEEN')
--   AND cp.id IS NULL;
--
-- COMMIT;  -- 또는 ROLLBACK;


-- -------------------------------------------------------------------------
-- STEP 4. 검증: 백필 후 누락 자녀 0건 확인 (READ-ONLY)
-- -------------------------------------------------------------------------
-- birthDate 가 있는 자녀의 ChildProfile 누락은 0 이어야 합니다.
-- birthDate 가 없는 자녀(blocked_no_birthdate)는 별도 정책으로 처리.
--
SELECT
  COUNT(*) FILTER (WHERE u.birth_date IS NOT NULL) AS still_missing_with_birthdate,
  COUNT(*) FILTER (WHERE u.birth_date IS NULL)     AS still_missing_no_birthdate
FROM users u
LEFT JOIN child_profiles cp ON cp.user_id = u.id
WHERE u.user_type IN ('CHILD', 'TEEN')
  AND cp.id IS NULL;


-- -------------------------------------------------------------------------
-- STEP 5. (선택) birthDate 누락 자녀 식별 — 별도 운영 정책 필요
-- -------------------------------------------------------------------------
-- 이 자녀들은 User 에도 birthDate 가 없어 ChildProfile 백필 불가합니다.
-- 옵션:
--   (a) 학부모에게 birthDate 입력 요청 (UX 측 회수)
--   (b) WITHDRAWN 으로 status 변경 (운영 정리)
--   (c) 기본값(예: 1900-01-01) 으로 임시 백필 후 차후 정정
--
SELECT
  u.id            AS user_id,
  u.email,
  u.first_name,
  u.last_name,
  u.user_type,
  u.created_at,
  u.status
FROM users u
LEFT JOIN child_profiles cp ON cp.user_id = u.id
WHERE u.user_type IN ('CHILD', 'TEEN')
  AND cp.id IS NULL
  AND u.birth_date IS NULL
ORDER BY u.created_at ASC;
