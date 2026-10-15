#!/usr/bin/env bash
#
# manual-migrations/*.sql 중 아직 적용되지 않은 파일만 파일명 순으로 적용한다.
#
# 배경: 원격 공유 DEV/PROD DB 는 drift 정책상 `prisma migrate dev` 를 쓰지 않고,
#   스키마 변경을 prisma/manual-migrations/*.sql 로 수동 작성한다. 그런데 배포의
#   `prisma migrate deploy`(db:migrate:prod)는 prisma/migrations/ 만 적용하고
#   manual-migrations/ 는 적용하지 않아, 신규 테이블/컬럼이 운영 DB 에 생성되지 않는
#   사고가 발생했다(예: contact_inquiries 누락 → 500 "데이터베이스 오류").
#   → 이 스크립트로 배포 시 manual-migrations 까지 함께 적용해 재발을 막는다.
#
# 적용 이력은 대상 스키마의 _manual_migrations 테이블에 남고, 한 번 적용된 파일은 다시
#   실행하지 않는다. 동작 상세는 apply-all.cjs 머리말 참고.
# DATABASE_URL 은 .env(또는 환경변수)에서 읽는다 — 대상 DB 를 바꾸려면
#   DATABASE_URL 을 해당 DB(로컬/DEV/PROD)로 지정해 실행한다.
#
# 사용:
#   npm run db:migrate:manual                  # 현재 DATABASE_URL 대상
#   npm run db:migrate:manual -- --status      # 적용 상태만 확인(읽기 전용)
#   DATABASE_URL="postgresql://..." npm run db:migrate:manual   # 특정 DB 대상
set -euo pipefail

# backend 루트로 이동(스크립트 위치: prisma/manual-migrations/)
cd "$(dirname "$0")/../.."

exec node prisma/manual-migrations/apply-all.cjs "$@"
