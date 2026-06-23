-- ============================================================================
-- Migration: UserType enum 확장 — SYSTEM / OPER 추가 (chldiv=ADM 전용 역할)
-- Related: chldiv 로그인 분기 (POST /api/v1/auth/admin/login)
-- Date: 2026-04-20
-- ============================================================================

-- PostgreSQL 은 enum 에 값을 "ADD" 만 지원 (제거 불가). 기존 enum 유지 + 2개 추가.
-- ADMIN · DIRECTOR · ACADEMY_DIRECTOR · COACH · PARENT · TEEN · CHILD 기존 값 변경 없음.

ALTER TYPE "UserType" ADD VALUE IF NOT EXISTS 'SYSTEM';
ALTER TYPE "UserType" ADD VALUE IF NOT EXISTS 'OPER';

-- 기존 seed 의 system@teamplus.com (ADMIN) → SYSTEM, oper@teamplus.com (ADMIN) → OPER
-- ALTER TYPE ... ADD VALUE 는 트랜잭션 내 사용이 제한되므로, 값 추가 후 별도 쿼리에서 UPDATE 가능.
-- 시드 스크립트(prisma/seed.ts) 의 upsertUser 헬퍼가 userType 변경도 자동 반영하므로,
-- 이 마이그레이션에서는 enum 추가만 수행하고 데이터 마이그레이션은 `npm run db:seed` 로 완결한다.
