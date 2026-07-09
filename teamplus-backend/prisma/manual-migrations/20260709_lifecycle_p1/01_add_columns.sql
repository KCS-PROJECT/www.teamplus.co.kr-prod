-- [Lifecycle v4.1 P1] 수업 수명주기 + 월 결제 판매 사이클 — 신규 4컬럼
-- SoT: claudedocs/class-softdelete-lifecycle-design.md §8.2·§9.2~9.5
-- 전부 nullable ADD — 기존 데이터 무변경, 잠금 순간 완료.

ALTER TABLE classes        ADD COLUMN IF NOT EXISTS ended_at         timestamptz(3);
ALTER TABLE classes        ADD COLUMN IF NOT EXISTS sales_open_month date;
ALTER TABLE class_products ADD COLUMN IF NOT EXISTS billing_month    date;
ALTER TABLE member_credits ADD COLUMN IF NOT EXISTS starts_at        timestamptz(3);
