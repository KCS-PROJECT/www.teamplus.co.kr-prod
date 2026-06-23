/**
 * 타입드 네비게이션 코어 (Typed Navigation Core)
 *
 * 기존 Next.js URL 기반 라우팅 위에 **object 형태의 forward/backward 파라미터**
 * 전달 계층을 추가한다. 화면 A 가 화면 B 로 이동할 때 직렬화 가능한 forward 데이터를
 * 전달하고, B 가 닫히며 backward 결과를 A 의 콜백으로 회수할 수 있다.
 *
 * 설계:
 *  - 각 푸시 시점에 NavEntry 를 SessionStorage 의 스택에 적재 (탭별 격리)
 *  - URL 에 `_nav=<id>` 쿼리 파라미터로 엔트리 식별자를 부착
 *  - onBack 콜백은 인메모리 Map (Function 직렬화 불가). 페이지 새로고침 시 콜백은 손실되지만
 *    forward 데이터는 SessionStorage 에 유지되어 그대로 사용 가능하다.
 *  - popstate 리스너로 브라우저/네이티브 뒤로가기 모두 감지 → onBack 자동 발화.
 *  - Forward 데이터는 JSON 직렬화 가능 객체에 한정 (함수·DOM 노드 금지).
 *  - 스택은 LRU 로 50개 한도 유지하여 무한 누적 방지.
 *
 * 외부에서는 `useNavigation()` 의 object 인자 오버로드와 `useRouteParams()` 훅을 통해
 * 사용한다. 이 모듈을 직접 호출하는 대신 훅 레이어를 거칠 것.
 */

import { devWarn } from "@/lib/logger";

const STORAGE_KEY = "teamplus:nav:stack";
export const NAV_ID_PARAM = "_nav";
const MAX_ENTRIES = 50;

export interface NavEntry {
  /** 엔트리 고유 식별자. URL 의 `_nav` 쿼리에 부착된다. */
  id: string;
  /** 송신 화면이 수신 화면에 전달한 데이터 (직렬화 가능 객체). */
  forward?: unknown;
  /** 수신 화면이 `sendBack(result)` 로 큐에 넣은 결과 데이터. 뒤로가기 시 onBack 으로 전달. */
  pendingBackward?: unknown;
  /** 부모 엔트리(이전 화면) 의 id. 스택 추적용. */
  parentId?: string;
  /** 생성 타임스탬프 (LRU 트리밍용). */
  createdAt: number;
}

type OnBackCallback = (result: unknown) => void;

/**
 * onBack 콜백 인메모리 레지스트리. 함수는 직렬화 불가하므로 SessionStorage 가 아닌 Map 에 저장.
 * 새로고침으로 페이지가 재실행되면 이 Map 은 비워지지만, 그 시점에는 송신 화면 자체가
 * 이미 unmount 되어 콜백을 등록할 주체가 없으므로 의미 없는 손실이다.
 */
const onBackRegistry = new Map<string, OnBackCallback>();

/** popstate 리스너 중복 설치 방지. */
let popstateInstalled = false;

/** popstate 직전의 nav id — 어떤 엔트리가 pop 되었는지 비교용. */
let trackedNavId: string | null = null;

// ─── SessionStorage I/O ─────────────────────────────────

function readStack(): Record<string, NavEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as Record<string, NavEntry>;
  } catch {
    return {};
  }
}

function writeStack(stack: Record<string, NavEntry>): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stack));
  } catch {
    // SessionStorage 쿼터 초과 등 — 무음 실패. forward 데이터 손실되지만 라우팅 자체는 동작.
  }
}

function trimStack(stack: Record<string, NavEntry>): Record<string, NavEntry> {
  const ids = Object.keys(stack);
  if (ids.length <= MAX_ENTRIES) return stack;
  ids.sort((a, b) => stack[a].createdAt - stack[b].createdAt);
  const drop = ids.slice(0, ids.length - MAX_ENTRIES);
  for (const id of drop) {
    delete stack[id];
    onBackRegistry.delete(id);
  }
  return stack;
}

// ─── Public API ─────────────────────────────────────────

/**
 * 신규 nav 엔트리를 스택에 푸시하고 식별자를 반환한다.
 * 호출자는 반환된 id 를 URL `_nav` 쿼리에 부착하여 라우팅한다.
 */
export function pushNavEntry(opts: {
  forward?: unknown;
  onBack?: OnBackCallback;
  parentId?: string;
}): string {
  const id = generateNavId();
  const stack = readStack();
  stack[id] = {
    id,
    forward: opts.forward,
    parentId: opts.parentId,
    createdAt: Date.now(),
  };
  writeStack(trimStack(stack));
  if (opts.onBack) {
    onBackRegistry.set(id, opts.onBack);
  }
  ensurePopstateListener();
  return id;
}

/** 특정 nav id 의 엔트리를 조회. id 미존재 또는 stack 에 없으면 null. */
export function getNavEntry(id: string | null | undefined): NavEntry | null {
  if (!id) return null;
  const stack = readStack();
  return stack[id] ?? null;
}

/** 수신 화면이 backward 결과를 큐잉. 실제 발화는 popstate 시 onBack 으로. */
export function setPendingBackward(
  id: string | null | undefined,
  value: unknown,
): void {
  if (!id) return;
  const stack = readStack();
  if (!stack[id]) return;
  stack[id].pendingBackward = value;
  writeStack(stack);
}

/**
 * 명시적으로 엔트리를 소비(제거 + 콜백 발화). 보통 popstate 핸들러가 호출한다.
 * 외부에서도 강제 정리용으로 사용 가능 (예: 페이지가 unmount 되며 정리).
 */
export function consumeNavEntry(id: string | null | undefined): {
  entry: NavEntry | null;
  onBack: OnBackCallback | null;
} {
  if (!id) return { entry: null, onBack: null };
  const stack = readStack();
  const entry = stack[id] ?? null;
  const onBack = onBackRegistry.get(id) ?? null;
  if (entry) delete stack[id];
  onBackRegistry.delete(id);
  writeStack(stack);
  return { entry, onBack };
}

/** 현재 URL 의 `_nav` 쿼리에서 nav id 를 읽어 반환. SSR 또는 미존재 시 null. */
export function getCurrentNavId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return new URLSearchParams(window.location.search).get(NAV_ID_PARAM);
  } catch {
    return null;
  }
}

/**
 * 주어진 경로에 nav id 쿼리를 안전하게 부착한다.
 *  - 절대 URL(http/https) → 변경 없이 그대로 반환 (외부 링크는 typed nav 대상 아님)
 *  - 기존 쿼리/해시 보존
 *  - 이미 `_nav` 가 있으면 덮어쓴다
 */
export function appendNavId(path: string, id: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) return path;

  const hashIndex = path.indexOf("#");
  const hash = hashIndex >= 0 ? path.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? path.slice(0, hashIndex) : path;

  const queryIndex = withoutHash.indexOf("?");
  const base = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "";

  const params = new URLSearchParams(query);
  params.set(NAV_ID_PARAM, id);

  return `${base}?${params.toString()}${hash}`;
}

// ─── 내부 헬퍼 ────────────────────────────────────────

function generateNavId(): string {
  // crypto.randomUUID 가 가용하면 사용, 폴백은 짧은 base36.
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function ensurePopstateListener(): void {
  if (popstateInstalled || typeof window === "undefined") return;
  trackedNavId = getCurrentNavId();
  window.addEventListener("popstate", handlePopstate);
  popstateInstalled = true;
}

function handlePopstate(): void {
  const newId = getCurrentNavId();
  const poppedId = trackedNavId;
  trackedNavId = newId;

  if (!poppedId || poppedId === newId) return;

  // 새 URL 에 popped id 가 여전히 등장한다면 forward 이동(앞으로가기) 등 — 발화 안 함
  // (단방향 pop 만 처리)
  const { entry, onBack } = consumeNavEntry(poppedId);
  if (!onBack) return;

  try {
    onBack(entry?.pendingBackward);
  } catch (e) {
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      devWarn("[TypedNavigation] onBack 콜백 실행 중 오류:", e);
    }
  }
}

// ─── 테스트/디버그 유틸 (개발/테스트 환경에서만 사용) ──────────

/**
 * 디버그 유틸은 `NODE_ENV !== 'production'` 일 때만 의미있는 값을 반환한다.
 * 프로덕션 번들에서 호출되어도 안전하도록 no-op 처리한다 (트리쉐이킹은 빌드 환경 의존).
 */
function isDebugAllowed(): boolean {
  return process.env.NODE_ENV !== "production";
}

/** 현재 스택 스냅샷을 반환 (디버그용). 프로덕션에서는 빈 객체. */
export function __debug_getStack(): Record<string, NavEntry> {
  if (!isDebugAllowed()) return {};
  return readStack();
}

/** 스택 + 레지스트리 + popstate 리스너 상태 전체 초기화 (테스트용). 프로덕션에서는 no-op. */
export function __debug_resetAll(): void {
  if (!isDebugAllowed()) return;
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
  onBackRegistry.clear();
  trackedNavId = null;
  // 리스너 정리 — 다음 pushNavEntry 호출 시 재설치 가능하도록 플래그 리셋
  if (popstateInstalled) {
    window.removeEventListener("popstate", handlePopstate);
    popstateInstalled = false;
  }
}
