-- 2026-04-12 하네스 파이프라인 Venue 피처 구현
-- Venue 모델에 "시설 안내 / 소개" 텍스트 필드 추가
-- teamplus 구장 정보 탐색·관리 피처에서 VenueFormSheet 의 description textarea 저장 용도

ALTER TABLE "venues" ADD COLUMN "description" TEXT;
