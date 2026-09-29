-- 공통코드 BANK_CODE(은행) 시드 — 팀 정산 계좌의 은행 선택 목록. 모든 환경에 필요한 기준 데이터라 배포 때 자동 적용한다.
--   · code = 금융결제원 표준 은행코드 3자리(나이스페이 지급대행 bankCd 와 같은 체계), name = 은행명.
--   · 멱등: 그룹은 group_code, 코드는 (group_id, code) 충돌 시 무시한다 — 운영자가 어드민에서 고친 라벨·정렬은 덮어쓰지 않는다.
--   · created_by_id 는 SYSTEM 계정. SYSTEM 계정이 없는 DB 에서는 아무것도 넣지 않는다.
--   · 비한정 식별자 — manual-migrations 컨벤션(search_path = 연결 스키마).

INSERT INTO "common_code_groups"
  ("id", "group_code", "group_name", "description", "is_active", "sort_order", "created_by_id", "created_at", "updated_at")
SELECT 'ccg_bank_code', 'BANK_CODE', '은행', '팀 정산 계좌 은행 목록 (code = 금융결제원 은행코드 3자리)', true, 100, u.id, NOW(), NOW()
FROM (SELECT id FROM "users" WHERE "user_type" = 'SYSTEM' ORDER BY "created_at" LIMIT 1) u
ON CONFLICT ("group_code") DO NOTHING;

INSERT INTO "common_codes"
  ("id", "group_id", "level", "code", "name", "is_active", "sort_order", "created_by_id", "created_at", "updated_at")
SELECT 'cc_bank_' || b.code, g.id, 1, b.code, b.name, true, b.sort_order, g.created_by_id, NOW(), NOW()
FROM "common_code_groups" g
CROSS JOIN (VALUES
  ('004', 'KB국민은행', 10),
  ('088', '신한은행', 20),
  ('020', '우리은행', 30),
  ('081', '하나은행', 40),
  ('011', 'NH농협은행', 50),
  ('003', 'IBK기업은행', 60),
  ('090', '카카오뱅크', 70),
  ('092', '토스뱅크', 80),
  ('089', '케이뱅크', 90),
  ('023', 'SC제일은행', 100),
  ('027', '한국씨티은행', 110),
  ('002', 'KDB산업은행', 120),
  ('007', '수협은행', 130),
  ('031', 'iM뱅크(대구)', 140),
  ('032', '부산은행', 150),
  ('039', '경남은행', 160),
  ('034', '광주은행', 170),
  ('037', '전북은행', 180),
  ('035', '제주은행', 190),
  ('012', '지역농축협', 200),
  ('045', '새마을금고', 210),
  ('048', '신협', 220),
  ('050', '저축은행', 230),
  ('071', '우체국', 240)
) AS b(code, name, sort_order)
WHERE g."group_code" = 'BANK_CODE'
ON CONFLICT ("group_id", "code") DO NOTHING;
