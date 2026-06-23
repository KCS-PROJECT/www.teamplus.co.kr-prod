"use client";

/**
 * /team/[id]/groups/create — 팀 하위 그룹 생성 (감독·코치 전용)
 *
 * 폼:
 *  - 그룹명 (필수)
 *  - 연령대 (U8 ~ U12 selectbox)
 *  - 회원 선택 (실제 DB의 TeamMember 목록 — 이름/성별/나이 표시)
 *
 * 회원 데이터는 GET /teams/:teamId/eligible-members 에서 실시간 조회.
 * 목/하드코딩 없음.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { useNativeUI } from '@/hooks/useNativeUI';
import { useToast } from "@/components/ui/Toast";
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { MESSAGES } from "@/lib/messages";
import { isTeamManager } from "@/lib/team-roles";
import { api } from "@/services/api-client";
import { usePageReady } from '@/hooks/usePageReady';
import {
  genderLabel,
  teamGroupService,
  type EligibleMemberRow,
} from "@/services/team-group.service";
import { useDateTime } from "@/hooks/useDateTime";

export default function TeamGroupCreatePage() {
  // 공통 AppBar 사용 — Flutter 네이티브 AppBar 비활성화 (중복 헤더 방지)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });


  const params = useParams<{ id: string }>();
  const teamId = params?.id;
  const router = useRouter();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useSessionAuth();
  const canManage = isTeamManager(user);

  const [name, setName] = useState("");
  // [2026-06-05] 연령대(U8~U12) → 참가 대상 출생연도 문자열(예: "2016").
  const [ageGroup, setAgeGroup] = useState<string>("");
  const [members, setMembers] = useState<EligibleMemberRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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

  const [membersLoading, setMembersLoading] = useState(true);

  // v18 (2026-05-20, audit §4 C #3): authLoading + membersLoading 둘 다 종료 후 ready.
  // 이중 로더 race + 권한 가드 redirect 갭 모두 차단.
  usePageReady(!authLoading && !membersLoading);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; server?: string }>({});

  // ─── 권한 가드
  useEffect(() => {
    if (!authLoading && user && !canManage) {
      toast.error(MESSAGES.team.permissionDenied);
      router.replace(`/team/${teamId}`);
    }
  }, [authLoading, user, canManage, router, teamId, toast]);

  // ─── 회원 후보 목록 (실 DB)
  const loadMembers = useCallback(async () => {
    if (!teamId) return;
    setMembersLoading(true);
    try {
      const data = await teamGroupService.listEligibleMembers(teamId);
      setMembers(data);
    } catch (e) {
      setErrors((prev) => ({
        ...prev,
        server: e instanceof Error ? e.message : MESSAGES.common.unknown,
      }));
    } finally {
      setMembersLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (canManage) void loadMembers();
  }, [canManage, loadMembers]);

  // ─── 소속 팀 이름 (readonly 표시용)
  useEffect(() => {
    if (!teamId) return;
    void (async () => {
      try {
        const res = await api.get<{ name: string }>(`/teams/${teamId}`);
        if (res.success && res.data?.name) setTeamName(res.data.name);
      } catch {
        // 팀 조회 실패는 무시 (헤더에 표시 안 됨)
      }
    })();
  }, [teamId]);

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
    return members.filter((m) => {
      if (q && !m.playerName.toLowerCase().includes(q)) return false;
      if (ageFilter === "all") return true;
      return birthYearOf(m) === ageFilter;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, search, ageFilter, currentYear]);

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
    if (!teamId) return;

    // ─── 검증
    const trimmed = name.trim();
    const newErrors: { name?: string; server?: string } = {};
    if (!trimmed) newErrors.name = MESSAGES.team.groupNameRequired;
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      await teamGroupService.create(teamId, {
        name: trimmed,
        ageGroup: ageGroup || undefined,
        memberIds: Array.from(selectedIds),
      });
      toast.success(MESSAGES.team.groupCreateSuccess);
      router.replace(`/team/${teamId}/groups`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : MESSAGES.team.groupCreateFailure;
      setErrors({ server: message });
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return null;
  }

  // [수정 2026-05-14]
  //  A1) AppBar 뒤로가기 무한 루프 — onBack 이 router.push 를 호출해 history stack 에 항목이 누적되던 버그.
  //       router.back() 으로 변경 → 자연스러운 history pop.
  //  A3) BottomNav 잔상 — 액션 버튼이 `fixed bottom-0` 으로 BottomNav 와 z-index 충돌 → bg 가 BottomNav 위로
  //       비쳐 보이던 문제. groups/[groupId]/edit 와 동일한 `flex-1 flex-col min-h-0 + shrink-0 액션바`
  //       패턴으로 교체.
  //  A4) 스크롤 미동작 — MobileContainer 가 `fixed inset-0 overflow-hidden` 이고 inner shell 이
  //       `h-full min-h-0 flex flex-col` 이므로, 페이지 자체 스크롤은 자식이 `flex-1 overflow-y-auto` 일 때만
  //       활성화. 기존 form 은 fixed 액션바와 pb-32 만 있고 scroll 컨테이너가 없어 스크롤 차단.
  return (
    <MobileContainer hasBottomNav>
      <PageAppBar
        title={MESSAGES.team.groupCreateTitle}
        onBack={() => router.back()}
        forceNative
      />

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

          {/* 연령대 */}
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
            <p className="text-w-caption text-wtext-3 dark:text-rink-300 mb-2">
              {MESSAGES.team.groupMembersHelper}
            </p>

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

            {/* 검색 */}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름으로 검색"
              className="w-full h-11 px-4 mb-2 rounded-lg border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-wtext-1 dark:text-white text-w-small focus:outline-none focus:border-ice-500"
            />

            {!membersLoading && members.length === 0 && (
              <div className="rounded-lg border border-wline bg-wbg p-6 text-center dark:border-rink-700 dark:bg-rink-800/50">
                <p className="text-w-small text-wtext-3 dark:text-rink-300">
                  {MESSAGES.team.groupMembersEmpty}
                </p>
              </div>
            )}

            {/* [추가 2026-05-18 W2.B #9] 연령 필터 적용 시 빈 상태 분기 */}
            {!membersLoading &&
              members.length > 0 &&
              filteredMembers.length === 0 && (
                <div className="rounded-lg border border-wline bg-wbg p-6 text-center dark:border-rink-700 dark:bg-rink-800/50">
                  <p className="text-w-small text-wtext-3 dark:text-rink-300">
                    {MESSAGES.team.groupMembersFilterEmpty}
                  </p>
                </div>
              )}

            {!membersLoading && filteredMembers.length > 0 && (
              // [수정 2026-05-14] 내부 max-h + overflow 제거 — 페이지 자연 스크롤(상위 div) 에 위임.
              //  중첩 스크롤 컨테이너가 모바일에서 터치 스크롤을 가로채는 문제 해결.
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
                            {/* [추가 2026-05-18 W2.B #9] 연령 칩 — 하위그룹 수정 페이지와 동일 패턴 */}
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

        {/* [수정 2026-05-14] 액션 버튼 — fixed → shrink-0 자연 배치.
            BottomNav 위에 안전하게 위치하여 잔상(z-index 충돌) 해소.
            MobileContainer 의 hasBottomNav padding(60px+safe-area)이 BottomNav 영역을 보전. */}
        <div className="shrink-0 bg-white dark:bg-rink-900 border-t border-wline dark:border-rink-700 px-4 py-3">
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
              {submitting ? "생성 중…" : MESSAGES.team.groupCreateButton}
            </button>
          </div>
        </div>
      </form>
    </MobileContainer>
  );
}
