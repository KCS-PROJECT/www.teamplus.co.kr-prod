/**
 * Tournament 도메인 상태 enum 단일 source
 *
 * Backend Prisma schema (teamplus-backend/prisma/schema.prisma):
 * - League.status     String @default("draft")  // draft | active | completed
 * - OverseasTrip.status String @default("draft") // draft | open | closed | ongoing | completed | cancelled
 *
 * Admin UI 측 라벨/색상 매핑 + type guard 를 한곳에서 관리.
 * leagues/overseas 페이지에서 이 모듈만 import 하여 사용.
 */

// ─── League Status ────────────────────────────────────────────
export const LEAGUE_STATUSES = ["draft", "active", "completed"] as const;
export type LeagueStatus = (typeof LEAGUE_STATUSES)[number];

export const LEAGUE_STATUS_LABELS: Record<LeagueStatus, string> = {
  draft: "준비중",
  active: "진행중",
  completed: "완료",
};

export const LEAGUE_STATUS_COLORS: Record<LeagueStatus, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
  active:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  completed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
};

export const LEAGUE_STATUS_DEFAULT: LeagueStatus = "draft";

export function isLeagueStatus(value: unknown): value is LeagueStatus {
  return (
    typeof value === "string" &&
    (LEAGUE_STATUSES as readonly string[]).includes(value)
  );
}

// ─── Overseas Trip Status ─────────────────────────────────────
export const TRIP_STATUSES = [
  "draft",
  "open",
  "closed",
  "ongoing",
  "completed",
  "cancelled",
] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  draft: "준비중",
  open: "모집중",
  closed: "모집마감",
  ongoing: "진행중",
  completed: "완료",
  cancelled: "취소",
};

export const TRIP_STATUS_COLORS: Record<TripStatus, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
  open: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  closed:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  ongoing: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  completed:
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

export const TRIP_STATUS_DEFAULT: TripStatus = "draft";

export function isTripStatus(value: unknown): value is TripStatus {
  return (
    typeof value === "string" &&
    (TRIP_STATUSES as readonly string[]).includes(value)
  );
}
