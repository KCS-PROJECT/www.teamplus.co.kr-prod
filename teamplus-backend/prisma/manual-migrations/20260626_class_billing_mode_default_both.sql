-- Class.billingMode 3-mode 확장: 기본값 PREPAID -> BOTH (선택형)
-- SET DEFAULT 는 기존 행에 무영향 (UPDATE 아님). 신규 INSERT 시 미지정이면 BOTH 적용.
ALTER TABLE classes ALTER COLUMN billing_mode SET DEFAULT 'BOTH';
