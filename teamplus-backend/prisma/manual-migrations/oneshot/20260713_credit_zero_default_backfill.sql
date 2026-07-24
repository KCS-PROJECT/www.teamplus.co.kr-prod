-- [2026-07-13] 크레딧 미사용 전환 — fabricated 발급 수량 교정 (정식 서비스 전 · 사용자 승인).
-- 원격 공유 DEV DB(drift) + 운영 DB 대상 수동 실행 (prisma migrate dev 금지 · 팀 리드/사용자가 직접 실행).
-- 배경: 상품 생성 시 지어낸 기본값(정기권 4회·단건 1회)을 sessions_per_month 에 저장해 왔으나,
--        운영은 크레딧(수업권)을 사용하지 않는다. 발급 수량 SoT = class_products.sessions_per_month,
--        0 = 미발급(신규 기본). 이 백필로 기존 행의 fabricated 값을 0 으로 교정한다.
-- 영향: 발급 수량만 0 으로 통일(가격·유효기간·기타 컬럼 무변경). 이후 결제는 0 상품이라 미발급.
--       legacy 로 이미 발급된 크레딧은 잔여 소진 + 즉시 만료로 불능화(만료 cron 이월/오차감 방지).

-- 1) fabricated 발급 수량 교정 (전 상품 0 = 크레딧 미발급).
UPDATE icehockey.class_products SET sessions_per_month = 0;

-- 2) legacy 발급 크레딧 불능화 — 2문장 분리(만료 여부로 대상이 달라 하나로 합치면 누락 발생).
-- 2-a) 만료 여부 무관 전 잔여 소진(used=total). 이미 만료됐지만 잔여>0 인 오픈클래스 크레딧이
--      자정 만료 cron 에서 이월 재생성되는 경로를 우회 차단(만료된 행은 2-b 대상이 아니라 누락됨).
UPDATE icehockey.member_credits
SET used_sessions = total_sessions
WHERE used_sessions < total_sessions;
-- 2-b) 아직 유효한(미만료) 크레딧은 즉시 만료시켜 월권 기간 게이트 제거.
UPDATE icehockey.member_credits
SET expires_at = NOW()
WHERE expires_at > NOW();
