-- [2026-06-18] 점검 사유(maintenance_reason) 컬럼 추가 — system_notices.
--   · 점검 공지(targetType=maintenance) M4 화면의 '점검사유' 행 표시용.
--   · 원격 공유 DEV DB(drift) 대상 수동 적용 (prisma migrate dev 금지) → prisma db execute 로 적용.
--   · 비한정(unqualified) 식별자 — manual-migrations 컨벤션 일치(로컬 public / 원격 icehockey 양쪽 안전).
--   · 컬럼명 snake_case — schema.prisma SystemNotice 필드 @map("maintenance_reason") 와 1:1.
--   · 멱등: ADD COLUMN IF NOT EXISTS.

ALTER TABLE "system_notices" ADD COLUMN IF NOT EXISTS "maintenance_reason" TEXT;
