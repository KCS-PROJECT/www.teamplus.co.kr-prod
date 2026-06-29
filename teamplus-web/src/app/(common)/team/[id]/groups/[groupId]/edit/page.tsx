"use client";

/**
 * /team/[id]/groups/[groupId]/edit — 하위그룹 수정 페이지
 *
 * 폼: 그룹명 / 연령 / 회원 선택
 * - 기존 그룹 정보를 GET /api/v1/team-groups/:id 로 로드 (멤버 포함)
 * - PUT /api/v1/team-groups/:id 로 일괄 저장 (memberIds 전체 교체)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { Icon } from "@/components/ui/Icon";
import { useNativeUI } from '@/hooks/useNativeUI';
import { useToast } from "@/components/ui/Toast";
import { usePageReady } from '@/hooks/usePageReady';
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { cn } from "@/lib/utils";
import { MESSAGES } from "@/lib/messages";
import { isTeamManager } from "@/lib/team-roles";
import {
  genderLabel,
  teamGroupService,
  type EligibleMemberRow,
} from "@/services/team-group.service";
import { useDateTime } from "@/hooks/useDateTime";

export default function TeamGroupEditPage() {
  // 공통 AppBar 사용 — Flutter 네이티브 AppBar 비활성화 (중복 헤더 방지)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });


  const params = useParams<{ id: string; groupId: string }>();
  const teamId = params?.id;
  const groupId = params?.groupId;
  const router = useRouter();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useSessionAuth();
  const canManage = isTeamManager(user);

  const [name, setName] = useState("");
  // [2026-06-05] 연령대(U8~U12) → 참가 대상 출생연도 문자열(예: "2016").
  const [ageGroup, setAgeGroup] = useState<string>("");
  const [members, setMembers] = useState<EligibleMemberRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // [2026-06-05] 진입 시점 그룹 멤버 ID — 리스트 우선 정렬 기준(체크 토글 시 점프 방지).
  const [initialMemberIds, setInitialMemberIds] = useState<Set<string>>(
    new Set(),
  );
  const [search, setSearch] = useState("");
  const [teamName, setTeamName] = useState<string>("");
  // [2026-06-05] 회원 선택 연령 필터 — U8~U12 칩 → 출생연도 칩.
  const [ageFilter, setAgeFilter] = useState<"all" | number>("all");

  // 출생연도 산출 기준 연도 (서버 Asia/Seoul) + 선택 가능 출생연도(최신~12세).
  const { year: serverYear } = useDateTime();
  const currentYear = useMemo(() => {
    const y = Number(serverYear);
    return Number.isFinite(y) && y > 1900 ? y : 0;
  }, [serverYear]);
  const selectableBirthYears = useMemo(() => {
    if (!currentYear) return [];
    const ys: number[] = [];
    for (let y = currentYear - 6; y >= currentYear - 12; y -= 1) ys.push(y);
    return ys;
  }, [currentYear]);

  const [loading, setLoading] = useState(true);


  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF

  usePageReady(!loading);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; server?: string }>({});

  // 권한 가드
  useEffect(() => {
    if (!authLoading && user && !canManage) {
      toast.error(MESSAGES.team.permissionDenied);
      router.replace(`/team/${teamId}/groups`);
    }
  }, [authLoading, user, canManage, router, teamId, toast]);

  // 초기 로드: 그룹 + 멤버 후보
  const loadAll = useCallback(async () => {
    if (!teamId || !groupId) return;
    setLoading(true);
    try {
      const [detail, eligible] = await Promise.all([
        teamGroupService.findById(groupId),
        teamGroupService.listEligibleMembers(teamId),
      ]);
      setName(detail.name);
      // 대상 설명(자유 텍스트) — 저장값 그대로 prefill (레거시 U8~U12·출생연도 포함).
      setAgeGroup(detail.ageGroup ?? "");
      setTeamName(detail.teamName ?? "");
      const groupMemberIds = new Set(detail.members.map((m) => m.memberId));
      setSelectedIds(groupMemberIds);
      setInitialMemberIds(groupMemberIds);
      // [2026-06-05] 그룹에 지정된 멤버가 eligible 후보에 없으면 합쳐 리스트에 항상 노출.
      const eligibleIds = new Set(eligible.map((m) => m.memberId));
      const missing: EligibleMemberRow[] = detail.members
        .filter((m) => !eligibleIds.has(m.memberId))
        .map((m) => ({
          memberId: m.memberId,
          playerName: m.playerName,
          gender: m.gender,
          playerAge: m.playerAge,
          roleInTeam: null,
          userType: null,
        }));
      setMembers([...eligible, ...missing]);
    } catch (e) {
      setErrors({
        server: e instanceof Error ? e.message : MESSAGES.common.unknown,
      });
    } finally {
      setLoading(false);
    }
  }, [teamId, groupId]);

  useEffect(() => {
    if (canManage) void loadAll();
  }, [canManage, loadAll]);

  // [2026-06-05] playerAge(한국나이) → 출생연도. 한국나이 = currentYear - birthYear + 1.
  const birthYearOf = (m: EligibleMemberRow): number | null => {
    const age = m.playerAge;
    if (typeof age !== "number" || age < 0 || !currentYear) return null;
    return currentYear - age + 1;
  };

  const counts = useMemo(() => {
    const map = new Map<number, number>();
    for (const m of members) {
      const y = birthYearOf(m);
      if (y != null) map.set(y, (map.get(y) ?? 0) + 1);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, currentYear]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = members.filter((m) => {
      if (q && !m.playerName.toLowerCase().includes(q)) return false;
      if (ageFilter === "all") return true;
      return birthYearOf(m) === ageFilter;
    });
    // [2026-06-05] 그룹에 지정된 멤버(initialMemberIds)를 리스트 상단에 우선 노출.
    return [...list].sort((a, b) => {
      const aRank = initialMemberIds.has(a.memberId) ? 0 : 1;
      const bRank = initialMemberIds.has(b.memberId) ? 0 : 1;
      return aRank - bRank;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, search, ageFilter, currentYear, initialMemberIds]);

  // 카드 우측에 표시할 출생연도 라벨 (chip).
  const ageLabel = (m: EligibleMemberRow): string => {
    const y = birthYearOf(m);
    return y != null ? `${y}년생` : "";
  };

  const toggleMember = (memberId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupId) return;

    const trimmed = name.trim();
    if (!trimmed) {
      setErrors({ name: MESSAGES.team.groupNameRequired });
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      await teamGroupService.update(groupId, {
        name: trimmed,
        ageGroup: ageGroup || undefined,
        memberIds: Array.from(selectedIds),
      });
      toast.success(MESSAGES.save.success);
      router.replace(`/team/${teamId}/groups`);
    } catch (err) {
      const message = err instanceof Error ? err.message : MESSAGES.save.fail;
      setErrors({ server: message });
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  // [수정 2026-05-14] 로딩 중 return null 대신 AppBar 가 있는 빈 컨테이너 반환 →
  //  네이티브 환경에서 헤더 영역이 비어 보이는 문제 방지.
  if (loading || authLoading) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title="하위그룹 수정" onBack={() => router.back()} forceNative />
        <main className="flex-1 bg-wbg dark:bg-rink-900" />
      </MobileContainer>
    );
  }

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="하위그룹 수정" onBack={() => router.back()} forceNative />

      {/* [수정 2026-04-30] 레이아웃 재구조화 — MobileContainer 가 fixed+overflow-hidden 이라
          페이지 자체 스크롤이 막혀 있었음. flex-col + 내부 scroll 영역 + shrink-0 액션바 패턴으로 정정.
          1) form 은 flex-1 flex-col 로 남은 높이 점유
          2) 입력 영역(div) 은 flex-1 overflow-y-auto — 자연 스크롤
          3) 액션바는 shrink-0 자식으로 자연 위치 (fixed/border-t 제거 — 실선 노출 문제 해결) */}
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
        <div
          className="flex-1 overflow-y-auto overscroll-contain bg-it-canvas dark:bg-puck hide-scrollbar"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {/* 그룹 기본 정보 — flat 흰 섹션 */}
          <section className="bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-6 space-y-5">
            {/* 소속 팀 (readonly) */}
            <div>
              <label className="mb-2 block text-[14px] font-extrabold tracking-[-0.01em] text-it-ink-800 dark:text-white">
                소속 팀
              </label>
              <div className="flex h-12 items-center gap-2.5 rounded-w-md bg-it-fill dark:bg-it-blue-900/40 border-[1.5px] border-it-line-strong dark:border-it-blue-900 px-4 text-[15px] font-bold text-it-ink-700 dark:text-it-ink-200">
                <span className="size-[7px] rounded-w-pill bg-it-blue-500" aria-hidden="true" />
                {teamName || "—"}
              </div>
            </div>

            {/* 하위그룹 이름 */}
            <div>
              <label
                htmlFor="group-name"
                className="mb-2 flex items-center gap-1 text-[14px] font-extrabold tracking-[-0.01em] text-it-ink-800 dark:text-white"
              >
                {MESSAGES.team.groupNameLabel}
                <span className="text-it-red-500">*</span>
              </label>
              <input
                id="group-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={MESSAGES.team.groupNamePlaceholder}
                className="h-[50px] w-full rounded-w-md border-[1.5px] border-it-line-strong dark:border-it-blue-900 bg-it-fill dark:bg-it-blue-950 px-4 text-[15.5px] font-semibold text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-it-ink-300 outline-none transition-colors duration-150 ease-ios motion-reduce:transition-none focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20"
              />
              {errors.name && (
                <p className="mt-1.5 text-[12px] font-semibold text-it-red-500">{errors.name}</p>
              )}
            </div>

            {/* 대상 설명 (선택 · 자유 텍스트) */}
            <div>
              <label
                htmlFor="group-age"
                className="mb-2 block text-[14px] font-extrabold tracking-[-0.01em] text-it-ink-800 dark:text-white"
              >
                {MESSAGES.team.groupAgeGroupLabel}
              </label>
              <input
                id="group-age"
                type="text"
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value)}
                placeholder={MESSAGES.team.groupAgeGroupPlaceholder}
                maxLength={30}
                className="h-[50px] w-full rounded-w-md border-[1.5px] border-it-line-strong dark:border-it-blue-900 bg-it-fill dark:bg-it-blue-950 px-4 text-[15.5px] font-semibold text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-it-ink-300 outline-none transition-colors duration-150 ease-ios motion-reduce:transition-none focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20"
              />
              <p className="mt-1.5 text-[12px] font-medium text-it-ink-500 dark:text-it-ink-300">
                {MESSAGES.team.groupAgeGroupHelper}
              </p>
            </div>
          </section>

          {/* flat 섹션 사이 8px 회색 갭 */}
          <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

          {/* 회원 선택 — flat 흰 섹션 */}
          <section className="bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-7">
            <div className="mb-3 flex items-center justify-between">
              <label className="text-[14px] font-extrabold tracking-[-0.01em] text-it-ink-800 dark:text-white">
                {MESSAGES.team.groupMembersLabel}
              </label>
              <span className="text-[13px] font-medium text-it-ink-500 dark:text-it-ink-300 tabular-nums">
                선택 {selectedIds.size}명 / 전체 {members.length}명
              </span>
            </div>

            {/* [2026-06-05] 회원 선택 연령 필터 칩 — U8~U12 → 출생연도(년생) 동적 칩. */}
            <div
              className="mb-3 flex flex-wrap gap-2"
              role="tablist"
              aria-label="출생연도 필터"
            >
              {[
                {
                  key: "all" as const,
                  label: MESSAGES.team.groupMembersFilterAll,
                  count: members.length,
                },
                ...selectableBirthYears.map((y) => ({
                  key: y,
                  label: `${y}년생`,
                  count: counts.get(y) ?? 0,
                })),
              ].map((tab) => {
                const active = ageFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setAgeFilter(tab.key)}
                    className={cn(
                      "inline-flex h-9 items-center gap-1 rounded-w-pill border-[1.5px] px-4 text-[14px] font-bold transition-colors duration-150 ease-ios motion-reduce:transition-none active:brightness-95",
                      active
                        ? "border-it-blue-500 bg-it-blue-500 text-white"
                        : "border-it-line-strong bg-it-surface text-it-ink-600 hover:bg-it-fill dark:border-it-blue-900 dark:bg-it-blue-950 dark:text-it-ink-200 dark:hover:bg-it-blue-900",
                    )}
                  >
                    {tab.label}
                    <span
                      className={cn(
                        "tabular-nums",
                        active ? "text-white/80" : "text-it-ink-400 dark:text-it-ink-300",
                      )}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="relative mb-3">
              <Icon
                name="search"
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[20px] text-it-ink-400 dark:text-it-ink-300"
                aria-hidden="true"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="이름으로 검색"
                aria-label="회원 이름 검색"
                className="h-12 w-full rounded-w-md border-[1.5px] border-it-line-strong dark:border-it-blue-900 bg-it-fill dark:bg-it-blue-950 pl-11 pr-4 text-[15px] font-semibold text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-it-ink-300 outline-none transition-colors duration-150 ease-ios motion-reduce:transition-none focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20"
              />
            </div>

            {filteredMembers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <p className="text-center text-[14px] font-medium text-it-ink-700 dark:text-it-ink-300">
                  {/* [수정 2026-05-18 W2.B #8] 연령 필터 적용 시 안내 메시지 분기 */}
                  {ageFilter !== "all"
                    ? MESSAGES.team.groupMembersFilterEmpty
                    : MESSAGES.team.groupMembersEmpty}
                </p>
              </div>
            ) : (
              // hairline 행 (카드 박스 제거) — 페이지 자연 스크롤에 위임.
              <div className="flex flex-col">
                {filteredMembers.map((m, idx) => {
                  const checked = selectedIds.has(m.memberId);
                  const isLast = idx === filteredMembers.length - 1;
                  return (
                    <label
                      key={m.memberId}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 py-3 min-h-[56px] transition-colors motion-reduce:transition-none",
                        !isLast && "border-b border-it-line dark:border-it-blue-900",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMember(m.memberId)}
                        className="size-5 shrink-0 rounded border-it-line-strong text-it-blue-500 focus:ring-it-blue-500"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-[15px] font-bold text-it-ink-800 dark:text-white">
                            {m.playerName}
                          </p>
                          {/* [수정 2026-05-18 W2.B #8] 역할 라벨 → 연령 라벨 (U8~U12) */}
                          {ageLabel(m) && (
                            <span className="shrink-0 rounded-w-md bg-it-blue-50 px-1.5 py-0.5 text-[12px] font-bold tabular-nums text-it-blue-500 dark:bg-it-blue-500/15 dark:text-it-blue-300">
                              {ageLabel(m)}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[13px] font-medium text-it-ink-500 dark:text-it-ink-300">
                          <span className="inline-block min-w-[24px]">
                            {genderLabel(m.gender)}
                          </span>
                          <span className="mx-2 text-it-ink-300 dark:text-it-ink-400">·</span>
                          <span className="tabular-nums">{m.playerAge}세</span>
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {errors.server && (
              <div className="mt-4 rounded-w-md border-[1.5px] border-it-red-200 bg-it-red-50 px-4 py-3 text-[14px] font-semibold text-it-red-600 dark:border-it-red-500/40 dark:bg-it-red-500/10 dark:text-it-red-300">
                {errors.server}
              </div>
            )}
          </section>
        </div>

        {/* [수정 2026-04-30] 액션 버튼 — fixed/border-t 제거.
            shrink-0 자식으로 form flex-col 끝에 자연 배치되어 입력 영역과 시각적 경계가 자동으로 형성된다. */}
        <div className="shrink-0 border-t border-it-line dark:border-it-blue-900 bg-it-surface dark:bg-it-blue-950 px-5 py-3">
          <div className="mx-auto flex max-w-md gap-2.5">
            <button
              type="button"
              onClick={() => router.back()}
              disabled={submitting}
              className="h-[50px] flex-1 rounded-w-md border-[1.5px] border-it-line-strong dark:border-it-blue-900 bg-it-surface dark:bg-it-blue-950 text-[15px] font-extrabold text-it-ink-700 dark:text-it-ink-200 transition-colors motion-reduce:transition-none hover:bg-it-fill dark:hover:bg-it-blue-900 active:brightness-95 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="h-[50px] flex-[2] rounded-w-md bg-it-blue-500 text-[15px] font-extrabold text-white transition-colors duration-150 ease-ios motion-reduce:transition-none hover:bg-it-blue-600 active:brightness-95 disabled:bg-it-line-strong dark:disabled:bg-it-blue-900 disabled:cursor-not-allowed"
            >
              {submitting ? MESSAGES.common.saving : MESSAGES.common.save}
            </button>
          </div>
        </div>
      </form>
    </MobileContainer>
  );
}
