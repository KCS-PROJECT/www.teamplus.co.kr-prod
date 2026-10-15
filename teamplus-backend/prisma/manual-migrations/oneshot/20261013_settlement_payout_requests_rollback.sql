-- 20261013_settlement_payout_requests.sql 되돌리기. 수동 실행 전용.
-- 요청 기록 테이블을 지우면 나이스에 보낸 지급 요청의 접수번호(seq) 이력도 사라진다 — 실제 요청이 나간 뒤라면 삭제 전에 백업한다.
-- 진행 중(processing) 정산이 남아 있으면 먼저 approved 로 되돌려야 상태와 기록이 어긋나지 않는다.

BEGIN;

DROP TABLE IF EXISTS "settlement_payout_requests";

ALTER TABLE "app_settings" DROP COLUMN IF EXISTS "payout_day_of_month";

COMMIT;
