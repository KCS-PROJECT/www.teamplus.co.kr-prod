# SPEC — 수업 공개범위(Visibility) 도입 + 전국 수업 탐색

**작성일**: 2026-08-04
**상태**: 구현 완료 (하네스 검수 대기)
**관련 코드**: `teamplus-backend/src/classes/` · `teamplus-web/src/app/(class)/` · `teamplus-web/src/components/classes/ClassForm.tsx`

---

## 1. 배경 — 왜 이 변경이 필요한가

현재 TEAMPLUS 는 **수업이 소속 팀 안에서만 보이는 폐쇄 구조**다. 그 결과 공급·수요 양쪽이 동시에 막혀 있다.

| 입장 | 현재 겪는 문제 |
| --- | --- |
| **학부모** | 자녀가 팀에 가입(승인)되기 전에는 정규수업 목록이 빈 화면. 다른 감독/코치의 수업을 찾아볼 수단이 없어 등록 자체가 불가능하다. |
| **감독/코치** | 수업을 만들어도 외부에 노출되지 않는다. **이미 아는 학부모에게 개별 연락해 팀 가입을 유도**하는 방식 외에 신규 유입 경로가 없다. |

### 1-1. 원인 정정 — "팀 선택"이 아니라 "팀 가입"

흔히 "학부모가 팀을 선택하지 않아서 수업이 안 보인다"고 표현하지만, 코드상 **화면에 팀 선택 UI가 애초에 존재하지 않는다.**

`teamplus-web/src/app/(class)/classes/page.tsx:1470-1473`
```
// 학부모 본인 소속 팀 필터링은 BE에서 수행한다.
//  - PARENT 토큰 → TeamMember(approved, PARENT).teamId 기반으로 응답을 제한
//  - 가입 시 teamCode 필수 → 학부모는 항상 1개 이상의 소속 팀 보유
// FE에는 자녀 팀 토글 UI가 없으며, 검색·수업 유형 필터만 노출한다.
```

프론트가 보내는 파라미터는 `category`·`childId` 두 개뿐이고, 팀 스코프는 **서버가 JWT + 자녀 소속으로 자동 결정**한다. 즉 막고 있는 것은 선택이 아니라 **가입 승인 상태**이며, 학부모에게는 고를 기회조차 없다.

---

## 2. 현황 진단 (코드 근거)

### 2-1. `Class` 에 공개범위 개념이 없다

`teamplus-backend/prisma/schema.prisma:597-691`

| 필드 | 실제 역할 | 공개범위로 쓸 수 있나 |
| --- | --- | --- |
| `isActive` | 비활성 시 목록 제외 | ✗ on/off 뿐 |
| `approvalStatus` | 목록은 `APPROVED` 만 | ✗ 생성 시 `APPROVED` 하드코딩(`classes.service.ts:461-465`) → 사실상 상수 |
| `endedAt` / `salesOpenMonth` | Lifecycle v4.1 파생 상태 | ✗ 기간 개념 |
| `ClassTeamVisibility` (N:M, `:742-755`) | 오픈클래스 → 특정 팀 노출 | △ **테이블·관계·DTO(`visibleTeamIds`)는 살아 있으나 2026-06-29 정책 변경으로 조회 로직에서만 폐지**(`classes.service.ts:1140-1158`) |

→ `visibility`/`isPublic`/`publishedAt` 필드는 **존재하지 않는다**.

### 2-2. 목록 API 가 소속 팀 교집합을 강제

`teamplus-backend/src/classes/classes.service.ts:1187-1259` (`GET /api/v1/classes`)

```ts
if (user?.userType === "PARENT" && query.category !== "open") {
  const teamIds = viewerTeamIds ?? [];
  if (query.category === "regular") {
    if (teamIds.length === 0) {
      return { data: [], pagination: { total: 0, page, limit, totalPages: 0 } };  // ← 빈 배열 조기 반환
    }
    where.teamId = { in: teamIds };
  }
}
```

- **PARENT + `category=regular`** → 소속 팀 0개면 즉시 빈 배열
- **COACH/DIRECTOR** → 동일(`:1234-1239`). 2026-05-19 "다른 팀 수업까지 보이던 버그" 수정의 부작용
- 예외는 **오픈클래스**(`academyId != null`) 뿐 — PARENT 에게 팀 무관 전체 노출(`:1141-1152`)

팀 ID 해석: `common/utils/team-scope.util.ts:101-133` (`TeamMember approved` ∪ `CoachProfile.teamId` ∪ `Team.coachId`)

### 2-3. 프론트에도 발견 수단이 전혀 없다

| 사실 | 근거 |
| --- | --- |
| 수업 검색 UI가 **의도적으로 제거됨** | `classes/page.tsx:1483, 1515, 1857` — 주석 3곳 "검색·정렬 기능 제거 (사용자 요청)" |
| 학부모에겐 필터 칩조차 없음 | `:1859-1868` — FilterTabs 가 `(isChild \|\| isTeen)` 조건부 |
| 노출 팀 선택 UI 가 죽어 있음 | `ClassForm.tsx:1469-1546` — `{false && isAcademy && ...}`. 상태·핸들러 코드는 보존됨 |
| 팀 탐색도 막혀 있음 | `TeamPickerSheet.tsx:138-139` — "검색어가 비어있으면 전체 목록을 자동 노출하지 않고 안내만" → **팀 이름을 미리 알아야 검색 가능** |
| `levelRequired` 는 payload 에만 존재 | `ClassForm.tsx` 내 입력 UI 0건. `LEVEL_OPTIONS`(`useClassForm.ts:158-164`)만 정의 |
| `MESSAGES.search.classPlaceholder` 는 사문 | `messages.ts:2153` 정의됐으나 사용처 0건 |

### 2-4. ★ 전국 탐색 레퍼런스가 이미 존재한다

`teamplus-web/src/app/(public)/academies/page.tsx` — **인증 가드 없이 17개 시도 지역 칩 + 검색**이 이미 동작 중이다.

```ts
// :16
const REGIONS = ['서울','경기','인천','부산','대구','대전','광주','울산','세종',
                 '강원','충북','충남','전북','전남','경북','경남','제주'];
// :23-31  useDebounce 300ms
// hooks/useAcademy.ts:160-190  usePublicAcademies(search, region) → GET /academies/public?search=&region=
```

**새 패턴을 발명하는 게 아니라 이 패턴을 수업으로 확장하는 작업이다.** 아카데미만 이 혜택을 받고 클럽 팀 수업은 격리된 상태.

### 2-5. 기존 공개 검색에 보안·품질 구멍

`teamplus-backend/src/search/search.service.ts:215-257` — `GET /api/v1/search?type=classes` 는 `@Public()` 이라 비로그인도 전국 수업 검색이 된다. 그런데:

| 문제 | 영향 |
| --- | --- |
| `approvalStatus` 필터 없음 | 미승인(`PENDING`) 수업 외부 노출. `getAllClasses` 와 불일치 |
| `trainingType` 필터 없음 | **감독 내부 훈련**(대문자 `REGULAR_TRAINING`/`GAME`/`CAMP`)이 학부모 검색에 섞임. 한 컬럼 두 도메인 공존(`schema.prisma:606-609`) |
| 응답에 가격·일정·장소 없음 | 발견해도 등록 판단 불가 |

또 `assertClassAccessForManager`(`classes.service.ts:1525-1570`)는 PARENT/CHILD/TEEN 을 통과시키므로 **classId 만 알면 학부모는 임의 수업 상세를 이미 볼 수 있다**. 이 비대칭은 유지하기로 했다 — 근거는 §5-4.

### 2-6. 지역 필터 재료

| 소스 | 상태 |
| --- | --- |
| **`Venue.city`** (`schema.prisma:2451`) | ✅ **16개 시/도 정규화**(시드 42곳, `prisma/seeds/venues.seed.ts`) + `@@index([city])` |
| `Venue.latitude/longitude` | ✗ 스키마만 존재, 시드에 값 없음 → **반경 검색은 이번 범위 제외** |
| `Academy.region` | △ 자유 텍스트, 시("인천")·구("안양") 혼재 |
| `Team.location` | ✗ 자유 텍스트, 인덱스 없음 |

→ **`Class.venueId → Venue.city` 가 유일하게 신뢰 가능한 축.** `Class.venueId` 는 nullable 이므로 팀 홈링크장 폴백을 함께 건다.

---

## 3. 설계 결정

| 항목 | 결정 | 근거 |
| --- | --- | --- |
| 공개범위 단계 | **4단계** — 전체공개 / 학부모공개 / 지정 팀에만 / 비공개 | `SELECTED_TEAMS` 는 이미 있는 `ClassTeamVisibility` 인프라를 되살리는 것이라 신규 테이블 불필요 |
| DB 기본값 | `TEAM_ONLY` | 기존 수업 전량 백필값과 일치 → 배포 즉시 동작 변화 0. API 가 필드를 누락해도 안전한 쪽으로 수렴 |
| 폼 기본 선택 | `PARENTS_ONLY` | 발견성이라는 목적에 맞추되 감독이 의식적으로 바꿀 수 있게 함 |
| 발견 후 등록 동선 | **유형별 분기** | 오픈클래스는 현행 유지, 정규수업은 팀 가입 승인 권한을 감독에게 그대로 남김 |
| 좌표 반경 검색 | **이번 범위 제외** | 시드에 위경도 값 없음. 백필 후 별도 과제 |

---

## 4. DB 설계

### 4-1. `ClassVisibility` enum

`teamplus-backend/prisma/schema.prisma`

```prisma
/// 수업 공개 범위 (2026-08-04 신설)
enum ClassVisibility {
  PUBLIC         /// 전체공개 — 비로그인 포함 전국 수업찾기 노출
  PARENTS_ONLY   /// 학부모공개 — 로그인한 PARENT/TEEN/CHILD 에게 전국 노출, 비로그인 차단
  SELECTED_TEAMS /// 지정 팀에만 — ClassTeamVisibility 에 등록된 팀 구성원만
  TEAM_ONLY      /// 비공개 — 소속 팀·아카데미 구성원만. 기존 동작과 동일
}
```

`Class` 모델 추가:
```prisma
  visibility ClassVisibility @default(TEAM_ONLY)
  @@index([visibility, isActive, approvalStatus])   // 탐색 목록 핫패스
```

`ClassTeamVisibility`(`:742-755`)는 **스키마 변경 없이 재활용**한다. 조회 로직에서만 부활시킨다.

### 4-2. 마이그레이션 (`prisma migrate dev` 금지)

`teamplus-backend/prisma/manual-migrations/20260804_class_visibility.sql`

원격 공유 DEV/PROD DB 는 drift 정책상 수동 SQL 로 적용한다. 전부 멱등이며 `npm run db:migrate:manual` 로 실행된다(배포 시 자동).

```sql
DO $$ BEGIN
  CREATE TYPE "ClassVisibility" AS ENUM ('PUBLIC', 'PARENTS_ONLY', 'SELECTED_TEAMS', 'TEAM_ONLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "classes"
  ADD COLUMN IF NOT EXISTS "visibility" "ClassVisibility" NOT NULL DEFAULT 'TEAM_ONLY';

CREATE INDEX IF NOT EXISTS "classes_visibility_is_active_approval_status_idx"
  ON "classes"("visibility", "is_active", "approval_status");
```

**데이터 보정 없음** — 기존 수업 전량이 `TEAM_ONLY` 로 백필되어 현재 동작을 그대로 유지한다.

---

## 5. 백엔드 설계

### 5-1. visibility 게이트 공통 유틸

`teamplus-backend/src/classes/utils/class-visibility.util.ts` (신규)

목록·상세·검색 3곳이 같은 규칙을 쓰도록 단일 함수로 추출한다.

```ts
export function buildVisibilityWhere(
  user: JwtUser | undefined,
  viewerTeamIds: string[],
): Prisma.ClassWhereInput {
  if (user?.userType === "ADMIN") return {};

  const or: Prisma.ClassWhereInput[] = [{ visibility: "PUBLIC" }];
  if (!user) return { OR: or };                        // 비로그인 → PUBLIC 만

  or.push({ visibility: "PARENTS_ONLY" });             // 로그인 전 역할 공통
  if (viewerTeamIds.length > 0) {
    or.push({ visibility: "TEAM_ONLY", teamId: { in: viewerTeamIds } });
    or.push({
      visibility: "SELECTED_TEAMS",
      teamVisibilities: { some: { teamId: { in: viewerTeamIds } } },   // 기존 N:M 관계 재활용
    });
  }
  return { OR: or };
}
```

**뷰어별 노출 매트릭스**

| 뷰어 | PUBLIC | PARENTS_ONLY | SELECTED_TEAMS | TEAM_ONLY |
| --- | :---: | :---: | :---: | :---: |
| 비로그인 | ✅ | ✗ | ✗ | ✗ |
| PARENT / CHILD / TEEN | ✅ | ✅ | 지정 팀 소속 시 | 소속 팀만 |
| COACH / DIRECTOR / ACADEMY_DIRECTOR | ✅ | ✅ | 지정 팀 소속 시 | 소속 팀만 |
| ADMIN | ✅ | ✅ | ✅ | ✅ |

### 5-2. 신설: `GET /api/v1/classes/explore`

**별도 컨트롤러로 분리한다.** `ClassesListController` 는 클래스 레벨 `@UseGuards(AuthGuard("jwt"))` 라 `@Public()` 이 통하지 않는다 — `blog.controller.ts:31-40` 에 문서화된 프로젝트 공통 함정이다. `academy-public.controller.ts` 선례를 따른다.

`teamplus-backend/src/classes/classes-explore.controller.ts` (신규)

```ts
@Controller("api/v1/classes")
export class ClassesExploreController {
  @Get("explore")
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  async explore(@Query() query: ExploreClassesQueryDto, @CurrentUser() user?: JwtUser) { ... }
}
```

**서비스에서 강제하는 공통 필터** (클라이언트 입력 무관 — `blog.service.ts:46-69` 패턴):
```ts
const where: Prisma.ClassWhereInput = {
  isActive: true,
  approvalStatus: "APPROVED",
  endedAt: null,
  trainingType: { in: ["regular", "lesson", "spot"] },   // 대문자 training 도메인 배제
  AND: [buildVisibilityWhere(user, viewerTeamIds)],
};
```

**쿼리 파라미터** — `dto/explore-classes-query.dto.ts`

| 파라미터 | 검증 | 처리 |
| --- | --- | --- |
| `q` | `@IsOptional @IsString` | `className`/`description`/`instructorName`/`team.name` contains |
| `city` | `@IsIn(VENUE_CITIES)` | `venue.city` OR `venueId:null` 시 `team.venue.city` 폴백 |
| `category` | `@IsIn(['KIDS','JUNIOR','ADULT'])` | |
| `trainingType` | `@IsIn(['regular','lesson','spot'])` | |
| `dayOfWeek` | `@IsIn(['월'..'일'], {each})` | `dayScheduleEntries: { some: { dayOfWeek: { in } } }` |
| `timeSlot` | `morning`(~12) / `afternoon`(12~17) / `evening`(17~) | `dayScheduleEntries.startTime` 문자열 범위 비교 |
| `birthYear` | `@IsInt` | 비로그인·자녀 미선택 시 수동 지정 |
| `priceMax` | `@IsInt` | `products: { some: { price: { lte }, isActive: true } }` |
| `sort` | `recent`(기본)/`priceAsc`/`capacity` | |
| `page`/`limit` | **`clampLimit(raw, 20, 50)`** | `common/utils/pagination-clamp.util.ts` — 2026-07-30 `?limit=1000000` 커넥션 풀 고갈 사건 대응. 공개 엔드포인트 필수 |

**응답** — 등록 판단에 필요한 정보를 카드에 전부 싣는다(현행 search API 의 최대 약점 보완). 형태는 `{ items, total, page, pageSize }`(blog 컨벤션).

```ts
items: [{
  id, className, description, category, trainingType, visibility,
  owner: { type: 'team'|'academy', id, name, logoUrl },
  venue: { id, name, city, address },
  daySchedules: [{ dayOfWeek, startTime, endTime }],
  price: { min, feeType, billingTiming },      // ClassProduct 최저가
  capacity, enrolledCount, remainingSeats,
  targetBirthYears, ageMin, ageMax, levelRequired, coachName,
}]
```

> **개인정보 보호**: 응답에 수강생 정보를 일절 포함하지 않는다. 아동 관련 노출 필드는 위 스펙으로 한정한다.

### 5-3. 생성/수정 DTO 확장

`dto/create-class.dto.ts` / `dto/update-class.dto.ts`
```ts
  @ApiPropertyOptional({ enum: ClassVisibility, default: 'TEAM_ONLY' })
  @IsOptional()
  @IsEnum(ClassVisibility)
  visibility?: ClassVisibility;
```

`visibleTeamIds`(`create-class.dto.ts:322`)는 이미 존재 — **`visibility === 'SELECTED_TEAMS'` 일 때만 유효**하도록 서비스에서 검증하고, 그 외 값이면 무시 + 기존 행 정리.

### 5-4. 기존 API 처리 방침

| 대상 | 변경 |
| --- | --- |
| `search.service.ts` `searchClasses` | `approvalStatus:'APPROVED'` · `endedAt:null` · `trainingType in CLASSES_DOMAIN_TRAINING_TYPES` · `buildClassVisibilityWhere(...)` 추가 → §2-5 구멍 3건 동시 해소 |
| `classes.service.ts` `getAllClasses` | **팀 스코프 그대로 유지**. "내가 소속된 수업" 이라는 의미가 명확하고 캘린더·대시보드가 의존하므로 회귀 위험이 큼. 탐색은 `/explore` 로 분리 |
| `classes.service.ts` `assertClassAccessForManager` (수업 상세) | **게이트 미적용 — 의도적 결정** (아래 근거) |

#### 수업 상세에 게이트를 걸지 않는 이유

당초 "목록만 막고 상세를 열어두면 비대칭"이라 판단해 상세에도 같은 규칙을 걸려 했으나, 구현 중 **회귀가 확인되어 제외했다.**

- 오픈클래스는 `teamId = null` 이고 기존 수업의 백필값은 `TEAM_ONLY` 다.
  → `TEAM_ONLY` + `teamId = null` 조합은 어떤 뷰어로도 매칭되지 않아
  **이미 등록한 학부모가 자기 수업 상세를 못 보는** 상태가 된다.
- `assertClassAccessForManager` 의 PARENT/CHILD/TEEN 통과는 의도된 설계다 — 기존 주석이
  *"학부모 결제 검토·오픈클래스 영업 흐름 보존"* 이라고 명시하고 있다.

실질 노출 위험도 낮다. 상세 API 는 JWT 필수(`@Public` 아님)이고 `classId`(cuid)를 알아야 도달한다.
**목록·검색·탐색 3개 발견 경로를 게이트하면 실제 유입 경로는 닫힌다.**
근거는 `src/classes/utils/class-visibility.util.ts` 하단 설계 메모에도 남겼다.

---

## 6. 프론트 설계 (teamplus-web)

> **DESIGN.md 8 절대 규칙 준수**: gradient·backdrop-blur·컬러 그림자 금지 / AppBar·BottomNav 불가침(`MobileContainer` body 만) / `messages.ts` 한글 하드코딩 금지 / 버튼 한글 / 임의 hex 금지 / `usePageReady` 필수

### 6-1. 감독/코치 — 공개범위 선택 UI 부활·확장

`teamplus-web/src/components/classes/ClassForm.tsx` **SECTION 4.5**(`:1469-1546`)

- `{false && isAcademy && ...}` 가드 해제 → **팀 수업·오픈클래스 공통**으로 노출
- 라디오 4개 + `SELECTED_TEAMS` 선택 시에만 기존 팀 선택 UI(상태·핸들러 보존됨) 표출

```
공개 범위
 ( ) 전체공개      앱 밖에서도 검색됩니다
 (•) 학부모공개    로그인한 학부모에게 노출됩니다
 ( ) 지정 팀에만   [팀 선택 →]
 ( ) 비공개        우리 팀에만 보입니다
```

`teamplus-web/src/hooks/useClassForm.ts`
- `ClassFormData`(`:88-137`)에 `visibility` 추가
- `DEFAULT_FORM_DATA`(`:169-201`)에 `visibility: 'PARENTS_ONLY'`
- payload(`:888-978`)에 `visibility` 포함, `visibleTeamIds` 는 `SELECTED_TEAMS` 일 때만 전송
- 수정 모드 prefill — `GET /classes/{id}` 응답의 `visibility` 반영

**부가 개선**: 지역 필터 정확도 = `venueId` 채움률이다. 요일별 장소 미선택 시 경고 + 팀 홈링크장 기본 제안을 SECTION 3(`:765-1265`)에 추가한다.

### 6-2. 학부모 — 전국 수업 찾기 화면 (신규)

`teamplus-web/src/app/(public)/classes-explore/page.tsx`

`(public)/academies/page.tsx` 패턴을 그대로 따른다 — 같은 라우트 그룹, 같은 지역 칩, 같은 `useDebounce` 300ms.

```
[AppBar: 수업 찾기]
┌─────────────────────────────┐
│ 🔍 수업명, 코치, 팀으로 검색   │
├─────────────────────────────┤
│ [전체][서울][경기][인천]…     │  ← 지역 칩 (가로 스크롤)
│ [필터 ⚙]  [최신순 ▾]         │
├─────────────────────────────┤
│ ┌ U12 정규반          🏷정규 ┐│
│ │ 강남아이스하키클럽          ││
│ │ 📍 목동아이스링크 · 서울     ││
│ │ 🗓 월·수·금 17:00-18:30     ││
│ │ 💰 회당 35,000원 · 잔여 4석  ││
│ └ [자세히 보기]              ┘│
└─────────────────────────────┘
```

**필터 바텀시트**: 지역(시/도) · 대상 연령(출생연도) · 요일 · 시간대 · 수업 유형 · 가격 상한

**지역 상수 SoT** — `teamplus-web/src/lib/regions.ts` 로 추출하고 `(public)/academies/page.tsx:16` 의 `REGIONS` 를 이관해 단일화. 백엔드 `VENUE_CITIES` 와 값 정합성 유지.

**진입점** (학부모 전용 — 아동/청소년은 보호자가 등록하는 구조라 제외)
1. ✅ `/classes` 빈 상태 CTA — 팀 미소속 학부모가 막다른 화면에 갇히지 않게
2. ✅ `/classes` 상단 배너 — 결과가 있어도 다른 클럽 수업을 찾을 수 있게 (검색창 제거 자리)
3. ⏳ `(common)/search/results` 수업 탭 링크 — 후속 (위 2곳으로 발견 경로는 확보됨)

### 6-3. 등록 동선 — 유형별 분기

`teamplus-web/src/app/(class)/classes/[id]/page.tsx` 하단 CTA 를 수업 유형으로 분기한다.

| 수업 유형 | 조건 | CTA |
| --- | --- | --- |
| 오픈클래스(`academyId`) | 기존과 동일 | **[수강 신청하기]** — 현행 `POST /enrollments` 유지 |
| 정규수업(`teamId`) · 자녀가 해당 팀 소속 | `viewerTeamIds` 포함 | **[수강 신청하기]** — 현행 유지 |
| 정규수업 · 자녀 미소속 | 탐색 유입 신규 케이스 | **[팀 가입 신청하기]** + [수업 문의하기] |

**⚠ 제약 — 팀 가입 신청 진입점이 현재 없다.** 팀 가입은 회원가입/자녀등록 경로에서만 가능하다(`TeamPickerSheet` 사용처: `signup/page.tsx:1414`, `children/add/page.tsx:664`, `children/[childId]/edit/page.tsx:757`). `/team` 은 이미 소속된 팀만 보여준다(`team/page.tsx:144-146`).

→ **신규 API 없이 기존 흐름을 재사용한다**: `teamId` 쿼리 프리필 딥링크
- 자녀 있음 → `/children/{childId}/edit?teamId={teamId}`
- 자녀 없음 → `/children/add?teamId={teamId}`

### 6-4. `messages.ts` 키

- `MESSAGES.class.visibility.*` — `sectionTitle`, `public`/`publicHint`, `parentsOnly`/`parentsOnlyHint`, `selectedTeams`/`selectedTeamsHint`, `teamOnly`/`teamOnlyHint`, `selectTeamsRequired`
- `MESSAGES.classExplore.*` (신규 1차 키) — `title`, `searchPlaceholder`, `filterTitle`, `regionAll`, `dayLabel`, `timeSlot.*`, `priceMax`, `sortRecent`/`sortPriceAsc`, `emptyTitle`/`emptyDescription`, `joinTeamCta`, `inquiryCta`, `remainingSeats(fn)`

---

## 7. 공개 API 3중 화이트리스트 동기화 (누락 시 401)

`/classes/explore` 를 `@Public` 으로 여는 순간 3곳을 함께 갱신해야 한다. 이미 drift 가 있는 영역이라 특히 주의한다.

1. **백엔드** — `@Public()` (§5-2)
2. **웹** — `teamplus-web/src/services/api-lifecycle.ts:176-224` `PUBLIC_API_PATTERNS` 에 `/(^|\/)classes\/explore(\/|\?|$)/`
3. **앱** — `teamplus-app/lib/core/network/api_lifecycle_interceptor.dart:17-49` `kPublicApiPatterns` 에 `'/classes/explore'` (web 은 RegExp, Flutter 는 `contains` 부분일치로 방식이 다름)

추가로 **웹 라우트 가드**: `teamplus-web/src/hooks/useAuthClickGuard.ts:8-30` `PUBLIC_UI_PATHS` 에 `/classes-explore`.

---

## 8. 실행 순서

| # | 단계 | 상태 | 산출 |
| --- | --- | :---: | --- |
| 1 | 기획 문서 | ✅ | 본 문서 |
| 2 | DB | ✅ | `schema.prisma` enum·필드·인덱스 → `manual-migrations/20260804_class_visibility.sql` → `db:migrate:manual` → `prisma generate` |
| 3 | 백엔드 게이트 | ✅ | `classes/utils/class-visibility.util.ts` · `common/constants/{regions,class-domain}.constant.ts` · DTO `visibility` · create/update 4경로 · `search.service.ts` 봉합 |
| 4 | 탐색 API | ✅ | `dto/explore-classes-query.dto.ts` · `classes-explore.controller.ts` · `classes-explore.service.ts` · 모듈 등록(순서 주의) · `di:verify` 통과 |
| 5 | 화이트리스트 3중 동기화 | ✅ | web `PUBLIC_API_PATTERNS` · app `kPublicApiPatterns` · web `PUBLIC_UI_PATHS` |
| 6 | 감독 폼 | ✅ | `lib/class-visibility.ts` · `messages.ts` · `useClassForm.ts` · `ClassForm.tsx` SECTION 4.5/4.6 |
| 7 | 학부모 탐색 화면 | ✅ | `lib/regions.ts` · `services/class-explore.service.ts` · `hooks/useExploreClasses.ts` · `ExploreClassCard` · `ExploreFilterSheet` · `(public)/classes-explore/page.tsx` · 진입점 2곳 |
| 8 | 등록 동선 분기 | ✅ | `classes/[id]/page.tsx` CTA 분기 + `children/add`·`children/[childId]/edit` `teamId` 프리필 신규 지원 |
| 9 | 하네스 검증 | ⏳ | `/kcs-agents-teams` — 10.0/10 S등급만 합격 |

### 구현 중 확정된 사항 (계획 대비 변경)

| 항목 | 계획 | 실제 | 이유 |
| --- | --- | --- | --- |
| 수업 상세 게이트 | 적용 | **미적용** | 오픈클래스(`teamId=null`) + `TEAM_ONLY` 백필 조합에서 등록자도 차단되는 회귀 (§5-4) |
| 가격순 정렬 | `priceAsc` 제공 | **제외** | 최저가가 관계 테이블(`ClassProduct`)에 있어 DB 정렬 불가. `priceMax` 필터로 대체 |
| 노출 팀 목록 로딩 | academy 컨텍스트 | **SELECTED_TEAMS 선택 시 지연 로딩** | 팀 수업도 지정 노출이 가능해졌고, 불필요한 200건 조회를 피함 |
| `teamId` 프리필 | 기존 지원 확인 후 사용 | **신규 구현** | 두 화면 모두 `useSearchParams` 미사용이었음 → Suspense 경계와 함께 추가 |

---

## 9. 검증 방법

### 9-1. 백엔드 (단계 4 직후)

뷰어 4상태 × visibility 4값 매트릭스를 확인한다. 계정: `director@teamplus.com` / `ahn@teamplus.com` / 공통 비밀번호 `Test1234!` / `POST /api/v1/auth/login/dev`

```bash
# 비로그인 → PUBLIC 만 나와야 함
curl -s 'http://localhost:5003/api/v1/classes/explore?limit=5' | jq '[.data.items[].visibility] | unique'

# 학부모 → PUBLIC + PARENTS_ONLY (+ 소속 팀의 TEAM_ONLY/SELECTED_TEAMS)
curl -s -H "Authorization: Bearer $PARENT_TOKEN" 'http://localhost:5003/api/v1/classes/explore?limit=50' \
  | jq '[.data.items[].visibility] | unique'

# limit 클램프 — 50 이하로 잘려야 함
curl -s 'http://localhost:5003/api/v1/classes/explore?limit=1000000' | jq '.data.items | length'

# 감독 내부 훈련 배제 — 대문자 값이 0건이어야 함
curl -s 'http://localhost:5003/api/v1/classes/explore?limit=50' | jq '[.data.items[].trainingType] | unique'
```

### 9-1-1. 실측 결과 (2026-08-04, 로컬)

| 검증 | 기대 | 실측 |
| --- | --- | --- |
| 비로그인 | PUBLIC만 | ✅ `['PUBLIC']` 2건 |
| 학부모 | PUBLIC+PARENTS_ONLY+소속팀 TEAM_ONLY | ✅ 6건, 3종 모두 |
| `limit=1000000` | 50으로 클램프 | ✅ `pageSize: 50` |
| 지역 서울/경기 | 각각 필터링 | ✅ 3 / 3건 |
| 요일 월,수 / 토 | 각각 필터링 | ✅ 3 / 3건 |
| 시간대 evening/morning | 17:00 / 09:00 분리 | ✅ 3 / 3건 |
| 가격 상한·검색어 | 필터 동작 | ✅ 1 / 1건 |
| 잘못된 지역값 | 400 | ✅ HTTP 400 |
| 대문자 훈련 배제 | 소문자만 | ✅ `['lesson','regular']` |
| 상세 응답 `visibility` | 폼 prefill 가능 | ✅ `'PUBLIC'` 반환 |

> 검증에는 로컬 DB에 링크장 2곳(서울·경기)과 요일별 일정을 시딩했다.
> 원 시드에는 `Venue` 0건 · `ClassDaySchedule` 0건이라 지역·요일 필터를 확인할 수 없었다.

### 9-1-2. 브라우저 실측 (2026-08-04, Playwright)

**학부모 탐색 화면 `/classes-explore`** — 비로그인 상태로 전 항목 확인:

| 항목 | 결과 |
| --- | --- |
| 비로그인 직접 진입 | ✅ 401 리다이렉트 없이 렌더 |
| 목록 | ✅ PUBLIC 2건(카드에 팀명·장소·요일·가격·잔여석 전부 표시) |
| 지역 칩 17개 · 검색창 · 정렬 | ✅ |
| 필터 시트 | ✅ 요일 7 · 시간대 3 · 대상 3 · 유형 3 · 가격 상한 |
| 요일 '토' 필터 적용 | ✅ 0건 + 필터 배지 "1" + 빈 상태 문구 |
| 비로그인 힌트 | ✅ "로그인하면 더 많은 수업을 볼 수 있습니다." |
| 콘솔 에러 | ✅ 0건 |

**감독 폼 `/classes-manage/create`** — DIRECTOR 로그인 후 확인:

| 항목 | 결과 |
| --- | --- |
| "공개 범위" 섹션 | ✅ `radiogroup` + 라디오 4개 |
| 기본 선택 | ✅ "학부모공개" checked |
| "지정 팀에만" 선택 | ✅ "팀 선택하기" 섹션이 조건부로 나타남 |

#### 검증 중 발견·수정한 버그

**모듈 최상위에서 `MESSAGES.*` 평가 금지** — 옵션 배열을 모듈 스코프 상수로 두면
webpack 모듈 초기화 순서에 따라 `messages` 모듈보다 먼저 실행되어
`Cannot read properties of undefined` 로 **페이지 전체가 죽는다**. 그 여파로 해당 모듈의
`export` 가 비어 이를 import 한 페이지의 `EMPTY_FILTERS` 까지 undefined 가 되는 연쇄가 발생했다.
→ `buildTimeSlotOptions()` / `buildVisibilityOptions()` 처럼 함수로 감싸 렌더 시점에 평가하도록 수정.
페이지의 `useState` 초기값도 다른 모듈 상수 대신 인라인 리터럴을 쓴다.
프로젝트의 다른 컴포넌트는 전부 렌더 시점에 MESSAGES 를 읽고 있어 이 문제가 없었다.

### 9-2. 회귀 확인 (필수)

**기존 화면이 안 깨졌는지**가 이 작업의 최대 리스크다. 전량 `TEAM_ONLY` 백필이므로 변화가 0이어야 한다.

- `/classes` 학부모 화면 · `/classes-manage` 감독 목록 · `/class-calendar` · 대시보드 수업 카드
- `GET /api/v1/search?type=classes` — 게이트 추가 후 결과가 과도하게 줄지 않았는지

### 9-3. 프론트 (단계 7~8)

시뮬레이터는 원격 DEV web 을 로드하므로 로컬 web 변경이 반영되지 않는다 — **브라우저로 확인**한다.

- 비로그인 상태로 `/classes-explore` 직접 진입 → 401 리다이렉트 없이 렌더
- 지역 칩·필터 시트 조합 동작
- 팀 미소속 학부모 계정 → `/classes` 빈 상태 CTA → 탐색 화면 이동
- 정규수업 상세 → [팀 가입 신청하기] → 프리필된 자녀 화면 도달
- 다크모드 · `motion-reduce` · CHILD 계정 WCAG AAA

> **주의**: dev 서버 가동 중 `next build` 실행 금지 — `.next` 를 공유해 실행 중 dev 가 깨진다("Cannot find module './vendor-chunks/'" 500 의 원인).

---

## 10. 리스크

| 리스크 | 대응 |
| --- | --- |
| 기존 수업 노출 범위가 의도치 않게 변경 | 백필·기본값 모두 `TEAM_ONLY` → 동작 변화 0. §9-2 회귀 확인 필수 |
| 팀 가입 신청 진입점 부재 | 신규 API 없이 `teamId` 프리필 딥링크로 기존 흐름 재사용(§6-3) |
| 지역 필터 커버리지 갭 | `Class.venueId` nullable → 팀 홈링크장 폴백 + 감독 폼에서 장소 입력 유도(§6-1) |
| 3중 화이트리스트 누락 | §7 을 단계 5로 독립 배치, 이후 단계에서 즉시 발견됨 |
| 아동 개인정보 외부 노출 | `PUBLIC` 응답에서 수강생 정보 일절 제외. 노출 필드는 §5-2 응답 스펙으로 한정 |
| 좌표 반경 검색 기대 | 시드에 좌표 없음 → 이번 범위 제외. 백필 후 별도 과제 |

---

## 10-1. 알려진 제약 (후속 필요)

### (A) DIRECTOR/COACH 의 '지정 팀에만' — 팀 목록이 비어 있음

`ClassForm` 의 노출 팀 후보는 `GET /teams`(limit 200)로 조회하는데, 이 엔드포인트는
**SYSTEM/OPER/ADMIN/ACADEMY_DIRECTOR 전용**이라 DIRECTOR/COACH 는 403 이다.
원래 이 UI 가 오픈클래스(ACADEMY_DIRECTOR) 전용이었기 때문이다.

→ 팀 수업 감독이 '지정 팀에만'을 고르면 "등록된 팀이 없습니다"만 보이고 저장할 수 없다.

**해결 후보 2가지** (미적용 — 아래 (B) 때문에 브라우저 검증이 불가해 보류):
1. `GET /teams/public`(@Public, 응답 `{ total, clubs[] }`) 폴백 추가.
   ⚠️ `api.get` 은 403 에서 예외를 던지므로 `.catch()` 로 감싸야 폴백이 실행된다.
2. '지정 팀에만' 옵션을 오픈클래스 컨텍스트에서만 노출하고, 팀 수업은 3택으로 축소.

### (B) `/classes-manage/create` 간헐적 렌더 에러 — **본 작업과 무관 (기존 이슈)**

DIRECTOR 로그인 후 이 페이지를 반복 진입하면 "오류가 발생했습니다. 다시 시도해주세요."가
간헐적으로 뜬다. 최초 진입에서는 폼(공개 범위 포함)이 정상 렌더된다.

**본 작업이 원인이 아님을 확인했다** — `ClassForm.tsx` · `useClassForm.ts` 두 파일을
변경 전으로 되돌린 상태에서도 동일하게 재현된다(2026-08-04 실측).
API 호출은 전부 200 이며 SSR 컴파일 에러도 없어, 클라이언트 렌더 단계의 기존 문제로 보인다.
별도 이슈로 분리해 조사할 것.

## 11. 향후 과제 (범위 외)

- `Venue.latitude/longitude` 백필 → 내 위치 기준 반경 검색
- `levelRequired` 입력 UI 추가 + 공통코드 `CLASS_LEVEL` 도입 검토 (`COMMON_CODES_USAGE.md:283-292` 에 후보로 명시됨)
- `class-favorites` 목업(`class-favorites/page.tsx:33`) 실제 API 연동
- 수업 상세 공유 링크 OG 태그 (전체공개 수업의 외부 유입 경로)

---

## 9. 수업 지역(시/도 + 시군구) — 2026-08-04 추가

### 9-1. 배경

사용자 지시: *"감독이 서울에서 수업을 하는데 부산에 학부모가 선택하면 매주 올라오겠다는 소리이니, 화면에 시군구까지 표시할 것."*

§2-6 에서 지역 축으로 채택한 `Venue.city` 는 두 가지 한계가 있었다.

| 한계 | 결과 |
| --- | --- |
| 시/도 단계까지만 존재 (`Venue` 에 시군구 컬럼 없음) | 목록에 "서울" 까지만 표시 → 이동 거리를 가늠할 수 없다 |
| `Class.venueId` 가 nullable · 링크장 미등록 시 공백 | 지역 표기·필터 커버리지가 감독의 링크장 등록 여부에 좌우된다 |

→ **수업 자체가 지역을 갖도록** 바꾸고, 감독/코치가 등록 화면에서 직접 고르게 한다.

### 9-2. DB

```prisma
model Class {
  regionCity     String? @map("region_city") @db.VarChar(20)    /// "서울"
  regionDistrict String? @map("region_district") @db.VarChar(30) /// "강남구"
  @@index([regionCity, regionDistrict])   // 시/도 단독·조합 모두 커버(선두 컬럼 규칙)
}
```

마이그레이션: `prisma/manual-migrations/20260804_class_region.sql` (멱등 · `db:migrate:manual` 자동 적용).
**데이터 보정 없음** — 기존 수업은 NULL 로 남고 조회 시 장소/홈링크장 폴백이 계속 동작한다.

### 9-3. 값 SoT

| 위치 | 상수 |
| --- | --- |
| 백엔드 | `src/common/constants/regions.constant.ts` — `CITY_DISTRICTS` · `ALL_DISTRICTS` · `isValidDistrict()` |
| 웹 | `src/lib/regions.ts` — `CITY_DISTRICTS` · `districtsOf()` · `formatRegionLabel()` |

⚠️ 두 파일의 값이 어긋나면 저장이 400 으로 거부된다. 수정 시 함께 바꿀 것.
일반구(수원시 장안구 등)는 두지 않는다 — 장소 식별에 "수원시" 로 충분하고 단계를 늘리면 입력 이탈만 커진다.

### 9-4. 조합 검증 (이름 중복 대응)

시군구 이름은 시/도 간 중복이 많다("중구"·"동구"·"서구"·"고성군"…). DTO 의 `@IsIn(ALL_DISTRICTS)` 는 값 자체만 보므로 **"부산 강남구" 가 통과한다.** 조합은 서비스에서 막는다.

- `src/classes/utils/class-region.util.ts`
  - `assertClassRegion(city, district)` — 생성·수정 공통. 시군구 단독 전달 400 / 조합 불일치 400
  - `mergeClassRegion(current, dto)` — 수정 시 미전달 필드 유지. **시/도만 바뀌면 시군구를 비운다**(조합 붕괴 방지)
  - `buildClassRegionWhere(city, district)` — 탐색 필터. `regionCity` 우선, NULL 이면 장소→홈링크장 폴백
  - `formatRegionLabel(city, district)` — `"서울 강남구"` / `"서울"` / `null`

### 9-5. 표시 — `regionLabel` 단일 포맷

응답에 조합 문자열을 함께 실어 프론트 4곳이 같은 포맷을 쓰게 한다.
폴백 순서: **수업 지역(감독 선택) → 수업 장소 시/도 → 팀 홈링크장 시/도 → null**.
폴백 소스에는 시군구가 없으므로 구 수업은 시/도까지만 표시된다.

| 화면 | 위치 |
| --- | --- |
| 학부모 수업목록 `/classes` | 메타 줄 맨 앞 굵게 — 좁은 화면에서 잘려도 끝까지 남는 자리 |
| 감독 수업관리 `/classes-manage` | `place` 정보 행 (등록 후 바로 확인·정정) |
| 전국 탐색 `/classes-explore` | 카드 장소 줄 앞 굵게 |
| 수업 상세 `/classes/[id]` | 히어로 장소 줄 앞 굵게 |

### 9-6. 등록 폼

`ClassForm.tsx` SECTION 3.5 — 시/도 → 시군구 2단 셀렉트. **둘 다 필수**(시/도만 고르면 목적을 절반만 달성).
시/도 변경 시 시군구를 즉시 초기화한다. 기본값은 두지 않는다 — 임의 기본값("서울")이 그대로 저장되면 잘못된 지역을 학부모에게 보여주게 된다.

### 9-7. 탐색 필터

`GET /classes/explore` 에 `district` 추가(`city` 와 함께일 때만 적용). 지역 칩 아래 시군구 칩이 2행으로 붙는다.
**시군구를 고르면 지역 미입력(구 데이터) 수업은 결과에서 빠진다** — 구까지 지정한 사용자에게 "구 미상" 수업을 섞지 않기 위한 의도된 동작.

### 9-8. 남은 일

- 기존 수업 `regionCity` 백필 — 감독이 수정 화면에서 저장할 때 자연히 채워지나, 운영 시작 전 일괄 안내 필요
- `Venue.district` 도입 검토 — 링크장 자체에 시군구가 생기면 폴백도 구까지 내려갈 수 있다
