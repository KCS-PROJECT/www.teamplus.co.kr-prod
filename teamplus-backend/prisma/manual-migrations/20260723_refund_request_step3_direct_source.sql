-- [2026-07-23 라운드3] 직접(ADMIN/trusted) 환불도 영속 실행 원장(RefundRequest)을 경유하도록
-- source_type CHECK 제약에 'DIRECT' 추가 (Codex 라운드2 Critical — 직접 환불 DB_AFTER_PG 증거 영속).
-- [반복 안전] DROP+ADD 를 단일 트랜잭션으로 원자화 — 중간 실패로 CHECK 가 사라진 상태가 남지 않게 한다.
--   DROP IF EXISTS + ADD 조합이라 매 배포 재실행해도 최종 정의(DIRECT 포함)로 수렴한다(멱등).
BEGIN;
ALTER TABLE "refund_requests" DROP CONSTRAINT IF EXISTS "chk_refund_request_source";
ALTER TABLE "refund_requests"
  ADD CONSTRAINT "chk_refund_request_source"
  CHECK ("source_type" IN ('CLASS_PREPAID','CLASS_POSTPAID','TOURNAMENT','DIRECT'));
COMMIT;
