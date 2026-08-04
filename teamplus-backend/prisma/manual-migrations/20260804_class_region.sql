-- [2026-08-04] 수업 지역(시/도 + 시군구) — 감독/코치가 등록 시 직접 선택.
--
-- 배경: 지역 축이 Venue.city(시/도) 하나뿐이라 목록에 "서울"까지만 노출됐고,
--   venueId 가 nullable 이라 커버리지도 낮았다. 타지역 학부모가 이동 거리를 모른 채
--   등록하는 사고를 막기 위해 수업 자체에 지역을 저장하고 시군구까지 표시한다.
--
-- 원격 공유 DEV/PROD DB 는 drift 정책상 `prisma migrate dev` 를 쓰지 않는다.
-- 전부 멱등이며 `npm run db:migrate:manual` 로 실행된다(배포 시 자동).
--
-- 데이터 보정 없음 — 기존 수업은 NULL 로 남고, 조회 시 venue.city 폴백이 계속 동작한다.
-- 수정 화면에서 감독이 저장하면 자연스럽게 채워진다.

ALTER TABLE "classes"
  ADD COLUMN IF NOT EXISTS "region_city" VARCHAR(20);

ALTER TABLE "classes"
  ADD COLUMN IF NOT EXISTS "region_district" VARCHAR(30);

CREATE INDEX IF NOT EXISTS "classes_region_city_region_district_idx"
  ON "classes"("region_city", "region_district");
