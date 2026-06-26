---
date: 2026-06-26
task: 코치 상세(/director-coaches/[id]) 약력 개편 — 통계·담당수업 제거 + staff_careers 연결
tags: [harness, frontend, backend, staff-career, rbac, ownership-guard, data-modeling]
qa_score: 10.0
---

# 코치 상세 약력 개편 — 폐기된 지표 제거 + 기존 인프라 재활용

## 문제

`/director-coaches/[id]` 코치 상세 화면에 "배정된 수업·주간 시간·담당 수업" 영역이 있으나,
수업별 코치 배정 플로우가 폐기되어 이 지표들은 **항상 0**으로 표시됨(목록 화면은 실집계, 상세는
백엔드 미반환으로 0 → 목록 3개 → 상세 0개 불일치). 대신 코치·감독 약력을 보여줘야 했고,
약력 입력 기능은 어디에도 없었음.

## 근본 원인

1. **죽은 지표 잔존**: `weeklyClasses`/`weeklyHours`는 백엔드 `/admin/coaches/:id`가 계산하지
   않아 fallback 0 고정. 담당수업도 배정 폐기로 무의미.
2. **약력 인프라는 완비됐으나 "반쪽만 연결"**: `staff_careers` 테이블 + `careers` 모듈
   CRUD API가 이미 존재하고, `/coaches/:id`가 표시용으로 include까지 하는데, **입력 UI가
   전무**(`/careers/staff` 호출 0건)해서 데이터가 영원히 비어 있었음. edit 화면의 `career`
   textarea는 `/admin/coaches` PUT으로 보냈으나 User에 컬럼이 없어 **저장 안 되는 죽은 경로**.
3. **데이터 모델 선택 함정**: 약력 저장 위치 후보가 4개(User 컬럼 / User.note JSON /
   coach_profiles 컬럼 / staff_careers)였고, "코치만 vs 감독 포함" 대상 범위가 정해지기 전엔
   최적해가 안 나옴.

## 해결

- **대상이 코치+감독으로 확정** → userId 기반 `staff_careers`를 **원래 설계대로** 사용
  (coach_profiles는 COACH 전용이라 감독 약력 불가; User 컬럼은 9역할 공유 오염).
  → 스키마 변경 0, 백엔드 신규 엔드포인트 0.
- **자격증 = A안(description 통합)**: certifications가 경력 row 종속이라 "개인 자격 ↔ 경력
   종속" 미스매치 발생 → 별도 구조화 대신 description 자유 서술에 포함. 입력/표시 모두 미사용.
- 프론트: 통계·담당수업 섹션 + 죽은 코드 제거, `GET /careers/staff/profile/:userId`로 경력
   표시, `CareerFormSheet` 바텀시트(POST/PATCH/DELETE) 신설.
- 백엔드: `careers` mutation 3종에 소유권 가드 `assertCanManageCareer`(ADMIN/본인/관리팀
   교집합 외 403) 추가. 관리팀 판정은 `common/utils/team-scope.util.ts`의
   `resolveManagedTeamIds` SoT 재사용.

## 재발 방지

1. **"화면 영역만 있고 데이터 없는" 지표 발견 시, 먼저 데이터 출처를 양방향(목록↔상세)으로
   추적**하라. 한쪽만 보면(목록의 실집계) 정상으로 오판한다. 폐기된 도메인 플로우에 묶인
   지표는 제거가 정답.
2. **기능 구현 전 "백엔드 인프라가 이미 있는가"를 반드시 확인.** 이번 건은 테이블+API+표시
   코드까지 완비됐고 입력 UI만 빠진 "반쪽 연결"이었다. 신규 설계 대신 빠진 조각만 채우면 됨.
3. **userId 매핑 함정**: 코치 상세는 1차(admin/coaches=User.id)·2차(teams fallback=
   TeamMember.id) 경로가 섞인다. 외부 API(careers)에 넘길 땐 **반드시 실제 User.id**
   (`matched.user.id`)를 쓰고, TeamMember.id(`matched.id`)를 혼동하면 404. 미확보 시
   안전 비표시.
4. **데이터 모델 결정은 "대상 범위(누구의 데이터인가)"를 먼저 확정**하라. coach_profiles vs
   staff_careers vs User 선택은 "코치 전용이냐 지도자 전체냐"가 정해지면 자명해진다.
5. **소유권 가드는 기존 scope util(team-scope.util)을 재사용**하라. 관리팀 판정 로직을
   새로 짜면 TeamMember/CoachProfile/Team.coachId 합집합 규칙이 어긋난다.

---

## 추가 교훈 (v2, 2026-06-26): 구조화 → 자유 텍스트 재전환

### 무슨 일이 있었나
구조화 다중 필드(소속/직책/기간/리그)로 1차 구현(10/10)했으나, 사용자가 **실제 입력해보니
필드가 과하다**고 판단 → 약력을 **자유 텍스트 한 덩어리**(staff_careers.description)로
재전환. NOT NULL 필수 컬럼 3종(organizationName/role/startDate)을 nullable화(A-1)해
더미값 없이 NULL로 비우고, description만 사용.

### 교훈
6. **데이터 모델은 "입력 UX 부담"을 초기에 더 무겁게 반영하라.** "감독 포함이면
   구조화가 정규화상 맞다"는 정답이었지만, 사용자가 처음부터 자유 텍스트 예시를 보여줬다.
   정규화 우위보다 **실사용자의 입력 의지**가 우선이었고, 한 바퀴 돌아 자유 텍스트로 회귀했다.
   설계 추천 시 "이 입력을 매번 채울 사람이 누구이고 얼마나 귀찮은가"를 먼저 물어라.
7. **"임의값(더미) vs nullable" 선택**: 자유 텍스트 1필드를 구조화 테이블에 얹을 때,
   필수 컬럼에 `""`/가짜 날짜를 넣는 A-2보다 **nullable화(A-1)**가 정직하다(NULL=값 없음).
   운영 DB 변경이 가능하면 A-1. startDate(DateTime)는 빈 문자열 불가 → nullable이 유일하게 깨끗.
8. **공유 DEV DB ALTER는 직접 실행하지 말고 SQL만 전달**하라(사용자가 개발+운영 양쪽 실행).
   schema.prisma만 바꾸고 `prisma/manual-migrations/`에 SQL 보관. dev 서버가 query engine
   DLL을 점유하면 `prisma generate`가 EPERM → 서버 임의 종료 금지, 재시작 시 pre-hook 자동 재생성.
9. **세션 중단 후 재개**: 태스크 목록은 소실되어도 `_workspace/{task}/` 산출물 파일과
   실제 코드 상태(grep)로 진행률을 복구하라. "v2 빌드 기록 부재 + 파일 미전환"으로
   어느 트랙이 중단됐는지 정확히 짚어 그 지점부터 이어갔다.
10. **이전 빌더의 미완성 잔재 정리**: 중단된 빌더가 남긴 미선언 심볼(careerToDelete/
    formatYearMonth/ROLE_LABEL 등)을 다음 빌더가 grep 0건까지 제거해야 tsc가 통과한다.
11. **권한 게이트는 "데이터 소유자 범위"와 일치시켜라.** 약력 데이터 대상은 코치+감독인데
    프론트 편집 게이트가 `editable = (userType==='COACH')` 하나였다 → **감독 본인이 자기
    약력을 못 고치는 갭** 발생(백엔드 소유권 가드는 본인 허용인데 프론트가 막음).
    `canManageCareer = editable || user.id === coach.userId || user.userType==='admin'`로
    확장해 해소. 백엔드 권한과 프론트 노출 게이트는 항상 같은 범위로 맞춰라.
12. **레거시 표시 섹션은 입력 경로를 끊는 순간 함께 제거하라.** edit의 죽은 `career`
    textarea를 제거했으면, 그 값을 읽던 상세의 "약력 및 수상" 표시 섹션도 같이 지워야
    신규 약력과의 중복·혼란이 안 생긴다(evaluator가 권고로 잡아 후속 정리함).
13. **UI에 역할을 노출하면 그 역할이 호출하는 모든 백엔드 엔드포인트의 권한을 전수 맞춰라.**
    `profile/edit`가 `academy_director`에게 약력 UI를 노출했는데, careers staff API의
    `@Roles`와 service `allowedTypes`엔 ACADEMY_DIRECTOR가 빠져 있어 저장 시 403(end-to-end
    깨짐). "백엔드 변경 0"이라는 빌더 주장이 특정 역할에서 거짓이었고 evaluator가 잡아냈다.
    → 화면 노출 역할 집합 = 백엔드 `@Roles` ∩ 도메인 검증 배열이 일치하는지 **역할별로**
    확인. 권한은 컨트롤러 데코레이터 + 서비스 내부 검증 **두 군데** 모두 봐야 한다.
14. **권한 추가 시 사용자 대면 메시지/주석/Swagger description도 함께 갱신**(무감점이나 부채):
    role 배열에 역할을 추가하면 "감독·코치·관리자만 가능" 식 문구가 코드와 어긋난다.
    동작엔 무영향이나 후속 정리 권장.
15. **폐기된 도메인의 잔재는 "전 표면"을 전수 정리하라.** 수업별 코치 배정을 폐기했는데
    상세의 지표만 지우고 **목록의 "배정 수업 N개" 표시·집계·`/classes` API 호출은 남아**
    있었다(여러 라운드 뒤에야 발견). 도메인 폐기 시 상세·목록·카드·집계·불필요 API
    호출까지 한 번에 grep으로 전 표면을 훑어 제거해야 한다. 남은 집계는 무의미할 뿐
    아니라 불필요한 네트워크 호출 비용도 유발한다.
16. **같은 엔티티를 여러 화면이 다른 필드로 표시하면 불일치가 생긴다.** 코치 이름을
    목록은 `playerName`(팀멤버 표시명) 우선, 상세는 `user.name`(계정 실명) 우선으로 써서
    같은 코치가 화면마다 다른 이름으로 보였다. 표시 소스를 **단일 기준(계정 실명)**으로
    통일하라. 폴백 연산자(`??` vs `||`)도 화면 간 통일 권장.
