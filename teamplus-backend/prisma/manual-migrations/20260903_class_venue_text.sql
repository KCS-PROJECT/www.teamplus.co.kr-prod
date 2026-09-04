-- 수업 장소 텍스트(venueText) — 설계 SoT: claudedocs/class-venue-detail-design-2026-08-13.md v5.2
-- 3층(수업·요일 기본값·회차) 대칭 additive nullable. 인덱스·CHECK 없음(두 필드 독립).
--   venue_id 있으면 세부 구역("1층 A실"), 없으면 장소 전체("인천 선학빙상장 1층 A실").
-- Release gate: 이 ALTER 적용 + 컬럼 검증 3행 → Prisma client/백엔드 배포 → 프론트 배포.
--   (구코드는 신 DB 와 호환 — 역순 배포 불가)

ALTER TABLE icehockey.classes             ADD COLUMN IF NOT EXISTS venue_text VARCHAR(100);
ALTER TABLE icehockey.class_day_schedules ADD COLUMN IF NOT EXISTS venue_text VARCHAR(100);
ALTER TABLE icehockey.class_schedules     ADD COLUMN IF NOT EXISTS venue_text VARCHAR(100);

-- 검증 (적용 후 3행이어야 함):
-- SELECT table_name, column_name FROM information_schema.columns
--  WHERE table_schema = 'icehockey'
--    AND table_name IN ('classes', 'class_day_schedules', 'class_schedules')
--    AND column_name = 'venue_text';
