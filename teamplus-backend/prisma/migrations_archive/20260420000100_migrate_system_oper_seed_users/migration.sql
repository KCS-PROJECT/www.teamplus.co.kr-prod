-- ============================================================================
-- Migration: system@/oper@ seed 계정의 user_type을 SYSTEM/OPER로 이행
-- Prerequisite: 20260420000000_add_system_oper_user_types (enum 값 추가 완료)
-- Date: 2026-04-20
-- ----------------------------------------------------------------------------
-- PostgreSQL 제약: ALTER TYPE ... ADD VALUE 는 동일 트랜잭션 내에서 새 값 사용 불가.
--   → 선행 마이그레이션에서 enum 추가만 수행 후 COMMIT
--   → 이 마이그레이션에서 별도 트랜잭션으로 기존 seed 데이터 이행
-- ============================================================================

-- 시드 계정 전환 (이미 SYSTEM/OPER 이면 영향 없음 · idempotent)
UPDATE "users"
   SET "user_type" = 'SYSTEM'
 WHERE email = 'system@teamplus.com' AND "user_type" = 'ADMIN';

UPDATE "users"
   SET "user_type" = 'OPER'
 WHERE email = 'oper@teamplus.com' AND "user_type" = 'ADMIN';

-- 운영팀 메모:
-- 추가 관리자 계정을 SYSTEM/OPER 로 분류해야 하는 경우 별도 수동 UPDATE 실행.
-- admin@teamplus.com (레거시 ADMIN) 는 APP 화면 로그인 호환 유지 목적으로 변경하지 않음.
