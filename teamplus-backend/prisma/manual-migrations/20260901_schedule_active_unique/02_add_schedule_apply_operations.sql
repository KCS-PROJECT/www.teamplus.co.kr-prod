-- [설계 v4 §4.1-8] apply-draft 멱등 ledger 테이블.
--   operationId(PK) 재요청 시 저장된 result 를 replay — 응답 유실 후 재시도의
--   중복 반영 차단. payload_digest 는 같은 id·다른 내용 요청을 409 로 거부하는 대조값.
CREATE TABLE IF NOT EXISTS schedule_apply_operations (
  id             TEXT PRIMARY KEY,
  class_id       TEXT NOT NULL,
  actor_id       TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  result         JSONB NOT NULL,
  created_at     TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_schedule_apply_ops_class ON schedule_apply_operations (class_id);
CREATE INDEX IF NOT EXISTS idx_schedule_apply_ops_created ON schedule_apply_operations (created_at);
