-- 공지 게시 알림 생애 1회 claim 마커 — system_notices.published_notified_at (timestamptz nullable).
-- null = 아직 첫 게시 알림이 나가지 않음(claim 미소진). 값 존재 = 생애 1회 알림 완료 → 재게시에도 재발송 금지.
-- (AC-R1-v1 Phase3 #9~10 — team-notice-phase3-5)
ALTER TABLE "system_notices" ADD COLUMN IF NOT EXISTS "published_notified_at" TIMESTAMPTZ(3);

-- Backfill: "현재 게시 중 + 게시 시작 도래" 레거시 공지는 생성 시점에 이미 알림이 발송된 행이므로
-- claim 을 소진 처리한다(created_at 로 기록). 이렇게 하지 않으면 운영자가 기존 공지를
-- 게시 해제 → 재게시하는 순간 "첫 claim" 으로 오인되어 전체/팀 푸시가 중복 발송된다.
-- 임시저장(is_active=false)·예약(start_at 미래) 공지는 아직 첫 게시 이벤트가 없었으므로 null 을 유지해
-- 향후 명시적 게시 전환 때 정상적으로 1회 발송되게 한다. (멱등: IS NULL 조건)
UPDATE "system_notices"
SET "published_notified_at" = "created_at"
WHERE "published_notified_at" IS NULL
  AND "is_active" = true
  AND ("start_at" IS NULL OR "start_at" <= now());
