---
name: t06-payment-field-pending
description: T06 작업에서 roster 페이지에 isUnpaid() helper 와 hasUnpaidBalance/paymentStatus 옵션 필드를 추가했지만, 백엔드 /teams/:teamId/members 응답에 결제 상태 필드는 backend-doctor 가 추가 예정. graceful degradation 으로 미응답 시 현재 동작 유지.
metadata:
  type: project
---

T06(2026-05-15) 작업에서 `src/app/(coach)/classes-manage/[id]/roster/page.tsx` 의 미배치 학생 배치 버튼에 결제 미완료 차단 로직을 추가했다. UI 측은 `isUnpaid()` helper + `TeamMember` 옵션 필드(`hasUnpaidBalance`, `hasOutstandingPayment`, `paymentStatus`) 로 준비 완료.

**Why:** 기획 보고에 "결제 안한 학생 배치 가능" 이슈가 들어와 UI 차단을 먼저 마련했으나, 백엔드 `/teams/:teamId/members` 응답에 결제 상태 필드는 아직 없음. backend-doctor(T01) 에게 전파 완료 — 추가 시점 미정.

**How to apply:** 향후 roster 관련 작업 시 (1) 백엔드가 결제 필드를 추가했는지 확인하고 (2) 추가됐으면 `isUnpaid()` 가 자동 작동하므로 UI 변경 불필요. (3) 새 mutation 작성 시 `emitRefresh(REFRESH_KEYS.ROSTER)` 패턴 사용 권장 — cache-sync 팀이 만든 refresh-bus 모듈 (`src/lib/refresh-bus`) 활용.

관련 파일: `src/app/(coach)/classes-manage/[id]/roster/page.tsx` (isUnpaid 위치) · `src/lib/refresh-bus.ts` (emitRefresh/REFRESH_KEYS).
