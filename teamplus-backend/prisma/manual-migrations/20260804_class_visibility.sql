-- [2026-08-04] 수업 공개범위(ClassVisibility) 신설 — enum + classes.visibility 컬럼 + 복합 인덱스.
--   · 배경: 수업이 소속 팀 안에서만 보여 학부모는 팀 가입 전 수업을 발견할 수 없고,
--     감독/코치는 수업을 만들어도 외부 노출 경로가 없었다. 감독이 수업 단위로
--     공개 범위를 고를 수 있게 하고, 전국 탐색(GET /api/v1/classes/explore)의 게이트로 쓴다.
--     SoT: docs/Planning/SPEC_CLASS_VISIBILITY.md
--   · 원격 공유 DEV/PROD DB(drift) 대상 수동 적용 (prisma migrate dev 금지) → prisma db execute.
--   · 비한정(unqualified) 식별자 — manual-migrations 컨벤션 일치(search_path = 연결 스키마).
--     로컬(public)/원격(icehockey) 양쪽 안전.
--   · 컬럼명 — schema.prisma Class 모델은 필드 @map 을 쓰지만 visibility 는 단일 단어라 동일.
--     인덱스명은 Prisma introspection 네이밍과 일치시켜 drift 를 방지한다
--     (@@index([visibility, isActive, approvalStatus]) → is_active / approval_status 는 @map 된 컬럼명).
--   · 기본값 TEAM_ONLY — 기존 수업 전량이 현재 동작(소속 팀 노출)을 그대로 유지한다.
--     별도 데이터 보정(UPDATE) 없음 → 배포 즉시 노출 범위 변화 0.
--   · 전부 멱등: enum 은 DO/EXCEPTION 가드(PG enum 은 IF NOT EXISTS 미지원),
--     컬럼·인덱스는 IF NOT EXISTS.

-- 1) 공개 범위 enum
--    PUBLIC         전체공개   — 비로그인 포함 전국 노출
--    PARENTS_ONLY   학부모공개 — 로그인한 PARENT/TEEN/CHILD 에게 전국 노출, 비로그인 차단
--    SELECTED_TEAMS 지정 팀    — class_team_visibilities 에 등록된 팀 구성원만
--    TEAM_ONLY      비공개     — 소속 팀·아카데미 구성원만 (기존 동작)
DO $$ BEGIN
  CREATE TYPE "ClassVisibility" AS ENUM ('PUBLIC', 'PARENTS_ONLY', 'SELECTED_TEAMS', 'TEAM_ONLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) 컬럼 추가 — NOT NULL + DEFAULT 로 기존 행 자동 백필
ALTER TABLE "classes"
  ADD COLUMN IF NOT EXISTS "visibility" "ClassVisibility" NOT NULL DEFAULT 'TEAM_ONLY';

-- 3) 전국 탐색 핫패스 인덱스 — visibility 게이트 + 공통 강제 필터(is_active/approval_status)
CREATE INDEX IF NOT EXISTS "classes_visibility_is_active_approval_status_idx"
  ON "classes"("visibility", "is_active", "approval_status");
