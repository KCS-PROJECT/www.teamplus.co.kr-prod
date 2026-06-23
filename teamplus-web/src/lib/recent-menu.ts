/**
 * Recent Menu — 최근 이용 메뉴 localStorage 유틸리티
 *
 * Drawer 의 "최근 이용 메뉴" 섹션 전용 저장소.
 * - 키: `teamplus_recent_menu`
 * - 최대 5개 (오래된 항목 자동 drop)
 * - 동일 href 재방문 시 기존 항목을 제거 후 최상단에 push (LRU)
 * - SSR 안전 (typeof window 가드)
 * - JSON parse 실패 시 빈 배열 fallback
 */

const STORAGE_KEY = "teamplus_recent_menu";
const MAX_ENTRIES = 5;

export interface RecentMenuEntry {
  href: string;
  label: string;
  icon: string;
  /** Unix epoch ms — 정렬 기준 */
  ts: number;
}

function isBrowser(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function readRaw(): RecentMenuEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is RecentMenuEntry =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as RecentMenuEntry).href === "string" &&
        typeof (e as RecentMenuEntry).label === "string" &&
        typeof (e as RecentMenuEntry).icon === "string" &&
        typeof (e as RecentMenuEntry).ts === "number",
    );
  } catch {
    return [];
  }
}

function writeRaw(entries: RecentMenuEntry[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // QuotaExceededError 등 — 무시
  }
}

/**
 * 최근 이용 메뉴 조회 — 최근 방문 순으로 최대 5개 반환.
 */
export function getRecentMenu(): RecentMenuEntry[] {
  const list = readRaw();
  return [...list].sort((a, b) => b.ts - a.ts).slice(0, MAX_ENTRIES);
}

/**
 * 메뉴 방문 기록 추가.
 * - 동일 href 항목이 있으면 제거 후 최상단에 추가 (LRU 정책)
 * - 5개 초과 시 가장 오래된 항목 자동 drop
 */
export function addRecentMenu(entry: Omit<RecentMenuEntry, "ts">): void {
  if (!isBrowser()) return;
  if (!entry.href || !entry.label || !entry.icon) return;

  const existing = readRaw().filter((e) => e.href !== entry.href);
  const next: RecentMenuEntry[] = [
    { ...entry, ts: Date.now() },
    ...existing,
  ].slice(0, MAX_ENTRIES);

  writeRaw(next);
}

/**
 * 최근 이용 메뉴 전체 삭제.
 */
export function clearRecentMenu(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 무시
  }
}
