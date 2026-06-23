-- [2026-06-20 PUSH] one-user-one-device 정책 — UserDevice.device_id 컬럼 추가.
--   앱이 발급·영속 저장하는 안정적 디바이스 식별자(불투명 문자열). fcmToken(회전됨)과 독립.
--   원격 공유 DEV/PROD DB drift 정책상 prisma migrate dev 금지 → 수동 SQL(멱등).
--   nullable + IF NOT EXISTS → 구버전 앱/기존 코드 무중단(하위호환).
ALTER TABLE "user_devices" ADD COLUMN IF NOT EXISTS "device_id" VARCHAR(255);
