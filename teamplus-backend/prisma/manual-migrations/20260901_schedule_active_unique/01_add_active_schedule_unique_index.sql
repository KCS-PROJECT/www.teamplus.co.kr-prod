-- [설계 v4 §4.2] 활성 일정 부분 유니크 인덱스 — 같은 수업·같은 날짜의 활성 회차 중복을
--   DB 레벨에서 차단한다 (동시 bulk/apply-draft 레이스의 최종 방어).
--   부분 인덱스(WHERE is_cancelled = false)이므로 취소된 날짜의 재등록은 허용 —
--   기존 취소 후 재등록 정책과 호환.
--
-- 선행 점검 (중복 존재 시 생성 실패 — 수동 정리 후 재실행):
--   SELECT class_id, scheduled_date, COUNT(*) FROM class_schedules
--    WHERE is_cancelled = false GROUP BY 1,2 HAVING COUNT(*) > 1;
--   (2026-09-01 DEV 실측: 중복 0건)
--
-- 운영 반영 시: 데이터가 크면 CREATE UNIQUE INDEX CONCURRENTLY 사용 권장
--   (CONCURRENTLY 는 트랜잭션 블록 밖에서 실행해야 함 — psql 직접 실행).
CREATE UNIQUE INDEX IF NOT EXISTS uq_class_schedules_active_date
  ON class_schedules (class_id, scheduled_date)
  WHERE is_cancelled = false;
