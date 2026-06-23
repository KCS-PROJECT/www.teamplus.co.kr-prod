-- [2026-06-20 PUSH] one-user-one-device 정책 — UserDevice.device_id 인덱스/유니크.
--   Prisma introspection 네이밍과 일치시켜 drift 방지:
--     @@index([deviceId])            → user_devices_device_id_idx
--     @@index([deviceId, isActive])  → user_devices_device_id_is_active_idx
--     @@unique([userId, deviceId])   → user_devices_user_id_device_id_key
--   유니크는 device_id 가 전부 NULL 인 초기 상태에서 안전(Postgres 는 NULL 을 서로 distinct 취급).
--   비-NULL 충돌 위험 없음(앱이 (userId,deviceId) 1행만 upsert).
CREATE INDEX IF NOT EXISTS "user_devices_device_id_idx"
  ON "user_devices"("device_id");

CREATE INDEX IF NOT EXISTS "user_devices_device_id_is_active_idx"
  ON "user_devices"("device_id", "is_active");

CREATE UNIQUE INDEX IF NOT EXISTS "user_devices_user_id_device_id_key"
  ON "user_devices"("user_id", "device_id");
