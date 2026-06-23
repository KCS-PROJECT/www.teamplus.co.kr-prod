---
name: feedback-task-ownership
description: TaskUpdate closing 시 owner 필드를 반드시 확인 — 본인 owner 영역만 closing 가능
metadata:
  type: feedback
---

TaskUpdate로 task status를 `completed`로 변경할 때는 반드시 해당 task의 `owner` 필드를 먼저 확인하고, 본인이 owner인 task만 closing한다.

**Why**: 2026-05-16 TEAMPLUS 타이포그래피 통일 작업 중 team-lead가 "task #2 completed 처리"라고 지시했지만, task #2 = Phase 4 Reviewer + Evaluator 검증 (owner: reviewer)이었음. 본인(builder-coach-director)이 jumlah closing → reviewer 검수 단계를 잘못 종료시킴 → team-lead가 in_progress로 복구하며 정정 지시함.

**How to apply**:
1. 본인이 직접 closing할 task는 **owner가 본인인 task만**
2. team-lead 지시가 task ID를 명시하더라도, owner 필드와 모순되면 **closing 전 명확화 요청** (SendMessage)
3. Phase 명칭이 본인 작업과 다른 경우 (예: Phase 4 검수 = reviewer 영역) 절대 closing 금지
4. 본인 builder 영역 작업 완료 시: 보고만 SendMessage로 보내고, team-lead 또는 본인이 owner인 task만 closing
5. TaskList 호출 시 owner 필드를 즉시 확인하는 습관

관련: [[user-role-builder]] — 본인은 builder-coach-director role, reviewer/evaluator 영역 task에 권한 없음.
