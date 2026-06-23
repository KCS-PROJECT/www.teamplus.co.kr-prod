-- [2026-06-20 PUSH · ONE-SHOT] UserDevice active 중복 정리 (백필).
--   ⚠️ apply-all.sh 의 glob("$DIR"/*.sql)은 top-level 만 적용 → 이 oneshot/ 파일은 자동적용 제외.
--   수동 실행: npx prisma db execute --file prisma/manual-migrations/oneshot/20260620_user_device_backfill_dedup.sql --schema prisma/schema.prisma
--   배경: 정책 도입 전 누적된 (a) 같은 fcmToken 다중 user active(크로스유저 누수)
--         (b) 같은 user 다중 active 를 lastSeenAt 최신 1개만 남기고 비활성화.
--   멱등: 재실행해도 이미 1개면 변화 없음.

-- (1) 같은 fcmToken 다중 active → 최신만 유지 (크로스유저 누수 제거)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY fcm_token
                            ORDER BY last_seen_at DESC, created_at DESC) AS rn
  FROM "user_devices"
  WHERE is_active = TRUE AND fcm_token <> ''
)
UPDATE "user_devices" d
SET is_active = FALSE, updated_at = NOW()
FROM ranked r
WHERE d.id = r.id AND r.rn > 1;

-- (2) 같은 user_id 다중 active → 최신만 유지 (정책 A 위생화)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY user_id
                            ORDER BY last_seen_at DESC, created_at DESC) AS rn
  FROM "user_devices"
  WHERE is_active = TRUE
)
UPDATE "user_devices" d
SET is_active = FALSE, updated_at = NOW()
FROM ranked r
WHERE d.id = r.id AND r.rn > 1;
