-- Phase 1 Step 1: ClubInvite 모델 + club_invites 테이블 폐기
-- 근거: docs/Planning/CLUBS_TO_TEAMS_MIGRATION_SPEC.md §1.1
-- 사용 0건 검증 완료 (백엔드 src 검색 결과 0).

DROP TABLE IF EXISTS "icehockey"."club_invites" CASCADE;
