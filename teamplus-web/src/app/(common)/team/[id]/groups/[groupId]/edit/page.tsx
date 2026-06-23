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
import { useNativeUI } from '@/hooks/useNativeUI';
import { useToast } from "@/components/ui/Toast";
import { usePageReady } from '@/hooks/usePageReady';
import { useSessionAuth } from "@/hooks/useSessionAuth";
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
      // [2026-06-05] 레거시 U8~U12 값은 비워서 selectbox 에 노출하지 않음 (출생연도만 표시).
      const ag = detail.ageGroup ?? "";
      setAgeGroup(/^\d{4}$/.test(ag) ? ag : "");
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
          className="flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-4 space-y-5"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {/* 소속 팀 (readonly) */}
          <div>
            <label className="block text-w-small font-bold text-wtext-2 dark:text-rink-100 mb-1.5">
              소속 팀
            </label>
            <div className="h-12 px-4 flex items-center rounded-lg bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 text-w-small">
              {teamName || "—"}
            </div>
          </div>

          {/* 하위그룹 이름 */}
          <div>
            <label
              htmlFor="group-name"
              className="block text-w-small font-bold text-wtext-2 dark:text-rink-100 mb-1.5"
            >
              {MESSAGES.team.groupNameLabel}{" "}
              <span className="text-red-500">*</span>
            </label>
            <input
              id="group-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={MESSAGES.team.groupNamePlaceholder}
              className="w-full h-12 px-4 rounded-lg border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-wtext-1 dark:text-white text-w-small focus:outline-none focus:border-ice-500"
            />
            {errors.name && (
              <p className="mt-1 text-w-caption text-red-600">{errors.name}</p>
            )}
          </div>

          {/* 연령 */}
          <div>
            <label
              htmlFor="group-age"
              className="block text-w-small font-bold text-wtext-2 dark:text-rink-100 mb-1.5"
            >
              {MESSAGES.team.groupAgeGroupLabel}
            </label>
            <select
              id="group-age"
              value={ageGroup}
              onChange={(e) => setAgeGroup(e.target.value)}
              className="w-full h-12 px-4 rounded-lg border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-wtext-1 dark:text-white text-w-small focus:outline-none focus:border-ice-500"
            >
              <option value="">{MESSAGES.team.groupAgeGroupPlaceholder}</option>
              {/* [2026-06-05] 범위 밖 출생연도만 함께 노출. 레거시 U8~U12 는 prefill 에서 제외됨. */}
              {ageGroup &&
                /^\d{4}$/.test(ageGroup) &&
                !selectableBirthYears.some((y) => String(y) === ageGroup) && (
                  <option value={ageGroup}>{ageGroup}년생</option>
                )}
              {selectableBirthYears.map((y) => (
                <option key={y} value={String(y)}>
                  {y}년생
                </option>
              ))}
            </select>
          </div>

          {/* 회원 선택 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-w-small font-bold text-wtext-2 dark:text-rink-100">
                {MESSAGES.team.groupMembersLabel}
              </label>
              <span className="text-w-caption text-wtext-3 dark:text-rink-300">
                선택 {selectedIds.size}명 / 전체 {members.length}명
              </span>
            </div>

            {/* [2026-06-05] 회원 선택 연령 필터 칩 — U8~U12 → 출생연도(년생) 동적 칩. */}
            <div
              className="flex flex-wrap gap-2 mb-2"
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
                    className={`h-9 px-3 rounded-w-pill text-w-caption font-bold transition-colors motion-reduce:transition-none ${
                      active
                        ? "bg-blue-700 text-white"
                        : "bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 hover:bg-wline dark:hover:bg-rink-500"
                    }`}
                  >
                    {tab.label}
                    <span
                      className={`ml-1 tabular-nums ${active ? "text-white/80" : "text-wtext-3 dark:text-rink-300"}`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름으로 검색"
              className="w-full h-11 px-4 mb-2 rounded-lg border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-wtext-1 dark:text-white text-w-small focus:outline-none focus:border-ice-500"
            />

            {filteredMembers.length === 0 ? (
              <div className="rounded-lg border border-wline bg-wbg p-6 text-center dark:border-rink-700 dark:bg-rink-800/50">
                <p className="text-w-small text-wtext-3 dark:text-rink-300">
                  {/* [수정 2026-05-18 W2.B #8] 연령 필터 적용 시 안내 메시지 분기 */}
                  {ageFilter !== "all"
                    ? MESSAGES.team.groupMembersFilterEmpty
                    : MESSAGES.team.groupMembersEmpty}
                </p>
              </div>
            ) : (
              // [수정 2026-04-30] 내부 스크롤 제거 — ul 박스 바닥이 fixed 액션바에 가려져 마지막 항목이
              // 잘려보이던 문제. 페이지 자연 스크롤 + form pb-32 (128px = 액션바 높이) 로 해결.
              <ul className="rounded-lg border border-wline dark:border-rink-700 divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-rink-800">
                {filteredMembers.map((m) => {
                  const checked = selectedIds.has(m.memberId);
                  return (
                    <li key={m.memberId}>
                      <label
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                          checked
                            ? "bg-blue-50 dark:bg-blue-900/20"
                            : "hover:bg-wbg dark:hover:bg-rink-700/50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMember(m.memberId)}
                          className="w-5 h-5 text-ice-500 rounded border-wline focus:ring-ice-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-w-small font-semibold text-wtext-1 dark:text-white truncate">
                              {m.playerName}
                            </p>
                            {/* [수정 2026-05-18 W2.B #8] 역할 라벨 → 연령 라벨 (U8~U12) */}
                            {ageLabel(m) && (
                              <span className="shrink-0 text-w-caption font-bold px-1.5 py-0.5 rounded bg-ice-500/10 text-ice-500 tabular-nums">
                                {ageLabel(m)}
                              </span>
                            )}
                          </div>
                          <p className="text-w-caption text-wtext-3 dark:text-rink-300 mt-0.5">
                            <span className="inline-block min-w-[24px]">
                              {genderLabel(m.gender)}
                            </span>
                            <span className="mx-2 text-wtext-4 dark:text-rink-500">
                              ·
                            </span>
                            <span>{m.playerAge}세</span>
                          </p>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {errors.server && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-w-small text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
              {errors.server}
            </div>
          )}
        </div>

        {/* [수정 2026-04-30] 액션 버튼 — fixed/border-t 제거.
            shrink-0 자식으로 form flex-col 끝에 자연 배치되어 입력 영역과 시각적 경계가 자동으로 형성된다. */}
        <div className="shrink-0 bg-white dark:bg-rink-900 px-4 py-3">
          <div className="max-w-md mx-auto flex gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              disabled={submitting}
              className="flex-1 h-12 rounded-lg border border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100 font-bold text-w-small disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="flex-[2] h-12 rounded-lg bg-blue-700 text-white font-bold text-w-small hover:bg-blue-800 transition-colors disabled:opacity-50"
            >
              {submitting ? MESSAGES.common.saving : MESSAGES.common.save}
            </button>
          </div>
        </div>
      </form>
    </MobileContainer>
  );
}
