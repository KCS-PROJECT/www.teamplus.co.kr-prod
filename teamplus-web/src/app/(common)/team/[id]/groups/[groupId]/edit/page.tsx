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
import { BottomSheetSelector } from "@/components/ui/BottomSheetSelector";
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
  RESERVED_TEAM_GROUP_NAME,
  TEAM_GROUP_NAME_MAX_LENGTH,
  type EligibleMemberRow,
  type TeamCoachCandidate,
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
  // 진입 시점 그룹 이름 — 자기 이름 그대로 저장은 검증 통과.
  const [originalName, setOriginalName] = useState("");
  // 같은 팀의 다른 하위그룹 이름 — 입력 중 실시간 중복 안내용 (서버 검증이 최종 방어).
  const [otherNames, setOtherNames] = useState<string[]>([]);
  // 담당코치 (선택 입력) — "" = 지정 안 함.
  const [coachMemberId, setCoachMemberId] = useState("");
  const [coachCandidates, setCoachCandidates] = useState<TeamCoachCandidate[]>([]);
  // 진입 시점 담당코치 이름 — 후보 목록에 없는 기존 지정(역할 변경 등) 표시 폴백.
  const [prefillCoachName, setPrefillCoachName] = useState<string | null>(null);
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
  // 선택 인원 검토 모드 — 목록을 선택된 회원만 표시 (카운터 필 버튼 토글).
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  // 출생연도 필터 선택 바텀시트 열림 상태.
  const [ageSheetOpen, setAgeSheetOpen] = useState(false);
  // 담당코치 선택 바텀시트 열림 상태.
  const [coachSheetOpen, setCoachSheetOpen] = useState(false);

  // 출생연도 산출 기준 연도 (서버 Asia/Seoul).
  const { year: serverYear } = useDateTime();
  const currentYear = useMemo(() => {
    const y = Number(serverYear);
    return Number.isFinite(y) && y > 1900 ? y : 0;
  }, [serverYear]);
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
      setOriginalName(detail.name);
      setCoachMemberId(detail.coachMemberId ?? "");
      setPrefillCoachName(detail.coachName ?? null);
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
          birthDate: m.birthDate,
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

  // ─── 같은 팀의 다른 그룹 이름(실시간 중복 안내) + 담당코치 후보 로드 — 실패해도 무시, 서버 검증 폴백
  useEffect(() => {
    if (!teamId || !groupId || !canManage) return;
    let cancelled = false;
    void (async () => {
      const [list, coaches] = await Promise.all([
        teamGroupService.listByTeam(teamId).catch(() => null),
        teamGroupService.listCoachCandidates(teamId).catch(() => null),
      ]);
      if (cancelled) return;
      if (list)
        setOtherNames(list.filter((g) => g.id !== groupId).map((g) => g.name));
      if (coaches) setCoachCandidates(coaches);
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId, groupId, canManage]);

  // 입력 중 실시간 이름 검증 — 자기 이름 유지(no-op)는 통과.
  const liveNameError = useMemo(() => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === originalName.trim()) return undefined;
    if (trimmed === RESERVED_TEAM_GROUP_NAME)
      return MESSAGES.team.groupNameReserved;
    if (otherNames.some((n) => n.trim() === trimmed))
      return MESSAGES.team.groupNameDuplicate;
    return undefined;
  }, [name, originalName, otherNames]);

  // 출생연도 — birthDate(ChildProfile 우선 SoT)가 있으면 그 연도, 없으면 레거시
  // playerAge(가입 시점 스냅샷) 역산 폴백. 한국나이 = currentYear - birthYear + 1.
  const birthYearOf = (m: EligibleMemberRow): number | null => {
    const y = m.birthDate ? Number(m.birthDate.slice(0, 4)) : NaN;
    if (Number.isInteger(y) && y > 1900) return y;
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

  // 필터 옵션 — 실제 회원이 있는 출생연도만 (최신 연도 우선).
  const birthYearOptions = useMemo(
    () => Array.from(counts.keys()).sort((a, b) => b - a),
    [counts],
  );

  // 출생연도별 선택 인원 수 — 필터 바텀시트에 선택 현황 병기용.
  const selectedCounts = useMemo(() => {
    const map = new Map<number, number>();
    for (const m of members) {
      if (!selectedIds.has(m.memberId)) continue;
      const y = birthYearOf(m);
      if (y != null) map.set(y, (map.get(y) ?? 0) + 1);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, selectedIds, currentYear]);

  // 담당코치 트리거 표시명 — 후보에 없는 기존 지정(역할 변경 등)은 prefill 이름 폴백.
  const selectedCoach = coachCandidates.find(
    (c) => c.memberId === coachMemberId,
  );
  const coachDisplayName = coachMemberId
    ? selectedCoach
      ? selectedCoach.roleInTeam === "HEAD_COACH"
        ? `${selectedCoach.name} (${MESSAGES.team.groupCoachRoleHead})`
        : selectedCoach.name
      : (prefillCoachName ?? MESSAGES.team.groupCoachLabel)
    : MESSAGES.team.groupCoachNone;

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = members.filter((m) => {
      if (showSelectedOnly && !selectedIds.has(m.memberId)) return false;
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
  }, [members, search, ageFilter, currentYear, initialMemberIds, showSelectedOnly, selectedIds]);

  // 검토 모드에서 전원 해제 시 빈 목록에 갇히지 않도록 전체 목록으로 자동 복귀.
  useEffect(() => {
    if (showSelectedOnly && selectedIds.size === 0) setShowSelectedOnly(false);
  }, [showSelectedOnly, selectedIds]);

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
    if (liveNameError) {
      setErrors({ name: liveNameError });
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      await teamGroupService.update(groupId, {
        name: trimmed,
        // 항상 전송 — "" 는 비우기(백엔드에서 null 처리)
        ageGroup: ageGroup.trim(),
        memberIds: Array.from(selectedIds),
        // 항상 전송 — "" 는 지정 해제(백엔드에서 null 처리)
        coachMemberId,
      });
      toast.success(MESSAGES.save.success);
      router.replace(`/team/${teamId}/groups`);
    } catch (err) {
      const message = err instanceof Error ? err.message : MESSAGES.save.fail;
      // 서버 중복/예약어 응답(로컬 목록 stale·동시 수정 race)은 input 아래 인라인으로 표시.
      if (
        message === MESSAGES.team.groupNameDuplicate ||
        message === MESSAGES.team.groupNameReserved
      ) {
        setErrors({ name: message });
      } else {
        setErrors({ server: message });
      }
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
                onChange={(e) => {
                  setName(e.target.value);
                  setErrors((prev) =>
                    prev.name ? { ...prev, name: undefined } : prev,
                  );
                }}
                placeholder={MESSAGES.team.groupNamePlaceholder}
                maxLength={TEAM_GROUP_NAME_MAX_LENGTH}
                className="h-[50px] w-full rounded-w-md border-[1.5px] border-it-line-strong dark:border-it-blue-900 bg-it-fill dark:bg-it-blue-950 px-4 text-[15.5px] font-semibold text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-it-ink-300 outline-none focus:outline-none transition-colors duration-150 ease-ios motion-reduce:transition-none focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20"
              />
              {(errors.name ?? liveNameError) && (
                <p className="mt-1.5 text-[12px] font-semibold text-it-red-500">
                  {errors.name ?? liveNameError}
                </p>
              )}
            </div>

            {/* 담당코치 (선택) */}
            <div>
              <label
                htmlFor="group-coach"
                className="mb-2 block text-[14px] font-extrabold tracking-[-0.01em] text-it-ink-800 dark:text-white"
              >
                {MESSAGES.team.groupCoachLabel}
              </label>
              <button
                type="button"
                id="group-coach"
                onClick={() => setCoachSheetOpen(true)}
                disabled={coachCandidates.length === 0 && !coachMemberId}
                aria-haspopup="dialog"
                className="flex h-[50px] w-full items-center justify-between rounded-w-md border-[1.5px] border-it-line-strong dark:border-it-blue-900 bg-it-fill dark:bg-it-blue-950 px-4 text-[15.5px] font-semibold text-it-ink-800 dark:text-white outline-none transition-colors duration-150 ease-ios motion-reduce:transition-none focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20 disabled:opacity-60 active:brightness-95"
              >
                <span className="truncate">{coachDisplayName}</span>
                <Icon
                  name="expand_more"
                  className="shrink-0 text-[22px] text-it-ink-400 dark:text-it-ink-300"
                  aria-hidden="true"
                />
              </button>
              <BottomSheetSelector
                isOpen={coachSheetOpen}
                title={MESSAGES.team.groupCoachSheetTitle}
                items={[
                  {
                    id: "",
                    name: MESSAGES.team.groupCoachNone,
                    selected: coachMemberId === "",
                  },
                  ...coachCandidates.map((c) => ({
                    id: c.memberId,
                    name: c.name,
                    sub:
                      c.roleInTeam === "HEAD_COACH"
                        ? MESSAGES.team.groupCoachRoleHead
                        : undefined,
                    selected: c.memberId === coachMemberId,
                  })),
                  // 기존 지정 코치가 후보에 없으면(역할 변경 등) 현재 값 표시 유지
                  ...(coachMemberId &&
                  !coachCandidates.some((c) => c.memberId === coachMemberId)
                    ? [
                        {
                          id: coachMemberId,
                          name: prefillCoachName ?? MESSAGES.team.groupCoachLabel,
                          selected: true,
                        },
                      ]
                    : []),
                ]}
                onSelect={(id) => {
                  setCoachMemberId(id);
                  setCoachSheetOpen(false);
                }}
                onClose={() => setCoachSheetOpen(false)}
              />
              <p className="mt-1.5 text-[12px] font-medium text-it-ink-500 dark:text-it-ink-300">
                {coachCandidates.length === 0
                  ? MESSAGES.team.groupCoachEmpty
                  : MESSAGES.team.groupCoachHelper}
              </p>
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
                className="h-[50px] w-full rounded-w-md border-[1.5px] border-it-line-strong dark:border-it-blue-900 bg-it-fill dark:bg-it-blue-950 px-4 text-[15.5px] font-semibold text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-it-ink-300 outline-none focus:outline-none transition-colors duration-150 ease-ios motion-reduce:transition-none focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20"
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
              {members.length === 0 ? (
                <span className="text-[13px] font-medium text-it-ink-500 dark:text-it-ink-300 tabular-nums">
                  {MESSAGES.team.groupMembersTotalCount(members.length)}
                </span>
              ) : (
                <div className="flex shrink-0 items-center rounded-w-pill bg-it-fill dark:bg-it-blue-900/40 p-0.5">
                  <button
                    type="button"
                    onClick={() => setShowSelectedOnly(false)}
                    aria-pressed={!showSelectedOnly}
                    className={cn(
                      "h-7 rounded-w-pill px-2.5 text-[13px] font-bold tabular-nums transition-colors duration-150 ease-ios motion-reduce:transition-none",
                      !showSelectedOnly
                        ? "bg-it-blue-500 text-white"
                        : "text-it-ink-500 dark:text-it-ink-300",
                    )}
                  >
                    {MESSAGES.team.groupMembersTabAll(members.length)}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSelectedOnly(true)}
                    disabled={selectedIds.size === 0}
                    aria-pressed={showSelectedOnly}
                    className={cn(
                      "h-7 rounded-w-pill px-2.5 text-[13px] font-bold tabular-nums transition-colors duration-150 ease-ios motion-reduce:transition-none disabled:opacity-40",
                      showSelectedOnly
                        ? "bg-it-blue-500 text-white"
                        : "text-it-ink-500 dark:text-it-ink-300",
                    )}
                  >
                    {MESSAGES.team.groupMembersTabSelected(selectedIds.size)}
                  </button>
                </div>
              )}
            </div>

            {/* 회원 선택 출생연도 필터 — 인원이 있는 연도만 공통 바텀시트로 선택 (회원 0명이면 숨김) */}
            {members.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setAgeSheetOpen(true)}
                  aria-haspopup="dialog"
                  aria-label="출생연도 필터"
                  className="mb-3 flex h-12 w-full items-center justify-between rounded-w-md border-[1.5px] border-it-line-strong dark:border-it-blue-900 bg-it-fill dark:bg-it-blue-950 px-4 text-[15px] font-semibold text-it-ink-800 dark:text-white outline-none transition-colors duration-150 ease-ios motion-reduce:transition-none focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20 active:brightness-95"
                >
                  <span>
                    {ageFilter === "all"
                      ? `${MESSAGES.team.groupMembersFilterAll} (${members.length}명)`
                      : `${ageFilter}년생 (${counts.get(ageFilter) ?? 0}명)`}
                  </span>
                  <Icon
                    name="expand_more"
                    className="shrink-0 text-[22px] text-it-ink-400 dark:text-it-ink-300"
                    aria-hidden="true"
                  />
                </button>
                <BottomSheetSelector
                  isOpen={ageSheetOpen}
                  title={MESSAGES.team.groupMembersFilterTitle}
                  items={[
                    {
                      id: "all",
                      name: MESSAGES.team.groupMembersFilterAll,
                      sub: MESSAGES.team.groupMembersFilterSub(
                        members.length,
                        selectedIds.size,
                      ),
                      selected: ageFilter === "all",
                    },
                    ...birthYearOptions.map((y) => ({
                      id: String(y),
                      name: `${y}년생`,
                      sub: MESSAGES.team.groupMembersFilterSub(
                        counts.get(y) ?? 0,
                        selectedCounts.get(y) ?? 0,
                      ),
                      selected: ageFilter === y,
                    })),
                  ]}
                  onSelect={(id) => {
                    setAgeFilter(id === "all" ? "all" : Number(id));
                    setAgeSheetOpen(false);
                  }}
                  onClose={() => setAgeSheetOpen(false)}
                />
              </>
            )}

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
                className="h-12 w-full rounded-w-md border-[1.5px] border-it-line-strong dark:border-it-blue-900 bg-it-fill dark:bg-it-blue-950 pl-11 pr-4 text-[15px] font-semibold text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-it-ink-300 outline-none focus:outline-none transition-colors duration-150 ease-ios motion-reduce:transition-none focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20"
              />
            </div>

            {filteredMembers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <p className="text-center text-[14px] font-medium text-it-ink-700 dark:text-it-ink-300">
                  {/* [수정 2026-05-18 W2.B #8] 연령 필터 적용 시 안내 메시지 분기 */}
                  {showSelectedOnly
                    ? MESSAGES.team.groupMembersSelectedEmpty
                    : ageFilter !== "all"
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
                          {ageLabel(m) && (
                            <span className="shrink-0 rounded-w-md bg-it-blue-50 px-1.5 py-0.5 text-[12px] font-bold tabular-nums text-it-blue-500 dark:bg-it-blue-500/15 dark:text-it-blue-300">
                              {ageLabel(m)}
                            </span>
                          )}
                          {genderLabel(m.gender) !== '-' && (
                            <span className="shrink-0 text-[13px] font-medium text-it-ink-500 dark:text-it-ink-300">
                              {genderLabel(m.gender)}
                            </span>
                          )}
                        </div>
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
              disabled={submitting || !name.trim() || !!liveNameError}
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
