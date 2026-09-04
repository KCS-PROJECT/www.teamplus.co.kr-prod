"use client";

/**
 * MyTeamHome — 감독·코치(관리 팀 1개)의 "팀" 탭 착지 화면.
 *
 * 팀 1개 원칙에서 목록(카드 1장)은 여백만 남기므로, 목록 대신 팀 운영 허브를 그린다.
 *  ① 네이비 히어로(로고·팀명·인원, 탭=팀 정보 상세) → ② 처리 필요(승인 대기·미수금) → ③ 다음 일정
 *  → ④ 운영(공지·정산) / ⑤ 구성(명단·코치·하위그룹) 메뉴.
 * 데이터는 관리 팀 목록 응답(TeamListItem)에 상세·멤버 집계 2건만 보태고, 로더 hide 는
 * 부모가 `onLoaded` 로 받은 뒤 결정한다 (LOADING_TIMING_POLICY).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigation } from "@/components/ui/NavLink";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { resolveImageSrc } from "@/lib/image-url";
import { MESSAGES } from "@/lib/messages";
import { useRefreshSubscription, REFRESH_KEYS } from "@/lib/refresh-bus";
import { api } from "@/services/api-client";
import { getTeam, type TeamListItem } from "@/services/team.service";
import { getTeamUnpaidTotal } from "@/services/payment";

// ─── 다음 일정 날짜·시간 포맷 (팀 목록 카드와 공유) ──────────────
export function formatNextEventDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round(
    (startOfTarget.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays === 0) return MESSAGES.team.homeNextToday;
  if (diffDays === 1) return MESSAGES.team.homeNextTomorrow;
  const mmdd = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  if (diffDays > 1 && diffDays < 7) {
    return `${MESSAGES.team.dayShort[d.getDay()]} ${mmdd}`;
  }
  return mmdd;
}

export function formatNextEventTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ─── 멤버 집계 ───────────────────────────────────────────
interface MemberCounts {
  head: number;
  coach: number;
  players: number;
}

interface MemberRow {
  roleInTeam?: string | null;
}

function countMembers(list: MemberRow[]): MemberCounts {
  let head = 0;
  let coach = 0;
  let players = 0;
  for (const m of list) {
    const role = (m.roleInTeam ?? "").toUpperCase();
    if (role === "HEAD_COACH") head++;
    else if (role === "COACH" || role === "MANAGER") coach++;
    else if (role === "PLAYER") players++;
  }
  return { head, coach, players };
}

async function fetchMemberCounts(teamId: string): Promise<MemberCounts | null> {
  const res = await api.get<MemberRow[] | { members?: MemberRow[]; data?: MemberRow[] }>(
    `/teams/${teamId}/members`,
    { params: { status: "approved" } },
  );
  if (!res.success || !res.data) return null;
  const list: MemberRow[] = Array.isArray(res.data)
    ? res.data
    : Array.isArray((res.data as { members?: MemberRow[] }).members)
      ? (res.data as { members: MemberRow[] }).members
      : Array.isArray((res.data as { data?: MemberRow[] }).data)
        ? (res.data as { data: MemberRow[] }).data
        : [];
  return countMembers(list);
}

// ─── 컴포넌트 ────────────────────────────────────────────
export interface MyTeamHomeProps {
  team: TeamListItem;
  /** 상세·멤버 집계 fetch 가 끝나면 1회 호출 — 부모가 풀스크린 로더 hide 시점을 결정 */
  onLoaded: () => void;
}

export function MyTeamHome({ team, onLoaded }: MyTeamHomeProps) {
  const { navigate } = useNavigation();
  const [groupNames, setGroupNames] = useState<string[]>([]);
  const [counts, setCounts] = useState<MemberCounts | null>(null);
  // 연체 미납 청구 건수 — 실패/권한 없음은 0(fail-closed, 줄 미노출)
  const [unpaidCount, setUnpaidCount] = useState(0);
  const [brokenLogo, setBrokenLogo] = useState<string | null>(null);

  const teamId = team.id;
  const teamName = team.name ?? MESSAGES.team.titleHome;

  const load = useCallback(async () => {
    const [detailRes, memberCounts, unpaidRes] = await Promise.all([
      getTeam(teamId).catch(() => null),
      fetchMemberCounts(teamId).catch(() => null),
      getTeamUnpaidTotal({ teamId }).catch(() => null),
    ]);
    if (detailRes?.success && detailRes.data) {
      setGroupNames((detailRes.data.groups ?? []).map((g) => g.name));
    }
    if (memberCounts) setCounts(memberCounts);
    setUnpaidCount(unpaidRes?.success && unpaidRes.data ? unpaidRes.data.count : 0);
  }, [teamId]);

  useEffect(() => {
    let cancelled = false;
    void load().finally(() => {
      if (!cancelled) onLoaded();
    });
    return () => {
      cancelled = true;
    };
    // onLoaded 는 부모의 setState 래퍼라 참조가 바뀌어도 재실행할 이유가 없다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  useRefreshSubscription(REFRESH_KEYS.TEAM, () => {
    void load();
  });
  useRefreshSubscription(REFRESH_KEYS.ROSTER, () => {
    void load();
  });

  // 히어로 인원 — 멤버 집계가 실패하면 목록 응답의 roster 수로 폴백
  const players = counts?.players ?? team._count?.roster ?? 0;
  const staff = counts ? counts.head + counts.coach : 0;

  const resolvedLogo = resolveImageSrc(team.logoUrl);
  const showLogo = !!resolvedLogo && resolvedLogo !== brokenLogo;

  const pending = team.pendingApplications ?? 0;

  // 처리 필요 — 건수가 있는 항목만. 승인 대기 → 승인 페이지, 미수금 → 인별 미수금.
  const todos = [
    ...(pending > 0
      ? [{
          key: "pending",
          text: MESSAGES.team.homeTodoPending(pending),
          aria: MESSAGES.team.pendingHandleAria(teamName),
          href: "/director-approvals",
        }]
      : []),
    ...(unpaidCount > 0
      ? [{
          key: "unpaid",
          text: MESSAGES.team.homeTodoUnpaid(unpaidCount),
          aria: MESSAGES.team.homeTodoUnpaid(unpaidCount),
          href: "/director-payments/unpaid",
        }]
      : []),
  ];

  const next = useMemo(() => {
    if (!team.nextEvent) return null;
    const isMatch =
      team.nextEvent.eventType === "tournament" || team.nextEvent.eventType === "friendly";
    return {
      isMatch,
      label: isMatch ? MESSAGES.team.homeEventMatch : MESSAGES.team.homeEventPractice,
      date: formatNextEventDate(team.nextEvent.startAt),
      time: formatNextEventTime(team.nextEvent.startAt),
      place: team.nextEvent.location ?? team.nextEvent.title,
      urgent: team.nextEvent.isUrgent,
    };
  }, [team.nextEvent]);

  type MenuItem = { key: string; icon: string; label: string; meta: string; href: string };
  // 운영 = 자주 하는 일 / 구성 = 가끔 바꾸는 것. 팀 정보는 히어로 탭으로 진입.
  const opsMenu: MenuItem[] = [
    {
      key: "notices",
      icon: "campaign",
      label: MESSAGES.team.homeMenuNotices,
      meta: MESSAGES.team.homeMenuNoticesMeta,
      href: "/director-notices",
    },
    {
      key: "settlement",
      icon: "receipt_long",
      label: MESSAGES.team.homeMenuSettlement,
      meta: MESSAGES.team.homeMenuSettlementMeta,
      href: "/director-payments",
    },
  ];
  const setupMenu: MenuItem[] = [
    {
      key: "roster",
      icon: "badge",
      label: MESSAGES.team.homeMenuRoster,
      meta: MESSAGES.team.homeMenuRosterMeta(players),
      href: "/director-members",
    },
    {
      key: "staff",
      icon: "sports",
      label: MESSAGES.team.homeMenuStaff,
      meta: MESSAGES.team.homeMenuStaffMeta(counts?.head ?? 0, counts?.coach ?? 0),
      href: "/director-coaches",
    },
    {
      key: "groups",
      icon: "folder_open",
      label: MESSAGES.team.homeMenuGroups,
      meta: groupNames.length > 0 ? groupNames.join(" · ") : MESSAGES.team.homeMenuGroupsEmpty,
      href: `/team/${teamId}/groups`,
    },
  ];

  return (
    <div className="flex flex-col" aria-label={MESSAGES.team.homeAria(teamName)}>
      {/* ─── 히어로 — /team/[id] 상세의 네이비 밴드와 동일 규격. 전체가 팀 정보 상세 진입 버튼 ─── */}
      <section className="bg-it-blue-800 dark:bg-it-blue-950 text-white">
        <button
          type="button"
          onClick={() => navigate(`/team/${teamId}`)}
          aria-label={MESSAGES.team.homeHeroAria(teamName)}
          className="flex w-full items-center gap-4 px-5 pt-6 pb-7 text-left transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/60 active:brightness-95 motion-reduce:transition-none"
        >
          <div className="flex size-16 shrink-0 items-center justify-center rounded-w-2xl bg-white dark:bg-it-surface">
            {showLogo ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={resolvedLogo}
                alt=""
                onError={() => setBrokenLogo(resolvedLogo!)}
                className="size-full rounded-w-2xl object-cover"
              />
            ) : (
              <Icon
                name="sports_hockey"
                aria-hidden="true"
                className="text-[30px] text-it-blue-500"
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-w-h2 font-extrabold tracking-[-0.025em] text-white">
              {teamName}
            </h2>
            <p className="mt-1 truncate text-card-body font-bold tabular-nums tracking-tight text-white/95">
              {MESSAGES.team.homeHeroCounts(players, staff)}
            </p>
          </div>
          <Icon
            name="chevron_right"
            className="shrink-0 text-[22px] text-white/70"
            aria-hidden="true"
          />
        </button>
      </section>

      {/* ─── 처리 필요 — 승인 대기·미수금 모두 0건이면 섹션째 미노출 ─── */}
      {todos.length > 0 && (
        <>
          <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
          <section className="bg-it-surface dark:bg-it-blue-950 pb-2" aria-label={MESSAGES.team.homeTodoSection}>
            <SectionTitle title={MESSAGES.team.homeTodoSection} />
            <ul className="flex flex-col" role="list">
              {todos.map((t, i) => (
                <li
                  key={t.key}
                  className={cn(
                    "flex items-center gap-2.5 px-5 py-2.5",
                    i > 0 && "border-t border-it-line dark:border-it-blue-900",
                  )}
                >
                  <span
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-w-pill bg-flame-100 text-card-meta font-extrabold text-flame-500 dark:bg-flame-500/15"
                    aria-hidden="true"
                  >
                    !
                  </span>
                  <span className="flex-1 text-card-body font-bold text-it-ink-700 dark:text-it-ink-200">
                    {t.text}
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate(t.href)}
                    aria-label={t.aria}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-card-meta font-bold text-it-blue-500 transition-colors hover:bg-it-blue-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 active:brightness-95 motion-reduce:transition-none"
                  >
                    {MESSAGES.team.pendingHandleLabel}
                    <Icon name="arrow_forward" className="text-[14px]" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {/* ─── 다음 일정 — 예정 일정이 있을 때만 ─── */}
      {next && (
        <>
          <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
          <section className="bg-it-surface dark:bg-it-blue-950" aria-label={MESSAGES.team.homeNextSection}>
            <SectionTitle
              title={MESSAGES.team.homeNextSection}
              action={{ label: MESSAGES.team.homeNextViewAll, onClick: () => navigate("/director-schedules") }}
            />
            <div className="flex items-center gap-2.5 px-5 pb-4 pt-2">
              <div
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-[10px]",
                  next.urgent
                    ? "bg-it-blue-500 text-white"
                    : "bg-it-fill text-it-ink-700 dark:bg-it-blue-900/40 dark:text-it-ink-400",
                )}
                aria-hidden="true"
              >
                <Icon name="calendar_today" className="text-[14px]" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-card-meta font-extrabold",
                      next.isMatch
                        ? "bg-flame-100 text-flame-500 dark:bg-flame-500/15"
                        : "bg-it-blue-500/10 text-it-blue-500",
                    )}
                  >
                    {next.label}
                  </span>
                  <span className="text-card-meta font-bold tabular-nums text-it-ink-800 dark:text-white">
                    {next.date} {next.time}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-card-meta text-it-ink-500 dark:text-it-ink-400">
                  {next.place}
                </div>
              </div>
              {next.urgent && (
                <span className="shrink-0 rounded-md bg-it-blue-500 px-2 py-1 text-card-meta font-extrabold tracking-[0.02em] text-white">
                  {MESSAGES.team.homeNextToday}
                </span>
              )}
            </div>
          </section>
        </>
      )}

      {/* ─── 운영 / 구성 메뉴 — hairline 행 (세로 구분선 금지 RULE-D04) ─── */}
      <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
      <MenuSection title={MESSAGES.team.homeOpsSection} items={opsMenu} onSelect={navigate} />
      <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
      <MenuSection title={MESSAGES.team.homeSetupSection} items={setupMenu} onSelect={navigate} />
    </div>
  );
}

function MenuSection({
  title,
  items,
  onSelect,
}: {
  title: string;
  items: ReadonlyArray<{ key: string; icon: string; label: string; meta: string; href: string }>;
  onSelect: (href: string) => void;
}) {
  return (
    <section className="bg-it-surface dark:bg-it-blue-950 pb-2" aria-label={title}>
      <SectionTitle title={title} />
      <ul className="flex flex-col" role="list">
        {items.map((item, i) => (
          <li
            key={item.key}
            className={cn(i > 0 && "border-t border-it-line dark:border-it-blue-900")}
          >
            <button
              type="button"
              onClick={() => onSelect(item.href)}
              className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-it-fill focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-it-blue-500/40 active:brightness-95 motion-reduce:transition-none dark:hover:bg-it-blue-900/40"
              aria-label={item.label}
            >
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-w-md bg-it-blue-50 text-it-blue-500 dark:bg-it-blue-500/15"
                aria-hidden="true"
              >
                <Icon name={item.icon} className="text-[20px]" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-card-body font-extrabold tracking-[-0.01em] text-it-ink-800 dark:text-white">
                  {item.label}
                </span>
                <span className="mt-0.5 block truncate text-card-meta font-semibold tabular-nums text-it-ink-500 dark:text-it-ink-400">
                  {item.meta}
                </span>
              </span>
              <Icon
                name="chevron_right"
                className="shrink-0 text-[20px] text-it-ink-300 dark:text-it-ink-400"
                aria-hidden="true"
              />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex items-center gap-2 px-5 pb-1 pt-4">
      <span className="inline-block h-[14px] w-[3px] rounded-[2px] bg-it-blue-500" aria-hidden="true" />
      <h3 className="text-card-body font-extrabold tracking-tight text-it-ink-800 dark:text-white">
        {title}
      </h3>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="ml-auto text-card-meta font-bold text-it-blue-500 transition-colors hover:text-it-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 motion-reduce:transition-none"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
