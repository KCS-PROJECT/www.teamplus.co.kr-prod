-- ===================================================================
-- T03: DB·정책 (가격/일정 중복/참가 연령/teamId 격리) — 2026-05-15
-- ===================================================================
-- 변경:
--   H2. Tournament 모델에 대회 정보 페이지 노출 필드 3개 추가
--       · rules        (대회 규정, TEXT)
--       · location     (추가 장소 정보, VARCHAR)
--       · prize_amount (상금, DECIMAL(12,2))
--   F2. class_schedules — 단건 중복 검증 강화용 보조 인덱스
--       · (class_id, scheduled_date) UNIQUE 가 아닌 일반 인덱스 추가
--         (cancellation 처리·재생성 케이스 때문에 UNIQUE 는 미부여,
--         서비스 레이어에서 findFirst 후 ConflictException 처리)
-- ===================================================================

-- Tournament: 대회 정보 페이지 신규 필드 ----------------------------
ALTER TABLE "public"."tournaments"
  ADD COLUMN IF NOT EXISTS "rules" TEXT,
  ADD COLUMN IF NOT EXISTS "location" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "prize_amount" DECIMAL(12, 2);

COMMENT ON COLUMN "public"."tournaments"."rules" IS '대회 규정 (자유 텍스트) — T03/H2';
COMMENT ON COLUMN "public"."tournaments"."location" IS '추가 장소 정보 (rink.location 보완) — T03/H2';
COMMENT ON COLUMN "public"."tournaments"."prize_amount" IS '상금 (원) — T03/H2';

-- ClassSchedule: 중복 검증 가속용 인덱스 -----------------------------
-- 같은 수업의 동일 일시는 서비스에서 차단. UNIQUE 미부여 (취소 후 재등록 케이스 보호).
CREATE INDEX IF NOT EXISTS "class_schedules_class_scheduled_date_idx"
  ON "public"."class_schedules" ("class_id", "scheduled_date");
