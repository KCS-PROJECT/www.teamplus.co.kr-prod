-- CreateTable: transaction_logs (API 거래로그)
--   · 모든 HTTP 요청/응답을 requestId 단위 1행 저장. 전역 ApiLifecycleInterceptor.finalize 에서
--     fire-and-forget upsert(request_id) 로 적재(본 API 응답 영향 0).
--   · 고정 컬럼 + 가변 payload(JSONB) + schema_version → 스키마 변경에도 안 깨지게.
--   · 정책: 보관 90일 · 민감값 마스킹 · 10KB 초과 truncate · UTC 저장(KST 표시).
--   · 원격 공유 DB(schema=icehockey) — prisma migrate dev 불가 → prisma db execute 수동 적용.
CREATE TABLE IF NOT EXISTS "icehockey"."transaction_logs" (
    "id"               TEXT NOT NULL,
    "request_id"       TEXT NOT NULL,
    "occurred_at"      TIMESTAMP(3) NOT NULL,
    "method"           TEXT NOT NULL,
    "path"             TEXT NOT NULL,
    "http_status"      INTEGER NOT NULL,
    "biz_success"      BOOLEAN,
    "result"           TEXT NOT NULL,
    "error_code"       TEXT,
    "error_message"    TEXT,
    "duration_ms"      INTEGER NOT NULL,
    "user_id"          TEXT,
    "user_role"        TEXT,
    "user_email"       TEXT,
    "platform"         TEXT,
    "client_version"   TEXT,
    "view_id"          TEXT,
    "ip"               TEXT,
    "response_bytes"   INTEGER,
    "env"              TEXT NOT NULL,
    "truncated"        BOOLEAN NOT NULL DEFAULT false,
    "schema_version"   INTEGER NOT NULL DEFAULT 1,
    "request_headers"  JSONB,
    "request_body"     JSONB,
    "request_query"    JSONB,
    "request_params"   JSONB,
    "response_headers" JSONB,
    "response_body"    JSONB,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "transaction_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (Prisma 컨벤션 이름 — 향후 db pull 정합성 유지)
CREATE UNIQUE INDEX IF NOT EXISTS "transaction_logs_request_id_key" ON "icehockey"."transaction_logs"("request_id");
CREATE INDEX IF NOT EXISTS "transaction_logs_occurred_at_idx"  ON "icehockey"."transaction_logs"("occurred_at");
CREATE INDEX IF NOT EXISTS "transaction_logs_platform_idx"     ON "icehockey"."transaction_logs"("platform");
CREATE INDEX IF NOT EXISTS "transaction_logs_result_idx"       ON "icehockey"."transaction_logs"("result");
CREATE INDEX IF NOT EXISTS "transaction_logs_http_status_idx"  ON "icehockey"."transaction_logs"("http_status");
CREATE INDEX IF NOT EXISTS "transaction_logs_user_id_idx"      ON "icehockey"."transaction_logs"("user_id");
CREATE INDEX IF NOT EXISTS "transaction_logs_path_idx"         ON "icehockey"."transaction_logs"("path");
CREATE INDEX IF NOT EXISTS "transaction_logs_view_id_idx"      ON "icehockey"."transaction_logs"("view_id");
CREATE INDEX IF NOT EXISTS "transaction_logs_method_idx"       ON "icehockey"."transaction_logs"("method");
