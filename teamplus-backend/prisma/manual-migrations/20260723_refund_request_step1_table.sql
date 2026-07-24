-- [2026-07-23 Phase 1 환불 승인제] refund_requests 테이블 생성.
-- 원격 공유 DEV DB 정책: prisma migrate dev 금지 → prisma db execute 로 수동 적용.
CREATE TABLE IF NOT EXISTS "refund_requests" (
  "id"                     TEXT NOT NULL,
  "payment_id"             TEXT NOT NULL,
  "requester_id"           TEXT NOT NULL,
  "child_id"               TEXT,
  "source_type"            TEXT NOT NULL,
  "class_id"               TEXT,
  "tournament_id"          TEXT,
  "team_id"                TEXT,
  "academy_id"             TEXT,
  "status"                 TEXT NOT NULL DEFAULT 'pending',
  "request_reason"         TEXT NOT NULL,
  "requested_amount"       INTEGER NOT NULL,
  "approved_amount"        INTEGER,
  "decided_by"             TEXT,
  "decided_at"             TIMESTAMPTZ(3),
  "decision_reason"        TEXT,
  "execution_started_at"   TIMESTAMPTZ(3),
  "executed_at"            TIMESTAMPTZ(3),
  "failure_stage"          TEXT,
  "failure_code"           TEXT,
  "failure_reason"         TEXT,
  "pg_refund_succeeded_at" TIMESTAMPTZ(3),
  "version"                INTEGER NOT NULL DEFAULT 0,
  "idempotency_key"        TEXT,
  "created_at"             TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"             TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "refund_requests_pkey" PRIMARY KEY ("id")
);

-- 상태 도메인 제약(enum 대체 — 프로젝트 String+CHECK 컨벤션).
-- [반복 안전] ADD CONSTRAINT 는 IF NOT EXISTS 를 지원하지 않으므로 duplicate_object 가드로 감싼다
--   (매 배포 apply-all.sh 재실행 시 duplicate constraint 실패 방지). source CHECK 는 step3 에서
--   DIRECT 포함으로 재정의되므로 여기서 중복 적용돼도 최종 정의는 step3 가 보장한다.
DO $$ BEGIN
  ALTER TABLE "refund_requests"
    ADD CONSTRAINT "chk_refund_request_status"
    CHECK ("status" IN ('pending','rejected','canceled','executing','executed','execution_failed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "refund_requests"
    ADD CONSTRAINT "chk_refund_request_source"
    CHECK ("source_type" IN ('CLASS_PREPAID','CLASS_POSTPAID','TOURNAMENT'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK (Prisma 네이밍 규칙과 일치 — introspection drift 방지). 각 FK 를 duplicate_object 가드로 감싼다.
DO $$ BEGIN
  ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_requester_id_fkey"
    FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_child_id_fkey"
    FOREIGN KEY ("child_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_decided_by_fkey"
    FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 인덱스.
CREATE INDEX IF NOT EXISTS "refund_requests_payment_id_idx"   ON "refund_requests"("payment_id");
CREATE INDEX IF NOT EXISTS "refund_requests_requester_id_idx" ON "refund_requests"("requester_id");
CREATE INDEX IF NOT EXISTS "refund_requests_status_idx"       ON "refund_requests"("status");
CREATE INDEX IF NOT EXISTS "refund_requests_child_id_idx"     ON "refund_requests"("child_id");
CREATE INDEX IF NOT EXISTS "refund_requests_team_id_status_idx"    ON "refund_requests"("team_id","status");
CREATE INDEX IF NOT EXISTS "refund_requests_academy_id_status_idx" ON "refund_requests"("academy_id","status");
CREATE UNIQUE INDEX IF NOT EXISTS "refund_requests_idempotency_key_key" ON "refund_requests"("idempotency_key");
