-- [2026-06-26] A-1 자유텍스트 약력 전환 — staff_careers 3컬럼 NOT NULL 제약 제거.
-- 원격 공유 DEV DB(drift) + 운영 DB 대상 수동 ALTER (prisma migrate dev 금지 · db execute 금지 — 사용자가 직접 실행).
-- 배경: 약력을 구조화 다중 필드 대신 자유 텍스트 한 덩어리(description)로 저장. description 외 필수 컬럼은 NULL 허용.
-- 영향: NOT NULL 제거는 기존 행의 값을 보존(데이터 변경 0). ALTER 선행 전에는 NULL insert가 DB에서 거부됨.
-- 컬럼명은 schema.prisma @map 기준: organization_name / role(@map 없음→role) / start_date.
ALTER TABLE "staff_careers" ALTER COLUMN "organization_name" DROP NOT NULL;
ALTER TABLE "staff_careers" ALTER COLUMN "role" DROP NOT NULL;
ALTER TABLE "staff_careers" ALTER COLUMN "start_date" DROP NOT NULL;
