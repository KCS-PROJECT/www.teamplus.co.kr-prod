#!/usr/bin/env node
/**
 * check-usePageReady.ts — usePageReady 100% 커버리지 + 정합성 검증 도구
 *
 * SoT: docs/Design/LOADING_TIMING_POLICY.md (v16+)
 * SPEC: claudedocs/SPEC_LOADER_IMPECCABLE_2026-05-20.md §3.2
 *
 * 책임:
 *  1. teamplus-web/src/app 하위 모든 page.tsx 스캔
 *  2. usePageReady 호출 여부 100% 커버리지 검증
 *  3. usePageReady(true) 호출 페이지에서 fetch 패턴 자동 검출
 *     → C (Critical) 후보 자동 식별
 *  4. 의심 페이지 리스트 출력 (개발자 검토용)
 *  5. CI 가드: 미커버 page.tsx 발견 시 exit 1
 *
 * 실행:
 *   npm run check:usePageReady
 *   또는 npx tsx tools/check-usePageReady.ts
 *
 * 옵션:
 *   --json   결과를 JSON 으로 출력
 *   --strict 의심 페이지(C) 발견 시에도 exit 1
 */

import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { execSync } from 'child_process';

interface PageScanResult {
  file: string;
  hasUsePageReady: boolean;
  callsTrue: boolean;
  callsCondition: boolean;
  conditionExpr?: string;
  fetchSignals: {
    apiGet: number;
    apiOther: number;
    rawFetch: number;
    dataHooks: string[]; // useFoo() data-fetching hook names
    apiInUseEffect: boolean;
    earlyReturnOnLoading: boolean;
  };
  classification: 'A' | 'B' | 'C' | 'UNKNOWN';
  reasons: string[];
  /**
   * 본 페이지가 usePageReady 커버리지 검증에서 제외되어야 하는가.
   *
   * 제외 사유 (v18, 2026-05-20):
   *  1. React Server Component (RSC) — 'use client' 디렉티브 없음. usePageReady 는
   *     React hook 으로 client 전용. RSC 는 서버에서 즉시 redirect/render 하므로
   *     클라이언트 마운트가 일어나지 않음 → hook 호출 불가능.
   *  2. `// @check-usePageReady-skip` 명시 마커 — 의도적 제외 (예: 로그인 페이지의
   *     race condition 회피용 미호출).
   */
  excluded: boolean;
  excludeReason?: string;
}

const PROJECT_ROOT = join(__dirname, '..');
const APP_DIR = join(PROJECT_ROOT, 'src/app');

const ARGS = new Set(process.argv.slice(2));
const JSON_MODE = ARGS.has('--json');
const STRICT_MODE = ARGS.has('--strict');

// 데이터 패칭 hook 화이트리스트 (false positive 줄이기 위해 명시)
// 추가 시 SoT 와 동기화 필요
//
// v18 (2026-05-20) — audit §4.1 인간 SoT 반영:
//   useAppSettings / useAppSettingsContext / useNotificationCount 는 layout 단계에서
//   사전 로드되는 context hook 으로 페이지 자체 fetch 가 아님. 또한 fallback 기본값
//   (0 / null) 을 보장하여 즉시 렌더 가능. C-Critical 오탐 방지 위해 제거.
//   useNotificationSettings 는 사용자별 설정 fetch 가 있어 유지.
const KNOWN_DATA_HOOKS = [
  'useNotificationSettings',
  'useAcademyDetail',
  'usePublicAcademies',
  'usePromotions',
  'useVenues',
  'useVenueDetail',
  'useMyClubId',
  'useChildren',
  'useChild',
  'useClassList',
  'useDashboardData',
  'useTrainingSessions',
  'useTrainingDetail',
  'useNoticeList',
  'useNoticeDetail',
  'useMatches',
  'useMatch',
  'useTeams',
  'useTeam',
  'useCredits',
  'usePayments',
  'useAttendance',
  'useChatRooms',
  'useChatRoom',
  'useMessages',
  'useSchedule',
  'useStats',
  'useShopProducts',
  'useShopProduct',
  'useShopCart',
  'useReviews',
  'useNotifications',
  'useFAQ',
  'useFaqList',
];

// fetch 가 아닌 sync/UI hook (false positive 방지)
const UI_HOOKS_BLACKLIST = new Set([
  'useState',
  'useEffect',
  'useCallback',
  'useMemo',
  'useRef',
  'useId',
  'useReducer',
  'useContext',
  'useLayoutEffect',
  'useImperativeHandle',
  'useDebugValue',
  'useDeferredValue',
  'useTransition',
  'usePathname',
  'useRouter',
  'useParams',
  'useSearchParams',
  'useNavigation',
  'useNativeUI',
  'useDefaultUI',
  'useAuthUI',
  'useToast',
  'useModal',
  'useKeyboardAvoidance',
  'usePageReady',
  'useScreenMetrics',
  'useStableLayout',
  'useFormState',
  'useFormContext',
  'useFormControl',
  'useDebounce',
  'useGuestOnly',
  'useRequireRole',
  'useRequireAuth',
  'useSessionAuth', // auth context — 데이터 fetch 아님 (layout 이 처리)
  'useAuth',
  'useFileUploadSync', // sync subscriber, not fetch
  'useWebSocket',
  'useAccessibility',
  'useVenuePermissions',
]);

/**
 * page.tsx 파일 목록 수집
 */
function collectPageFiles(): string[] {
  const cmd = `find "${APP_DIR}" -name "page.tsx" -type f`;
  const output = execSync(cmd, { encoding: 'utf-8' });
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .sort();
}

/**
 * 한 페이지 파일 스캔 + 분류
 */
function scanPage(filePath: string): PageScanResult {
  const content = readFileSync(filePath, 'utf-8');
  const relPath = relative(PROJECT_ROOT, filePath);

  // 0. RSC / 명시 제외 마커 감지 (v18, 2026-05-20)
  //    - 'use client' 디렉티브 없음 → React Server Component. usePageReady 적용 불가.
  //    - // @check-usePageReady-skip 명시 마커 → 의도적 제외 (race condition 회피 등).
  //    - // @check-usePageReady-audit-B 명시 마커 → audit 인간 SoT 가 B(fallback OK) 로 분류한
  //      경우. 자동 도구 휴리스틱이 C 로 오탐하는 케이스를 audit §6.3 권위 분류 기준으로
  //      B 로 다운그레이드. --strict 모드에서 exit 1 회피.
  const trimmedHead = content
    .split('\n')
    .slice(0, 20)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('//') && !l.startsWith('/*') && !l.startsWith('*'));
  const hasUseClient =
    /^["']use client["']\s*;?$/.test(trimmedHead[0] ?? '') ||
    /^['"]use client['"]\s*;?$/.test(content.split('\n')[0]?.trim() ?? '');
  const hasSkipMarker = /@check-usePageReady-skip/.test(content);
  const hasAuditBMarker = /@check-usePageReady-audit-B/.test(content);

  let excluded = false;
  let excludeReason: string | undefined;
  if (!hasUseClient) {
    excluded = true;
    excludeReason = 'RSC (no "use client" directive — server component, no client mount)';
  } else if (hasSkipMarker) {
    excluded = true;
    excludeReason = 'Explicit @check-usePageReady-skip marker (intentional exclusion)';
  }

  // 1. usePageReady 호출 여부
  const usePageReadyCalls = content.match(/usePageReady\s*\([^)]*\)/g) ?? [];
  const hasUsePageReady = usePageReadyCalls.some(
    (c) => !c.startsWith('//') && !c.startsWith('* '),
  );

  // 2. true / 조건식 분리 — 코드 본문 내 호출만 인정 (주석/문자열 제외)
  // 정확히 줄 시작이 whitespace + usePageReady(...) 패턴
  const realCallLine = content
    .split('\n')
    .find((line) => /^\s*usePageReady\s*\(/.test(line));
  const callsTrue = realCallLine?.includes('usePageReady(true)') ?? false;
  const callsCondition = !!realCallLine && !callsTrue && /usePageReady\s*\(/.test(realCallLine);
  const conditionExpr = callsCondition
    ? realCallLine?.match(/usePageReady\(([^)]+)\)/)?.[1]
    : undefined;

  // 3. fetch 패턴 자동 검출
  const apiGet = (content.match(/\bapi\.get\s*[</]/g) ?? []).length;
  const apiOther = (content.match(/\bapi\.(post|put|delete|patch)\s*\(/g) ?? []).length;
  const rawFetch = (content.match(/[^.a-zA-Z]fetch\s*\(\s*['"`/]/g) ?? []).length;

  // 4. 데이터 hook 자동 검출 (화이트리스트 vs 패턴)
  const dataHooks: string[] = [];
  const hookCallPattern = /\buse[A-Z][a-zA-Z]+\s*\(/g;
  const matches = content.match(hookCallPattern) ?? [];
  const seen = new Set<string>();
  for (const m of matches) {
    const name = m.replace(/\s*\($/, '').trim();
    if (seen.has(name)) continue;
    seen.add(name);
    if (UI_HOOKS_BLACKLIST.has(name)) continue;
    if (KNOWN_DATA_HOOKS.includes(name)) {
      dataHooks.push(name);
      continue;
    }
    // 휴리스틱: 알려진 데이터 fetching 명명 패턴
    if (/^use(My|Get|Fetch|List|Load|Find|Search)[A-Z]/.test(name)) {
      dataHooks.push(name);
    }
  }

  // 5. useEffect 내부 API 호출 (auto-fetch on mount)
  // 단순 휴리스틱: useEffect 블록 다음 20줄 내에 api.get/post 등이 있으면 true
  const apiInUseEffect = (() => {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/useEffect\s*\(/.test(lines[i])) {
        for (let j = i + 1; j < Math.min(i + 25, lines.length); j++) {
          if (/\bapi\.(get|post|put|delete|patch)\s*\(/.test(lines[j])) return true;
          if (/load[A-Z][a-zA-Z]+\s*\(\s*\)/.test(lines[j])) return true; // loadAlbum(), loadData() 등
          if (/fetch[A-Z][a-zA-Z]+\s*\(\s*\)/.test(lines[j])) return true; // fetchData(), fetchPosts() 등
        }
      }
    }
    return false;
  })();

  // 6. `if (isLoading) return ...` 패턴 → 이중 로더 + Critical 신호
  const earlyReturnOnLoading =
    /if\s*\(\s*(is)?[Ll]oading[a-zA-Z]*\s*\)\s*\{?\s*return/.test(content) ||
    /if\s*\([^)]*(is)?[Ll]oading[^)]*\)\s*\{?\s*return/.test(content);

  // 7. Classification
  const fetchSignals = {
    apiGet,
    apiOther,
    rawFetch,
    dataHooks,
    apiInUseEffect,
    earlyReturnOnLoading,
  };

  const reasons: string[] = [];
  let classification: 'A' | 'B' | 'C' | 'UNKNOWN' = 'UNKNOWN';

  if (!callsTrue) {
    // 이미 조건식 사용 — 검증 OK
    classification = 'A';
    reasons.push('Already uses conditional usePageReady(...) — not in audit scope');
  } else {
    // usePageReady(true) 호출
    const hasFetch = apiGet > 0 || apiInUseEffect || dataHooks.length > 0;

    if (!hasFetch && apiOther === 0 && rawFetch === 0) {
      classification = 'A';
      reasons.push('No fetch on mount, no data hooks detected — static page OK');
    } else if (earlyReturnOnLoading) {
      classification = 'C';
      reasons.push(
        '🚨 Has `if (isLoading) return` early-return — usePageReady(true) fires BEFORE early return → double-loader race',
      );
    } else if (apiInUseEffect && dataHooks.length === 0) {
      classification = 'B';
      reasons.push(
        'Has api call in useEffect but no isLoading early-return — likely partial fetch with fallback render',
      );
    } else if (dataHooks.length > 0) {
      classification = 'C';
      reasons.push(
        `🚨 Uses data hooks ${dataHooks.join(', ')} — likely has isLoading state needing to be awaited`,
      );
    } else {
      classification = 'B';
      reasons.push('Has fetch signals but uncertain — manual review recommended');
    }
  }

  // v18 (2026-05-20): audit-B 마커 → 자동 휴리스틱 C 오탐을 인간 SoT 기준 B 로 다운그레이드.
  if (classification === 'C' && hasAuditBMarker) {
    classification = 'B';
    reasons.unshift(
      '👁️ Downgraded C→B by @check-usePageReady-audit-B marker (audit §6.3 human SoT)',
    );
  }

  return {
    file: relPath,
    hasUsePageReady,
    callsTrue,
    callsCondition,
    conditionExpr,
    fetchSignals,
    classification,
    reasons,
    excluded,
    excludeReason,
  };
}

function main(): void {
  const pageFiles = collectPageFiles();
  const results = pageFiles.map(scanPage);

  // v18 (2026-05-20): RSC / 명시 제외 페이지는 커버리지 통계에서 분리.
  //   RSC 는 client 마운트가 일어나지 않으므로 hook 호출 불가능, 명시 마커는 의도적 제외.
  const excluded = results.filter((r) => r.excluded);
  const inScope = results.filter((r) => !r.excluded);
  const missingCoverage = inScope.filter((r) => !r.hasUsePageReady);
  const callsTruePages = inScope.filter((r) => r.callsTrue);
  const critical = callsTruePages.filter((r) => r.classification === 'C');
  const conditional = callsTruePages.filter((r) => r.classification === 'B');
  const staticOK = callsTruePages.filter((r) => r.classification === 'A');

  if (JSON_MODE) {
    console.log(
      JSON.stringify(
        {
          totalPages: pageFiles.length,
          excludedCount: excluded.length,
          inScopeCount: inScope.length,
          missingCoverage: missingCoverage.length,
          callsTrueCount: callsTruePages.length,
          critical: critical.length,
          conditional: conditional.length,
          staticOK: staticOK.length,
          excludedFiles: excluded.map((r) => ({
            file: r.file,
            reason: r.excludeReason,
          })),
          missingCoverageFiles: missingCoverage.map((r) => r.file),
          criticalFiles: critical.map((r) => ({
            file: r.file,
            reasons: r.reasons,
            signals: r.fetchSignals,
          })),
          conditionalFiles: conditional.map((r) => ({
            file: r.file,
            reasons: r.reasons,
            signals: r.fetchSignals,
          })),
        },
        null,
        2,
      ),
    );
  } else {
    const inScopeCount = inScope.length;
    const coveredCount = inScopeCount - missingCoverage.length;
    const coveragePct =
      inScopeCount > 0
        ? ((coveredCount / inScopeCount) * 100).toFixed(1)
        : '100.0';
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  check-usePageReady — usePageReady 커버리지 + 정합성 검증');
    console.log('  SoT: docs/Design/LOADING_TIMING_POLICY.md (v16+)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log(`  📊 전체 page.tsx           : ${pageFiles.length}`);
    console.log(`  🚫 검증 제외 (RSC/marker)  : ${excluded.length}`);
    console.log(`  📋 검증 대상 (in scope)    : ${inScopeCount}`);
    console.log(
      `  ✅ usePageReady 적용       : ${coveredCount} (${coveragePct}%)`,
    );
    console.log(`  ❌ usePageReady 미적용     : ${missingCoverage.length}`);
    console.log('');
    console.log(`  🔍 usePageReady(true) 호출 : ${callsTruePages.length} 건`);
    console.log(`     A 정적 (OK)            : ${staticOK.length}`);
    console.log(`     B 조건부 (fallback)    : ${conditional.length}`);
    console.log(`     C Critical (수정 필요) : ${critical.length}`);
    console.log('');

    if (missingCoverage.length > 0) {
      console.log('━━━ ❌ usePageReady 미적용 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      missingCoverage.forEach((r) => console.log(`  - ${r.file}`));
      console.log('');
    }

    if (critical.length > 0) {
      console.log('━━━ 🚨 C Critical (수정 필요) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      critical.forEach((r) => {
        console.log(`  - ${r.file}`);
        r.reasons.forEach((reason) => console.log(`      → ${reason}`));
        if (r.fetchSignals.dataHooks.length > 0) {
          console.log(
            `      → data hooks: ${r.fetchSignals.dataHooks.join(', ')}`,
          );
        }
      });
      console.log('');
    }

    if (conditional.length > 0) {
      console.log('━━━ ⚠️  B 조건부 (검토 권장) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      conditional.forEach((r) => {
        console.log(`  - ${r.file}`);
        r.reasons.forEach((reason) => console.log(`      → ${reason}`));
      });
      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(
      '  📖 분류 SoT: claudedocs/USEPAGEREADY_AUDIT_2026-05-20.md',
    );
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  // CI 가드
  if (missingCoverage.length > 0) {
    process.exit(1);
  }
  if (STRICT_MODE && critical.length > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main();
