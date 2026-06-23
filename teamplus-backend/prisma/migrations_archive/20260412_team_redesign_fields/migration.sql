-- Team 재디자인 필드 추가 (2026-04-12)
-- 팀 상세 페이지 Slogan / Hero / Quick Stats 섹션을 위한 4개 선택 필드 추가
-- 전체 NULL 허용이므로 기존 데이터 영향 없음

ALTER TABLE "teams"
  ADD COLUMN "description"   TEXT,
  ADD COLUMN "slogan"        TEXT,
  ADD COLUMN "founding_date" TIMESTAMP(3),
  ADD COLUMN "home_arena"    TEXT;
