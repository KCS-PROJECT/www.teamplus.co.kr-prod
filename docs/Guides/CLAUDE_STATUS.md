# CLAUDE Status — Common Pitfalls · 미해결/해소 이슈 · 변경 이력

> CLAUDE.md에서 분리한 **프로젝트 현황·이슈 트래킹 상세**. CLAUDE.md는 한 줄 요약 + 이 문서 링크로 구성.

---

## ⚠️ Common Pitfalls

| 문제                     | 해결                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| 카드 데이터 저장 시도    | KG이니시스 토큰화, 카드번호 서버 저장 금지                                                 |
| 멱등성 키 누락           | `orderNumber` UNIQUE + 중복 시 기존 레코드 반환                                            |
| WebView 느림             | L1(메모리) / L2(디스크) / L3(CDN) 캐시 레이어                                              |
| 아동 UI 접근성           | 72x72dp 버튼, 7:1 대비율 (WCAG AAA)                                                        |
| N+1 쿼리                 | Prisma `select`로 필요한 관계만 명시                                                       |
| JWT 만료 처리            | Refresh Token 자동 갱신 ([hybrid-auth.ts](../../teamplus-web/src/services/hybrid-auth.ts)) |
| Alimtalk 미승인          | 새 템플릿은 카카오 사전 승인 필수                                                          |
| 동적 Tailwind 클래스     | `bg-${color}-500` 금지 → 상수 객체 정적 정의                                               |
| NestJS DI 해결 불가      | `npm run di:verify` 후 `npm run di:fix`                                                    |
| HMR stale ReferenceError | `kill <pid> && rm -rf .next && npm run dev`                                                |
| 인증 훅 중복 호출        | `layout.tsx`에서만 `useRequireRole`/`useAuth` 호출                                         |
| 하네스 문서 수치 하드코딩 | 에이전트/스킬 본문에 규모 수치 금지 — CLAUDE.md 실측 스냅샷 SoT 위임 (v4.0 정비의 원인)   |
| permission allowlist 시크릿 | `settings.local.json` allowlist에 자격증명 포함 명령 등록 금지 (2026-06-12 보안 감사)    |
| 하이브리드 AppBar 앱 버튼 소실 | `showAppBar:true` + `<PageAppBar>`(forceNative 미지정) → 앱에서 네이티브 타이틀만 뜨고 back/알림/메뉴 소실. 표준 패턴 = `showAppBar:false` + `<PageAppBar forceNative />` (/team·/classes·payment checkout). 2026-07-01 academy/[id]·payment(select·options·history) 수정 |
| AppBar 컴포넌트 수정 (불가침) | 원칙 금지 — 페이지 ad-hoc 수정·래핑 금지 유지. **예외 1건 기록**: `PageAppBar.titleLeading?` 옵트인 슬롯 추가(2026-07-01, /parent 헤더 팀 로고). 기본값 undefined→미렌더라 기존 전 화면 무영향(tsc 0). 향후 AppBar 확장도 옵트인+하위호환+**웹/WebView 양환경 검증** 전제. ⚠️ /parent 실사용분 WebView 검증 미완 |

---

## 🛠️ 하네스 변경 이력

> 하네스 자산(에이전트·스킬·커맨드·오케스트레이터)의 구성 변경 추적 테이블. 퇴행(regression) 방지용.
> 목록 자체의 SoT는 `.claude/agents/`·`.claude/skills/` 디렉토리. 트리거 규칙은 [CLAUDE.md 하네스 엔지니어링](../../CLAUDE.md) 참조.

| 날짜       | 변경 내용                                                                                                                       | 대상                                                              | 사유                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| ~2026-05-26 | 초기 구성 누적 (에이전트 20파일 · 스킬 15 · 커맨드 2)                                                                           | 전체                                                              | —                                                          |
| 2026-06-12 | 하네스 플러그인(revfactory/harness) 표준 정렬 전면 정비: kcs-agents-teams v4.0 (Phase 0 컨텍스트 판별 · `_workspace/` 컨벤션 · 팀 통신 프로토콜 · 에러 핸들링 · 테스트 시나리오) · C1~C8/판정기준을 `references/harness-checks.md` 단일 SoT 추출 | kcs-agents-teams · harness-verify                                 | 하네스 감사 46건 (skill/command 이중 정의 · Phase 0 부재) |
| 2026-06-12 | **Phase 5 compound 학습 축적 신설** — evaluator 합격 직후 `ce-compound mode:headless` → docs/solutions/ 문서화 + 반복 실수 하네스 역반영 | kcs-agents-teams SKILL.md                                          | 사용자 지시 (실행-검토 사이클 실수 반복 방지)              |
| 2026-06-12 | 전 에이전트 `model: opus` 승격(15개 sonnet→opus) · 팀 통신 프로토콜/재호출 지침/I-O 프로토콜 추가 · 본문 규모 수치 제거(SoT 위임) · www.teamplus.com 경로 정정 | .claude/agents/ 19개 전체                                          | 플러그인 표준 (opus 의무 · 팀 프로토콜 필수) — 사용자 승인 |
| 2026-06-12 | project-team-lead 고정 10인 로스터 → 키워드 기반 동적 선발 · evaluation_criteria 실측 갱신(모듈72·모델154·enum19) + "미확인=감점 금지" 규칙 | project-team-lead.md · evaluation_criteria.md · evaluator.md       | 로스터 drift (nano-banana2 등 구조적 배제) · 10.0 게이트 무한루프 위험 |
| 2026-06-12 | db-architect·prisma-crud에 원격 DEV DB 정책 반영 (`prisma migrate dev` 금지 → db execute 수동 ALTER)                            | db-architect.md · prisma-crud                                      | 기존 가이드가 운영 정책과 정면 충돌 (drift 악화 위험)      |
| 2026-06-12 | STT 3종 깨진 meeting-pipeline 참조 제거(6파일) + 변별 기준·후속 키워드 · 커맨드 2개 thin pointer 축소                            | whisper/google/clova-stt · commands/                               | 깨진 링크 · skill/command 모순                             |
| 2026-06-12 | **신규 스킬 3종**: security-audit-followup(감사 잔여 추적) · deploy-pipeline(Jenkins/pm2 SoT) · home-page(랜딩 전용 토큰 가드)   | .claude/skills/ 신규 3 디렉토리                                    | 커버리지 공백 (보안 후속·배포·home 오적용 위험) — 사용자 승인 |
| 2026-06-12 | 카탈로그 동기화: 미등재 2종(app-review-expert·teamplus-platform-expert) 등록 · 깨진 링크(ICETIME_ADMIN_ANALYSIS) 수정 · 파이프라인 표기 통일 | CLAUDE.md · CLAUDE_CATALOG.md · CLAUDE_OPERATIONS.md               | drift 감사 (개수 4중 불일치 · analyzer 표기 모순)          |
| 2026-06-12 | 하네스 사용 가이드 신설 (`HARNESS_USAGE.md` — 트리거 발화·파이프라인 흐름·직행 스킬 11종·정비 방법) + 카탈로그 링크                              | docs/Guides/HARNESS_USAGE.md · CLAUDE_CATALOG.md                   | 사용자 요청 ("하네스 사용방법 알려줘") — 팀 공유용 문서화  |
| 2026-06-13 | home-page 스킬 검증 섹션 보강 — build는 `DATABASE_URL` 인라인 우회 필수 · `npm run lint` 실행 금지(eslintrc 부재 대화형 함정) · motion.ts 모션 SoT 명시 | .claude/skills/home-page/SKILL.md                                  | v4.0 첫 실행 compound — builder·evaluator가 연달아 동일 함정 (docs/solutions/2026-06-13) |
| 2026-06-15 | **Phase 5 compound 폴백-우선 동기화** (v4.1) — `ce-compound` 미설치 현실 반영: 수동 `docs/solutions/` 작성을 운영 경로로 승격, ce-compound는 설치 시 선택적 자동화로 격하 · evaluation_criteria.md "Compound 학습 축적" 섹션 신설 · CLAUDE.md·CLAUDE_OPERATIONS.md 일관화 | kcs-agents-teams SKILL.md · evaluation_criteria.md · CLAUDE.md · CLAUDE_OPERATIONS.md(L66) · HARNESS_USAGE.md | 사용자 지시 — ce-compound 미설치인데 문서가 주 경로처럼 서술 → Phase 5 조용한 누락 위험 (4-렌즈 검증으로 evaluation_criteria 우선/폴백 역전·HARNESS_USAGE 3건 누락 교정) |

**보류 항목** (의도적 미적용): 에이전트 memory frontmatter 표준화(정책 결정 선행 필요) · tbot↔하네스 evaluator 기준 수렴(tbot 격리 원칙 존중) · generator SELF_CHECK 9점 한계(builder 자기 보수성 — evaluator 게이트와 무관)

---

## 🔴 미해결 이슈

- SSL Pinning (인증서 미배치 Phase 7 — 사용자 운영팀 배포 필요)
- 테스트 커버리지 목표 — Jest 임계값 70% (현재 약 51% — 46 spec/90 service)
- E2E — Playwright 4종 (`team-crud.spec.ts` · `match-lifecycle.spec.ts` 외 2건, 목표 10건)
- 카카오 알림톡 템플릿 승인 대기 (사용자/운영팀 카카오 비즈니스 콘솔 등록)
- Firebase 서비스 계정 JSON 미배치 (FCM 실발송 graceful fallback 상태, `FIREBASE_SERVICE_ACCOUNT_JSON` env 필요)
- 영상 업로드 스토리지(I-2) 선택 보류 (S3 vs R2 — 사용자 결정 대기)
- MemberLevelHistory.reason 인코딩 → status enum 전환 완료, 호환 레거시 일부 잔존 가능
- shadow DB 권한 P3014 이슈 (`prisma migrate dev` 대신 `db push` + `migrate resolve --applied` 우회 — 운영팀 권한 확보 필요)

---

## ✅ 해소된 이슈 (2026-05-12 v9.3 — Flutter 3.41 메이저 업그레이드)

- ✅ **Flutter SDK 메이저 업그레이드 완료** — Flutter 3.41.6 / Dart 3.11.4. **14개 direct deps 메이저 업** (+ 33 transitive) · 41 컴파일 에러 → 0 · flutter analyze 통과 · flutter test 6/6 · android debug build 191MB · iOS build 52.5MB (108s)
  - **Riverpod 2→3** (`package:flutter_riverpod/legacy.dart` import 5개 파일 — StateProvider/StateNotifierProvider/StateNotifier 유지)
  - **flutter_local_notifications 18→21** (named-only API: `initialize(settings:)` · `show(id:, notificationDetails:)` · `cancel(id:)`)
  - **local_auth 2→3** (AuthenticationOptions 제거 → `persistAcrossBackgrounding`/`sensitiveTransaction` 직접 파라미터, `stickyAuth` → `persistAcrossBackgrounding` 리네임, `useErrorDialogs` 제거)
  - **file_picker 8→12-beta** (`FilePicker.platform.pickFiles()` → `FilePicker.pickFiles()` static, iOS 14+ API)
  - **google_sign_in 6→7** (`GoogleSignIn()` 생성자 제거 → `GoogleSignIn.instance` 싱글톤 · `signIn()` → `authenticate(scopeHint:)` · `account.authentication` sync getter · `GoogleSignInException(canceled/interrupted)` 핸들링)
  - **share_plus 10→13** (`Share.shareXFiles(...)` → `SharePlus.instance.share(ShareParams(...))`)
  - **firebase_core 3→4 · firebase_messaging 15→16 · connectivity_plus 6→7 · app_links 6→7 · package_info_plus 8→10 · mime 1→2 · flutter_lints 4→6**
- ✅ **iOS Deployment Target 13.0 → 15.0 상향** — Podfile `platform :ios, '15.0'` + post_install `IPHONEOS_DEPLOYMENT_TARGET = '15.0'` (firebase_core 4.x iOS 15 요구 · file_picker 12 iOS 14 요구) · Pods 36개 재설치 · iOS 14.x 이하 기기 차단 (시장 점유율 약 99% iOS 15+ 이므로 실사용 영향 미미)
- ✅ **회귀 테스트 체크리스트 문서화** — [`MIGRATION_REGRESSION_CHECKLIST.md`](../../teamplus-app/docs/MIGRATION_REGRESSION_CHECKLIST.md) 작성 (7개 도메인 · 5 Critical/High · 총 33분 회귀 시간 견적)
- ✅ **flutter_lints v6 신규 lint 대응** — `unintended_html_in_doc_comment` 4건 (doc `<...>` → `` `<...>` `` 백틱 escape)

---

## ✅ 해소된 이슈 (2026-04-22 v8.6 · v8.7)

- ✅ **Pull-to-Refresh** 6개 메인화면 일관 적용 — PullToRefreshIndicator v3 공통 컴포넌트(`<main>` 외부 flex item) · usePullToRefresh v2(native listener + preventDefault + dampingFactor 0.7 + maxDistance 160) · CHILD WCAG AAA size="lg"(32×32 · 16px · 대비 7:1) · motion-reduce 대응. SPEC/QA_REPORT 10.0/10 S 합격
- ✅ **웹관리자 `/parent` 리다이렉트 버그** 3단 실패 체인 근본 해결 — UserType enum 9개 동기화(SYSTEM/OPER 추가) · auth-routing DASHBOARD_PATHS 매핑 · AuthContext `?? 'parent'` 폴백 제거(원본 userType 유지) · login handleSubmit sessionStorage clear 가드. WEB-051 에러 문서화
- ✅ **MESSAGES.ui.releaseRefresh 런타임 undefined 버그** 근본 해결 — messages.ts 에 `ui` 블록 신설(pullRefresh · releaseRefresh · refreshing · cancel)
- ✅ **Native Bridge P0/P1/P2 8건 반영** — SPEC_NATIVE_BRIDGE_REFACTOR.md + QA_REPORT 10.0/10 S 합격 · 분석 원문(js_native1.md · js_natvice1.md) 은 SPEC/QA_REPORT/TODO_REGISTRY(P2-NB-001/002/004) 로 이관 완료 후 삭제
  - P0-1: onMessage dispatcher (addMessageListener / removeMessageListener · 기존 핸들러 보존 병렬 호출)
  - P1-1: isFlutterBridgeAvailable SOT 통합 (environment.ts 유지, native-bridge 재export)
  - P1-2: hybrid-auth 래퍼 우회 제거 → nativeAuth 단일 경로
  - P2-1: ui.onAppBarEvent `() => void` unsubscribe 반환 · useNativeUI cleanup
  - P2-2: pendingApiRequests.abortController dead field 제거
  - P2-3: theme SSR 체크 보수화
- ✅ **App 사이드 브릿지 드리프트 4건 전부 완료 (v8.7)** — A-1 **완전 dispatcher 전환** (Set 기반 listeners · `window.flutterBridge.addMessageListener/removeMessageListener` Public API 노출 · `_appBridgeDispatcherInstalled` 멱등성 가드 · 4개 내장 핸들러(deepLink/identity/UI config/AppBar)를 `appInternalListener` 로 캡슐화 · listener 별 try/catch 격리 · Web 측 `native-bridge.ts` dispatcher 와 완전 대칭 · `_originalFlutterBridgeOnMessage` legacy 호환 유지) · A-2 `_originalFlutterBridgeOnMessage` 저장 로직 추가 · A-3 JS wrapper 9건 신규(upload 5 + ui.share/getAppVersion/requestNotificationPermission) · A-4 webview_bridge.dart `_security.timestamp/nonce` Dart enforcement 활성(5분 만료 · nonce 중복 차단 1000 엔트리 LRU). [SPEC_NATIVE_BRIDGE_APP_DISPATCHER.md](../Planning/SPEC_NATIVE_BRIDGE_APP_DISPATCHER.md) + [QA_REPORT](../Planning/QA_REPORT_NATIVE_BRIDGE_APP_DISPATCHER.md) **10.0/10 S 합격**
- ✅ **BridgeLogger 통합** — native-bridge.ts 의 분산 `if (isDev) { console.* }` 가드 6건을 단일 `bridgeLogger.{debug|info|warn|error}` 로 통합
- ✅ **Bridge 버전 관리** — `window.FlutterBridge.__VERSION__ = '1.1.0'` 선언 · `getAppBridgeVersion()` / `isAppBridgeCompatible()` / `compareSemver()` 유틸 export · BRIDGE_WEB_VERSION / BRIDGE_MIN_APP_VERSION 상수
- ✅ **academy@teamplus.com seed 추가** — ACADEMY_DIRECTOR UserType · Test1234! · `npm run db:seed` 반영 시 활성화
- ✅ **WEB-050 · WEB-051 에러 문서화** — 향후 회귀 방지 레퍼런스 확보

---

## ✅ 해소된 이슈 (2026-04-19 v8.5)

- ✅ API Lifecycle 4-플랫폼 통합 — ApiLifecycleInterceptor · X-Request-ID/Platform/Version/Response-Time 4헤더 표준화 · UserActivityService Redis 5분 throttle
- ✅ 전처리 로그인 가드 — AuthGuardInterceptor(Flutter) · AuthRequiredError(Web/Admin) · PUBLIC_API_PATTERNS 화이트리스트 · `/login?redirect&reason` 자동 유도 · UnauthorizedToastListener
- ✅ 1초 SLA 성능 세트 — gzip compression(85% 실측) · keep-alive 65s · ETag(Weak) · AppSettings Redis 캐시(109ms→13ms) · Notifications unread 30s 캐시 · Prisma pool 10→25 · Flutter 타임아웃 30s→5/10/15s · Web preconnect+dns-prefetch
- ✅ Flutter EtagCacheInterceptor LRU 100 + 304 자동 복구 → 반복 GET 전송 0 byte
- ✅ TanStack Query 5.99.1 도입 (v8.5) → **2026-04-21 전체 롤백** (QueryProvider/queryKeys/DevTools 제거 · 6 파일 useState/useEffect 롤백 · npm uninstall @tanstack/react-query @tanstack/react-query-devtools 완료 · 사용자 요청)
- ✅ Lighthouse CI 1초 SLA 가드 — `server-response-time≤800ms`·`LCP≤2.5s`·`TBT≤300ms`·`FCP≤1.8s`·`uses-text-compression` 회귀 차단
- ✅ NotificationsGateway handleConnection 병렬 페칭 + `initial_state` 번들 이벤트 (~100-200ms 단축)
- ✅ MobileContainer pb-[72px]→`calc(60px+env(safe-area-inset-bottom,0px))` — child BottomNav 바로 위 12px slate-50 줄무늬 수정 (모든 역할 일괄 개선)
- ✅ Backend AllExceptionsFilter 401 응답 표준화 — `errorCode: AUTH_REQUIRED` + `redirectTo: /login` 자동 주입
- ✅ User.lastActiveAt 컬럼 추가 + Prisma db push 완료 (마이그레이션: `20260419000000_add_user_last_active_at`)
- ✅ CORS allowedHeaders 확장 — X-Request-ID/X-Client-Platform/X-Client-Version/X-Device-Id · exposedHeaders에 X-Response-Time/X-Server-Time 추가

---

## ✅ 해소된 이슈 (2026-04-18 v8.4)

- ✅ Sentry 활성화 (10.49.0 업그레이드, Next 15 호환 + PII 마스킹)
- ✅ 디자인 위반 4건 전부 해소 (gradient 1 + backdrop-blur 3, 헤더 외 실제 코드 0건)
- ✅ `@Roles()` 누락 전수 확인 완료
- ✅ ESLint `react/jsx-no-duplicate-props` 오류 9파일 18건 정리
- ✅ 픽업매치 환불 PaymentsService 통합 (금전 손해 방지)
- ✅ 크레딧 만료 배치 스케줄러 (+ unit test 5건)
- ✅ 게임 레슨 전날 확정 배치 (Asia/Seoul 매일 20:00)
- ✅ Club.defaultBillingTiming, ClassSchedule.rsvpDeadline 활성화
- ✅ ClubMember.leftAt/roleInTeam, User.lastLoginAt/dormantAt 컬럼 추가
- ✅ MemberLevelHistory.status enum (LevelApprovalStatus) + PlayerSkillLevel 모델 분리
- ✅ Admin pre-existing 타입 에러 10건(7파일) 정리 → `npm run build` 81/81 OK
- ✅ E2E Playwright 4 → 11 files / 63 tests (목표 10건 초과 달성)
- ✅ Jest 커버리지 51% → 70% (spec 45 → 54, 83 test case 추가)
- ✅ Lighthouse CI + GitHub Actions workflow (Moto G4 모바일 에뮬, performance>90 / a11y>95)
- ✅ WCAG 2.0 AA axe-core 자동 감사 (8 주요 페이지)
- ✅ WCAG 2.0 AAA CHILD UI 전용 감사 (2 페이지 + color-contrast-enhanced 7:1)
- ✅ I-2 영상 업로드 Cloudflare R2 3-phase (BE r2.gateway + presigned-url + /videos/from-r2 + Web VideoUploadButton + App video_upload_screen)
- ✅ 하네스 cron `type="button"` 멱등성 가드 (`<button(?![^>]*\btype=)` negative lookahead)
- ✅ ACADEMY_DIRECTOR UserType Admin UI 추가 (USER_TYPE_LABELS/TYPE_CONFIG/TYPE_FILTERS)
- ✅ 경로 버그 2건 수정 (`/admin/settlements` → `/settlements`, handleReject `post → patch`)
- ✅ clubId-as-memberId 버그 제거 (Task #42 ClubMembershipDto.id 필드 노출)
- ✅ MESSAGES.loading 존재하지 않는 키 참조 버그 수정 → MESSAGES.common.processing/saving 통일

---

## 📜 Version History

- **v9.4 (2026-05-23)** — **전수 docs SOT 동기화** (`/sc:analyze docs/ + root *.md`). 실측 스냅샷 갱신 — Backend 모델 147→**152** · enum 17→**19** · controller 74→**81** · service 99→**102** · module 70→**72** · DTO 172→**179** · routes **773**(신규 카운트) · migration **12**(신규 카운트). Web pages 229→**245** · hooks 62→**71** · 컴포넌트 353→**352** · services 34→**13**(정정) · MESSAGES 1차 키 181→**200**. Admin pages 86 유지 · 컴포넌트 **38** 신규 카운트. App dart 184→**211** · features 26→**29** · Bridge handlers 4→**16** · GoRoute 44→**42**. **teamplus-home 13 pages 신규 인지** (Next.js 14 랜딩 사이트). 디자인 위반 0 유지(헤더 blur 예외 1건).
- **v9.3 (2026-05-12)** — **Flutter 3.41 메이저 업그레이드** — Flutter 3.41.6 / Dart 3.11.4 · 14 direct deps 메이저 업 (+33 transitive) · Riverpod 2→3 (legacy.dart) · flutter_local_notifications 18→21 · local_auth 2→3 · file_picker 8→12-beta · google_sign_in 6→7 · share_plus 10→13 · firebase 3→4 (core+messaging) · connectivity_plus 6→7 · app_links 6→7 · package_info_plus 8→10 · mime 1→2 · flutter_lints 4→6. **iOS deployment target 13→15** (Podfile + post_install). 41 컴파일 에러 해결 · flutter analyze 0 · flutter test 6/6 · android debug 191MB · iOS Runner.app 52.5MB. 회귀 체크리스트 `MIGRATION_REGRESSION_CHECKLIST.md` 작성 (7 도메인 · 33분 회귀 견적).
- **v9.2 (2026-05-07)** — `/impeccable document` + `/kcs-agents-teams` 실행. 4개 루트 SoT (DESIGN.md/AGENTS.md/CLAUDE.md/GEMINI.md) + 5개 핵심 docs/ 문서 (WEB_DESIGN_SYSTEM/CLAUDE_STANDARDS/CLAUDE_STATUS/TAILWIND_CONVENTIONS/COMPONENT_PATTERNS) 일괄 동기화. **DESIGN system 섹션 신설** — 12 카테고리 토큰 표 + 8 절대 규칙 + 3 패턴 + 6 페르소나 + 10 메트릭. 특수 카테고리 토큰 (brand.kakao/-pay/-text/-hover · brand.naver/-hover · brand.samsung/line/facebook · qr.bg/scan · bubble.in/in-dark) 명시. Pretendard 단일 폰트 SoT 정정 (`font-num` 폰트 패밀리 = Pretendard, 이전 Inter CDN 외부 의존 표기 제거). Shadow 6종 토큰 표 (sh-1~4 + sh-blue + sh-rink). dark 변형 실측 6,000+ → **11,390+** 갱신. GEMINI.md 포트 정정 (5001, 5001, 5002). MESSAGES 도메인 45 → 44 정정. AppBar "마이 영역" → "알림 영역" 모든 사용자 6 호출자 일괄 적용. BottomNav 탭 클릭 시 FullScreenLoader 표시 (suppressNextLoad 제거). 라이트 모드 단일 강제 (ThemeContext + layout.tsx + settings/theme/page.tsx). 4 루트 SoT 와 docs/ 일관성 검증 통과.
- **v9.0 (2026-04-30)** — Phase 4 `clubs → teams` 일괄 rename 완료. Prisma 모델 8개(`Club/ClubMember/ClubPost(+3)/ClubEvent(+1)` → `Team*`) + DB 테이블 8개 + `club_id → team_id` 컬럼 28건 + 외부 모델 참조 ~40+건. 마이그레이션 `20260429004000_phase4_rename_clubs_to_teams` (ALTER TABLE RENAME, 데이터 보존). 백엔드 `src/clubs/ → src/teams/` 디렉토리/클래스 + 142 파일 코드 변환 (`prisma.club* → prisma.team*`, 메서드 70여개, DTO 9개, `@Controller('api/v1/teams')` 단일). web 65 + admin 17 + Flutter 7 파일 alias-aware 처리. 의도적 보존: `SignupClubDto.clubName/Code` 회원가입 입력, `alimtalk #{clubName}` 카카오 템플릿 변수, `HockeyMatch.home/awayClubId` 레거시, Flutter `/club-feed` 라우트(강제 업데이트 불가), admin `/dashboard/clubs/` 페이지(별개 용도). 후속 핫픽스: `SystemNotice.targetTeamId`, `getTeam/getPublicTeams` 응답 보강(`_count` nested + `groups` + `teamAwards`), `TeamsController @Get()` (root) 신설, 페이지 컴포넌트 `_count` 옵셔널 폴백
- **v8.7 (2026-04-22)** — Native Bridge App 측 A-1 완전 dispatcher 전환 (보류 항목 해소)
- **v8.6 (2026-04-22)** — Pull-to-Refresh + Admin 로그인 + Native Bridge 리팩터링
- **v8.5 (2026-04-19)** — API Lifecycle + 로그인 가드 + 1초 SLA 성능
- **v8.4 (2026-04-18)** — 품질 A~F + R2 영상 업로드 + WCAG 감사
- **v8.3** — Phase α~δ
- **v8.2** — /sc:analyze 재동기화
- **v8.1** — 자동 루프 활성화
- **v8.0** — QUICK INDEX 도입
- **v7.0** — 구조화

---

## 📊 실측 스냅샷 (2026-05-23 SOT 동기화 v9.4)

- **Backend**: **72 module** · **81 controller** · **102 service** · **152 model** · **19 enum** · **179 DTO** · **773 routes** · **12 migrations** · 54+ spec · 5 interceptor · 3 guard · (NestJS 10.2.10 · Prisma 5.7.1)
- **Web**: **245 pages** · **32 layouts** · **13 services** · **71 hooks** · **352 컴포넌트** · 12 E2E spec · 9 UserType(system/oper/admin/director/academy_director/coach/parent/teen/child) · (Next.js 15.5.9 · React 19)
- **Admin**: **86 pages** · **38 컴포넌트** · (Next.js 14 · TanStack Query 5.28)
- **App**: **211 dart** · **42 GoRoute** · **29 features** · **16 Bridge handlers** · Bridge **VERSION** 1.1.0 · \_security Dart enforcement 활성
- **Home**: **13 pages** · (Next.js 14 · React 18 · 신규 인지)
- **API**: **773 라우트**
- **messages.ts**: **단일 MESSAGES 객체 (1차 키 200개)**
- **디자인**: `bg-gradient-to-*` 실사용 **0건**(주석 3건) · `backdrop-blur-*` 실사용 **1건**(PageAppBar.tsx:302 헤더 예외만) · `shadow-*-500/30` **0건** · `dark:` 변형 **9,269 호출**

## 📊 실측 스냅샷 (2026-05-14 SOT 동기화)

- **Backend**: **70 module** · **74 controller** · **99 service** · **147 model** · 17 enum · **172 DTO** · **12 gateway** · 54+ spec · 2 interceptor(LoggerInterceptor + ApiLifecycleInterceptor) · 3 guard · (NestJS 10.2.10 · Prisma 5.7.1)
- **Web**: **229 pages** · **34 services** · **62 hooks** · **353 컴포넌트** · 12 E2E spec · 9 UserType(system/oper/admin/director/academy_director/coach/parent/teen/child) · (Next.js 15.5.9 · React 19)
- **Admin**: **86 pages** · **9 hooks** · (Next.js 14 · TanStack Query 5.28)
- **App**: **184 dart** · **44 GoRoute** · 26 features · 4 Bridge handlers · Bridge **VERSION** 1.1.0 · \_security Dart enforcement 활성

## 📊 실측 스냅샷 (2026-05-12 v9.3 — Flutter 3.41 메이저 업그레이드)

- **Backend**: 68 module · **73 controller** · **96 service** · **144 model** · 17 enum · 54+ spec · 2 interceptor(LoggerInterceptor + ApiLifecycleInterceptor) · 3 guard
- **Web**: **225 pages** · 27 services(native-bridge v3 dispatcher · hybrid-auth 래퍼 경유 · Bridge 버전 1.1.0) · **60 hooks** · 296 컴포넌트(PullToRefreshIndicator v3 · LoadingPuck) · 12 E2E spec · 9 UserType(system/oper/admin/director/academy_director/coach/parent/teen/child)
- **Admin**: **85 pages** · 21 services · 9 hooks
- **App**: **165 dart** · 30 GoRoute · 4 network interceptor · 15 Bridge wrapper · Bridge **VERSION** 1.1.0 · \_security Dart enforcement 활성
  - **Flutter 3.41.6 (Dart 3.11.4)** · iOS 15+ / Android SDK 24+ · Riverpod **3.3** (legacy.dart) · flutter_inappwebview 6.0 · firebase_core **4.8** · firebase_messaging **16.2** · local_auth **3.0** · flutter_local_notifications **21.0** · google_sign_in **7.2** · share_plus **13.1** · file_picker **12-beta** · app_links **7.0** · connectivity_plus **7.1** · package_info_plus **10.1** · mime **2.0** · flutter_lints **6.0**
  - **빌드 실측**: APK debug 191MB (167.9s) · iOS Runner.app 52.5MB (108.2s) · flutter test 6/6 통과 · flutter analyze 0 issues
- **이전 스냅샷 (2026-05-07 v9.2)**: Backend +1 controller +4 service · Web +8 pages +13 hooks · Admin -2 pages · App +1 dart (전체 동일, 메이저 업그레이드 외 변경 없음)
- **API**: ~700 엔드포인트
- **messages.ts**: **단일 MESSAGES 객체 (1차 키 181개)**
- **디자인**: 토큰 사용 3,557회 · `bg-gradient-to-*` **0건** · `backdrop-blur-*` **3건**(헤더 예외) · `shadow-*-500/30` **0건** · `dark:` 변형 **11,390+ 호출** (6,000+ 추정 → grep 실측)
- **자동화**: Agents 20 · Skills 32 · Commands 2
- **에러 문서**: WEB **58** (+7 WEB-052~058 · 최근 WEB-057 `/pickup-matches` → `/matches` 라우트 정정 · WEB-058 ProductCard button-in-button DOM nesting) · BE 37 · ADMIN 20 · APP 0

### 📊 실측 스냅샷 (2026-04-22 v8.6 · 이전 기록 보존)

- **Backend**: 68 module · 72 controller · 92 service · 145 model · 17 enum · 54 spec · 2 interceptor · 3 guard
- **Web**: 217 pages · 28 services · 47 hooks · 297 컴포넌트 · 12 E2E spec · 9 UserType
- **Admin**: 87 pages · 21 services · 9 hooks
- **App**: 164 dart · 35 GoRoute · 4 network interceptor · 15 Bridge wrapper · Bridge 1.1.0
- **messages.ts**: 40개 도메인 키
- **에러 문서**: WEB 51 · BE 37 · ADMIN 20 · APP 0

---

## 🔄 자동 루프 기록

- **2026-04-14** — Detect OK
- **2026-04-15** — /sc:analyze 8문서
- **2026-04-18** — kcs-agents-teams 파이프라인 완주
- **2026-04-19** — /kcs-agents-teams API Lifecycle 4-플랫폼 통합
- **2026-04-21** — TanStack Query 전체 롤백
- **2026-04-22** — /kcs-agents-teams Native Bridge 리팩터링 (P0/P1/P2 8건 · SPEC_NATIVE_BRIDGE_REFACTOR.md + QA_REPORT 10.0/10 S 합격 · App 사이드 4건 중 A-2/A-3/A-4 완료 · A-1 부분 해결 · academy 시드 · BridgeLogger · **VERSION** 1.1.0)
- **2026-04-22** — /kcs-agents-teams 보류 항목 (A-1) 수정 (SPEC_NATIVE_BRIDGE_APP_DISPATCHER.md + QA_REPORT_NATIVE_BRIDGE_APP_DISPATCHER.md 10.0/10 S 합격)
- **2026-04-22** — /kcs-agents-teams 미구현/기술부채 통합 해소 (SPEC_IMPLEMENTATION_GAPS.md + QA_REPORT_IMPLEMENTATION_GAPS.md 10.0/10 S 합격 · 22건 실질 대상 전수 해소 [P0 4/4 · P1 11/11 · P2 11/11 TODO_REGISTRY 이관])
- **2026-05-14** — Track 4 병렬팀 SOT 동기화 (포트 5003/5001/5002 · 모델 147 · MESSAGES 1차 키 181개 · Backend 70m/74c/99s · Web 229p/62h/353c · Admin 86p · App 184 dart)
- **2026-05-23** — /sc:analyze 전수 docs 동기화 v9.4 (모델 147→152 · enum 17→19 · MESSAGES 181→200 · Backend 70m→72m·74c→81c·99s→102s · Web 229p→245p·62h→71h·353c→352c · App 184→211 dart·26→29 features·4→16 bridge handlers · teamplus-home 13p 신규 인지)
