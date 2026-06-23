-- [2026-06-18] 고객센터 운영시간(support_hours) 컬럼 추가 — app_settings.
--   · M4 점검 화면 고객센터 안내(전화 supportPhone + 운영시간 supportHours)를 서버/관리자값으로 동적 처리.
--   · 원격 공유 DEV DB(drift) 대상 수동 적용 (prisma migrate dev 금지) → prisma db execute.
--   · 컬럼명 snake_case — schema.prisma AppSettings 필드 @map("support_hours") 와 1:1.
--   · 멱등: ADD COLUMN IF NOT EXISTS.

ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "support_hours" TEXT;
