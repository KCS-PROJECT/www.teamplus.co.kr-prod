-- [2026-07-30] 동의 기록 법적 리스크 3건 해소 — 컬럼 3개 + 인덱스 1개.
--   1) users.marketing_consent / marketing_consent_at
--      · 정통망법 §50① — 광고성 정보 사전 수신동의(opt-in) 없이 전송 금지.
--      · 기존에는 SignupAgreementsDto.marketing 을 받기만 하고 저장할 컬럼이 없어 동의값이 소실됐다.
--      · 발송 게이트가 단건 조회로 판별하도록 User 에 직접 둔다(동의 이력은 audit_logs).
--   2) chat_messages.deleted_at
--      · PIPA §21 파기 — is_deleted 만으로는 삭제 시점을 알 수 없어 보존기간 경과 판별이 불가했다.
--      · 파기 배치가 이 컬럼 기준으로 물리 삭제 대상을 고른다(별도 PR 담당).
--   · 원격 공유 DEV DB(drift) 대상 수동 적용 (prisma migrate dev 금지) → prisma db execute.
--   · 컬럼명 snake_case — schema.prisma 필드 @map 과 1:1.
--   · 전부 멱등: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.

-- 1) users — 마케팅 수신 동의 현재 상태 + 마지막 처리 시각
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "marketing_consent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "marketing_consent_at" TIMESTAMPTZ(3);

-- 2) chat_messages — soft delete 시각
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(3);

-- 3) 파기 배치 조회용 인덱스 — Prisma introspection 네이밍(@@index([deletedAt]))과 일치시켜 drift 방지.
CREATE INDEX IF NOT EXISTS "chat_messages_deleted_at_idx"
  ON "chat_messages"("deleted_at");
