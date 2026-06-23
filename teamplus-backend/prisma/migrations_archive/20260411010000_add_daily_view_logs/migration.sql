-- Daily View Logs: 1일 1회 조회수 제한용 통합 로그 테이블
-- entityType + entityId + userId + viewedDate UNIQUE 제약으로 중복 차단
-- IF NOT EXISTS 로 멱등 적용 보장

CREATE TABLE IF NOT EXISTS "daily_view_logs" (
  "id"          TEXT         NOT NULL,
  "entity_type" TEXT         NOT NULL,
  "entity_id"   TEXT         NOT NULL,
  "user_id"     TEXT         NOT NULL,
  "viewed_date" CHAR(10)     NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "daily_view_logs_pkey" PRIMARY KEY ("id")
);

-- UNIQUE: 동일 사용자가 같은 엔티티를 같은 날 중복 카운트 못하도록 차단
CREATE UNIQUE INDEX IF NOT EXISTS "daily_view_logs_unique"
  ON "daily_view_logs" ("entity_type", "entity_id", "user_id", "viewed_date");

-- 엔티티별 집계 및 유저별 이력 조회용 인덱스
CREATE INDEX IF NOT EXISTS "daily_view_logs_entity_type_entity_id_idx"
  ON "daily_view_logs" ("entity_type", "entity_id");

CREATE INDEX IF NOT EXISTS "daily_view_logs_user_id_idx"
  ON "daily_view_logs" ("user_id");

CREATE INDEX IF NOT EXISTS "daily_view_logs_viewed_date_idx"
  ON "daily_view_logs" ("viewed_date");
