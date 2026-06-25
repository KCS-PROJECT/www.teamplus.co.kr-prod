"use client";

/**
 * Tournament Create Page (DIRECTOR/COACH/ADMIN 전용)
 *
 * 디자인:
 *  - Sticky Header (뒤로가기 + 제목 + 햄버거 메뉴)
 *  - Hero Section (아이콘 배지 + 제목 + 부제)
 *  - Section Card (기본 정보 · 참가 대상 · 결제 방식 · 대회일정)
 *  - Sticky Bottom CTA (등록하기)
 *
 * 검증:
 *  - 대회명 필수 / 경기 일정 1건 이상(날짜·시간) 필수
 *  - 대회 기간(start/end)은 경기 일정 날짜의 min/max 로 자동 파생
 */

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { useNavigation } from "@/components/ui/NavLink";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useNativeUI } from "@/hooks/useNativeUI";
import { useVenues } from "@/hooks/useVenues";
import { MESSAGES } from "@/lib/messages";
import { emitRefresh, REFRESH_KEYS } from "@/lib/refresh-bus";
import { usePageReady } from '@/hooks/usePageReady';
import { DatePickerModal, formatDateLabel } from "@/components/ui/DatePickerModal";
import { api } from "@/services/api-client";
import { teamGroupService, type TeamGroupSummary } from "@/services/team-group.service";
import { getTeamMembers, type TeamMemberRow } from "@/services/team.service";
import {
  canManageMatch,
  createTournament,
  createMatch,
  deleteMatch,
  getTournament,
  updateTournament,
  type CreateTournamentInput,
  type UpdateTournamentInput,
  type TournamentBillingMode,
} from "@/services/tournament.service";

// [2026-06-16] 참가 대상 = 선수 명단(selectedParticipantIds) 스냅샷.
//   출생연도칩·하위그룹칩은 선수를 고르는 필터일 뿐, SoT 는 선택된 선수 userId 집합 단일.
//   대회일정 = 경기별 vs 상대팀(자유 텍스트) + 날짜/시간 동적 입력 → 저장 시 HockeyMatch 생성.

/** 대회일정 1경기 입력 행. */
interface ScheduleMatchRow {
  /** 안정적 key (렌더용) */
  key: string;
  opponentName: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  time: string;
  /** 경기별 장소(링크장) id. "" = 대회 전체 장소 사용(폴백). */
  venueId: string;
  /** 장소 검색 입력값 겸 선택 장소명(표시용). */
  venueQuery: string;
}

/** 출생연도 미상(birthYear=null) 선수 묶음의 연도칩 sentinel. */
const BIRTH_YEAR_UNKNOWN = "unknown" as const;

/**
 * 비-선수(코치/매니저/학부모) 제외 — 실제 선수만 참가대상 후보로 노출.
 * roleInTeam 우선, 없으면 user.userType 으로 판정.
 * [2026-06-25] 학부모(PARENT) 제외 추가 — 변경된 로직상 학부모는 팀 소속이 없어야 하나,
 *   레거시로 TeamMember 에 PARENT 로 남은 데이터가 참가후보(전체선택)에 노출되던 버그 방지.
 */
function isPlayerMember(m: TeamMemberRow): boolean {
  const role = (m.roleInTeam ?? "").toUpperCase();
  if (
    role === "HEAD_COACH" ||
    role === "COACH" ||
    role === "MANAGER" ||
    role === "PARENT"
  ) {
    return false;
  }
  const type = (m.user?.userType ?? "").toUpperCase();
  if (
    type === "COACH" ||
    type === "DIRECTOR" ||
    type === "ACADEMY_DIRECTOR" ||
    type === "PARENT"
  ) {
    return false;
  }
  return true;
}

/** 선수 표시명 — playerName 우선, 없으면 user 이름 조합 폴백. */
function playerLabel(m: TeamMemberRow): string {
  if (m.playerName?.trim()) return m.playerName.trim();
  const full = `${m.user?.lastName ?? ""}${m.user?.firstName ?? ""}`.trim();
  return full || "이름 미상";
}

export default function TournamentCreatePage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  const { user } = useSessionAuth();
  const { navigate, replace } = useNavigation();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const editId = searchParams?.get("edit") ?? null;
  const isEditMode = Boolean(editId);
  const isManager = canManageMatch(user?.userType);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // [2026-06-16] 대회 기간(start/end)은 경기 일정에서 자동 파생 — 수동 입력 state 제거.
  // [2026-06-05] openPicker: "schedule-{key}"(대회일정 경기 날짜)만 사용.
  const [openPicker, setOpenPicker] = useState<string | null>(null);
  // [2026-06-19] 대회장소 — 장소명 입력 시에만 저장된 링크장이 목록으로 표시되는 '찾아보기' 방식
  //   (수업 MultiDatePickerModal 패턴 동일). venueId 를 SoT 로 전송, venueQuery 는 입력칸 값 겸 선택 장소명.
  const [venueId, setVenueId] = useState("");
  const [venueQuery, setVenueQuery] = useState("");
  const { venues } = useVenues();
  // [2026-06-16] 결제 방식 — PREPAID(선불) | POSTPAID(후불). 후불은 종료 후 1인당 금액 일괄 청구.
  const [billingMode, setBillingMode] = useState<TournamentBillingMode>("PREPAID");
  const isPostpaid = billingMode === "POSTPAID";
  // 선불 대회 참가비 — 대회당 단일 금액(원, 숫자 문자열). 빈값/0 = 무료.
  const [tournamentFee, setTournamentFee] = useState<string>("");

  // [2026-06-16] 참가 대상 — 선수 명단(userId) 단일 SoT.
  //   selectedPlayerIds: 선택된 선수 User.id 집합. 연도칩·그룹칩의 모든 체크박스가 이 집합만 참조.
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(
    () => new Set(),
  );
  // 관리팀 선수 목록(비-선수 제외) — 연도칩·그룹칩·체크박스의 데이터 소스.
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [teamGroups, setTeamGroups] = useState<TeamGroupSummary[]>([]);
  // [2026-06-16] 참가대상 선택은 전용 풀스크린 시트(ParticipantPickerSheet)에서 수행.
  //   폼 안 SectionCard 는 요약 + 트리거([선택])만 노출. 시트는 selectedPlayerIds 를 라이브 토글.
  const [pickerOpen, setPickerOpen] = useState(false);

  // [2026-06-05 3단계] 대회일정 — 경기별 vs 상대팀(자유 텍스트) + 날짜/시간.
  const [scheduleMatches, setScheduleMatches] = useState<ScheduleMatchRow[]>([]);
  // [2026-06-08] 수정 모드: 진입 시점 기존 경기 id — 저장 시 전체 교체(삭제 후 재생성)용.
  const [existingMatchIds, setExistingMatchIds] = useState<string[]>([]);
  // 신규 경기 행 key 생성용 카운터 (Math.random 금지 환경 → 단조 증가 인덱스).
  const matchKeySeq = useMemo(() => ({ n: 0 }), []);

  // [2026-06-19] 대회장소 링크장 검색 — 입력어 이름 부분 일치 필터 (수업 MultiDatePickerModal 패턴).
  const filteredVenues = useMemo(() => {
    const q = venueQuery.trim().toLowerCase();
    if (!q) return venues;
    return venues.filter((v) => v.name.toLowerCase().includes(q));
  }, [venueQuery, venues]);

  // 경기별 장소 검색 — 행마다 입력값(venueQuery)으로 저장된 링크장을 필터(대회장소 패턴 동일).
  const filterVenuesByQuery = (q: string) => {
    const t = q.trim().toLowerCase();
    if (!t) return [] as typeof venues;
    return venues.filter((v) => v.name.toLowerCase().includes(t));
  };

  const [submitting, setSubmitting] = useState(false);
  // 연타 가드 — submitting state 는 비동기라 빠른 연타에 두 번째 제출이 통과할 수 있어
  //   동기 ref 로 실제 제출 진입을 1회로 제한한다.
  const submittingRef = useRef(false);
  const [isPrefilling, setIsPrefilling] = useState(isEditMode);
  // 등록 시도 후에만 validation alert 노출 (초기 진입 시 불필요한 에러 카드 방지)
  const [hasAttempted, setHasAttempted] = useState(false);

  // [2026-06-05 1단계] 참가 인원(개별 선수) 선택 제거 — loadTeamMembers / filteredMembers /
  //   선택 cleanup useEffect 삭제. 참가 대상은 2단계(출생연도 태그 + 팀 하위그룹)에서 재구성.

  // [2026-06-05 1단계] birthYearSummary / 참가인원 핸들러 제거 — 참가연령·참가인원 UI 삭제.

  // [hotfix 2026-05-15 T06-H] pull-to-refresh 차단 — 폼 입력 중 의도치 않은
  //   당겨서 새로고침으로 입력값 유실되는 회귀 차단. Flutter WebView 의 native
  //   pullToRefreshController 자체를 비활성화한다(useNativeUI 브릿지 경유).
  //   CSS overscroll-behavior 만으로는 Android WebView 에서 차단되지 않음.
  // [BUG FIX 2026-05-30] Native(실폰/시뮬)에서 상단 status bar(appstatus) 영역이 사라지는 회귀 수정.
  //   원인: 페이지 진입 로딩(isLoading=true) 시 Flutter 가 status bar 를 강제로 끄는데
  //     (webview_screen.dart:444-445), 로딩 종료만으로는 복원하지 않는다
  //     (webview_screen.dart:470-473 — showStatusBar 강제 복원 제거 정책).
  //     복원은 오직 `showStatusBar:true` config 재전송으로만 일어나며(481-482),
  //     그 재전송 트리거가 useNativeUI 의 `isDataLoaded` 다.
  //     useNativeUI.ts:384 `if (isDataLoaded === undefined) return` 으로,
  //     isDataLoaded 미지정 시 복원 useEffect(+400/800ms 안전망)가 통째로 스킵돼
  //     로딩이 끈 status bar 가 영영 복원되지 않았다(주석 400-401 "appstatus 영역이 안 나옴").
  //   조치: 데이터 준비 완료 신호(!isPrefilling)를 isDataLoaded 로 전달 →
  //     prefill 완료 시점에 showStatusBar:true 재적용 보장. 신규 등록은 즉시 true.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    appBarTitle: isEditMode ? "대회 수정" : "새 대회 등록",
    showBottomNav: false,
    showBackButton: true,
    pullToRefreshEnabled: false,
    isDataLoaded: !isPrefilling,
  });

  const toDateInputValue = useCallback(
    (iso: string | undefined | null): string => {
      if (!iso) return "";
      try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return "";
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      } catch {
        return "";
      }
    },
    [],
  );

  const prefillFromEdit = useCallback(async () => {
    if (!editId) return;
    setIsPrefilling(true);
    try {
      const res = await getTournament(editId);
      if (res.success && res.data) {
        const t = res.data;
        setName(t.name ?? "");
        setDescription(t.description ?? "");
        // [2026-06-16] start/end 는 경기 일정에서 파생 — 수정 시 matches prefill 로 자동 재계산.
        // [2026-06-19] 링크장 복원 — venue 관계 우선. 입력칸(venueQuery)에 선택 장소명 표시.
        //   레거시 자유텍스트(location)는 링크장 매핑이 없어 재선택 유도(빈 입력칸).
        setVenueId(t.venue?.id ?? t.venueId ?? "");
        setVenueQuery(t.venue?.name ?? "");
        // [2026-06-16] 결제 방식 복원 — 미지정 시 선불(PREPAID).
        setBillingMode(t.billingMode ?? "PREPAID");
        // [2026-06-16] 참가 대상 복원 — 선택 선수 명단(userId) 단일 SoT.
        //   팀 이탈로 멤버 목록에 없는 id 는 회색 표기(아래 렌더에서 처리)하되 선택값은 보존.
        if (Array.isArray(t.selectedParticipantIds)) {
          setSelectedPlayerIds(new Set(t.selectedParticipantIds));
        }
        // 선불 참가비 복원 — 기존 대회의 feePerGame(대회당 단일 금액)을 단일 입력에 복원.
        //   (기존 일정 합계가 feePerGame 에 저장돼 있으므로 그대로 표시된다.)
        const feeNum = t.feePerGame != null ? Number(t.feePerGame) : 0;
        setTournamentFee(Number.isFinite(feeNum) && feeNum > 0 ? String(feeNum) : "");
        // [2026-06-08] 대회일정(경기) prefill — scheduledAt → 날짜/시간 행으로 복원.
        if (Array.isArray(t.matches) && t.matches.length > 0) {
          const rows: ScheduleMatchRow[] = t.matches.map((m) => {
            const dt = new Date(m.scheduledAt);
            const hh = String(dt.getHours()).padStart(2, "0");
            const mm = String(dt.getMinutes()).padStart(2, "0");
            return {
              key: `existing-${m.id}`,
              opponentName: m.awayTeam?.name ?? m.opponentName ?? "",
              date: toDateInputValue(m.scheduledAt),
              time: `${hh}:${mm}`,
              venueId: m.venue?.id ?? "",
              venueQuery: m.venue?.name ?? "",
            };
          });
          setScheduleMatches(rows);
          setExistingMatchIds(t.matches.map((m) => m.id));
        }
      } else {
        toast.error(res.error?.message ?? MESSAGES.error.network);
      }
    } finally {
      setIsPrefilling(false);
    }
  }, [editId, toDateInputValue, toast]);

  useEffect(() => {
    if (isEditMode) {
      prefillFromEdit();
    }
  }, [isEditMode, prefillFromEdit]);

  // ── 참가대상: 관리팀 선수 명단 + 하위그룹 로드 ──────────────────────────
  //   관리팀 id 1회 조회 → 회원 목록(userId/birthYear/groupIds) + 하위그룹 이름 동시 로드.
  //   회원 목록에서 비-선수(코치/매니저)를 제외해 실제 선수만 후보로 보관한다.
  useEffect(() => {
    if (!isManager) return;
    let cancelled = false;
    void (async () => {
      setMembersLoading(true);
      try {
        type TeamItem = { id?: string };
        const res = await api.get<TeamItem[] | { data?: TeamItem[] }>(
          "/teams/managed/list",
        );
        const list: TeamItem[] = res.success
          ? Array.isArray(res.data)
            ? res.data
            : ((res.data as { data?: TeamItem[] })?.data ?? [])
          : [];
        const teamId = list[0]?.id;
        if (!teamId) return;

        const [membersRes, groups] = await Promise.all([
          getTeamMembers(teamId, "approved"),
          teamGroupService.listByTeam(teamId).catch(() => []),
        ]);
        if (cancelled) return;

        if (membersRes.success && membersRes.data) {
          const players = membersRes.data.members.filter(isPlayerMember);
          setTeamMembers(players);
        }
        setTeamGroups(groups.filter((g) => g.isActive));
      } catch {
        // 조회 실패는 무시 — 참가 대상 지정은 선택 사항(렌더에서 빈 상태 안내).
      } finally {
        if (!cancelled) setMembersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isManager]);

  // ── 참가대상: 파생 구조 (연도칩 · 그룹별 선수 매핑) ──────────────────────
  /** userId → 선수 row 빠른 조회 맵 (선택 토글·요약 계산용). */
  const memberByUserId = useMemo(() => {
    const map = new Map<string, TeamMemberRow>();
    for (const m of teamMembers) map.set(m.userId, m);
    return map;
  }, [teamMembers]);

  /** 출생연도칩 목록 — 팀에 실제 존재하는 연도 distinct 내림차순 + (있으면) 미상 묶음. */
  const birthYearChips = useMemo(() => {
    const years = new Set<number>();
    let hasUnknown = false;
    for (const m of teamMembers) {
      if (typeof m.birthYear === "number") years.add(m.birthYear);
      else hasUnknown = true;
    }
    const sorted = [...years].sort((a, b) => b - a);
    const chips: Array<{ key: number | "unknown"; label: string }> = sorted.map(
      (y) => ({ key: y, label: String(y) }),
    );
    if (hasUnknown) {
      chips.push({
        key: BIRTH_YEAR_UNKNOWN,
        label: MESSAGES.tournament.participantBirthYearUnknown,
      });
    }
    return chips;
  }, [teamMembers]);

  /** 특정 연도칩에 속한 선수들. */
  const playersByYear = useCallback(
    (year: number | "unknown") =>
      teamMembers.filter((m) =>
        year === BIRTH_YEAR_UNKNOWN
          ? m.birthYear == null
          : m.birthYear === year,
      ),
    [teamMembers],
  );

  /** 특정 그룹에 속한 선수들. */
  const playersByGroup = useCallback(
    (groupId: string) =>
      teamMembers.filter((m) => m.groupIds.includes(groupId)),
    [teamMembers],
  );

  /** 선수 1명 선택 토글 (userId 단일 SoT). */
  const togglePlayer = useCallback((userId: string) => {
    setSelectedPlayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  /** 주어진 선수 묶음 전체 선택/해제 (전부 선택돼 있으면 해제, 아니면 모두 선택). */
  const toggleAllPlayers = useCallback((rows: TeamMemberRow[]) => {
    if (rows.length === 0) return;
    setSelectedPlayerIds((prev) => {
      const next = new Set(prev);
      const allSelected = rows.every((m) => next.has(m.userId));
      for (const m of rows) {
        if (allSelected) next.delete(m.userId);
        else next.add(m.userId);
      }
      return next;
    });
  }, []);

  /** 선택했지만 현재 팀 멤버 목록엔 없는 id (수정 모드 팀 이탈 선수). */
  const orphanSelectedIds = useMemo(
    () => [...selectedPlayerIds].filter((id) => !memberByUserId.has(id)),
    [selectedPlayerIds, memberByUserId],
  );

  // ── 3단계: 대회일정 경기 행 핸들러 ──────────────────────────────────────
  const addScheduleMatch = () => {
    matchKeySeq.n += 1;
    setScheduleMatches((prev) => [
      ...prev,
      { key: `m${matchKeySeq.n}`, opponentName: "", date: "", time: "", venueId: "", venueQuery: "" },
    ]);
  };
  const removeScheduleMatch = (key: string) => {
    setScheduleMatches((prev) => prev.filter((m) => m.key !== key));
  };
  const updateScheduleMatch = (key: string, patch: Partial<ScheduleMatchRow>) => {
    setScheduleMatches((prev) =>
      prev.map((m) => (m.key === key ? { ...m, ...patch } : m)),
    );
  };

  const validationError = useMemo<string | null>(() => {
    if (!name.trim()) return MESSAGES.tournament.nameRequired;
    // [2026-06-16] 대회 기간(start/end)을 경기 일정에서 자동 파생 — 일정 1건 이상 필수.
    if (scheduleMatches.length === 0) {
      return MESSAGES.tournament.scheduleRequired;
    }
    // 날짜·시간이 모두 채워진 경기가 1건 이상이어야 기간 파생 가능.
    const hasValidMatch = scheduleMatches.some((m) => m.date && m.time);
    if (!hasValidMatch) return MESSAGES.tournament.scheduleIncomplete;
    // [2026-06-16] 참가대상 = 선수 명단 스냅샷 — 최소 1명 필수.
    if (selectedPlayerIds.size === 0) {
      return MESSAGES.tournament.participantRequired;
    }
    return null;
  }, [name, scheduleMatches, selectedPlayerIds]);

  // 경기 일정은 과거 날짜 선택 불가(오늘부터) — create·edit 공통. 수정 모드의 지난 경기는 잠금(아래 locked).
  const scheduleMinDate = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  // 오늘(YYYY-MM-DD) — 지난 경기(수정 모드 잠금) 판정용.
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const canSubmit = !submitting && !isPrefilling;

  const handleSubmit = async () => {
    setHasAttempted(true);
    if (!isManager) {
      toast.error(MESSAGES.error.general);
      return;
    }
    if (validationError) {
      toast.error(validationError);
      return;
    }
    // 연타 가드 — 이미 제출 진행 중이면 무시 (검증 통과 후).
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    // 성공 시 상세 페이지로 전환되며, 전환 지연 구간의 재클릭 중복 생성을 막기 위해
    //   전환을 시작한 경우엔 ref 를 유지한다(실패 시에만 해제).
    let navigated = false;
    try {
      // [2026-06-16] 대회 기간(start/end)을 경기 일정에서 파생 — 유효 경기(date+time) 날짜의
      //   최소/최대를 시작/종료일로 사용. validationError 가 1건 이상 보장하므로 항상 존재.
      const validMatchDates = scheduleMatches
        .filter((m) => m.date && m.time)
        .map((m) => m.date)
        .sort();
      const derivedStart = validMatchDates[0];
      const derivedEnd = validMatchDates[validMatchDates.length - 1];
      const payload: CreateTournamentInput = {
        name: name.trim(),
        startDate: derivedStart,
        endDate: derivedEnd,
        // [2026-06-16] 결제 방식 — 항상 전송 (수정 시 PREPAID↔POSTPAID 전환 반영).
        billingMode,
      };
      if (description.trim()) payload.description = description.trim();
      // [2026-06-19] 대회장소 — 선택한 링크장 venueId 전송 (선택 시에만).
      if (venueId) payload.venueId = venueId;
      // [2026-06-16] 참가 대상 — 선택한 선수 명단(userId) 전송. SoT 단일.
      //   eligibleBirthYears/eligibleGroupIds 는 전송하지 않는다(백엔드가 명단에서 파생/클리어).
      //   validationError 가 1명 이상을 보장하므로 항상 비어있지 않다.
      payload.selectedParticipantIds = [...selectedPlayerIds];

      // 대회 참가비 = 대회당 단일 금액 — 양수일 때만 전송 (무료는 미전송).
      // [2026-06-16] 후불(POSTPAID)은 종료 후 정산에서 금액 결정 → 요금 미전송.
      const feeNum = tournamentFee.trim() === "" ? 0 : Number(tournamentFee);
      if (!isPostpaid && Number.isFinite(feeNum) && feeNum > 0) {
        payload.feePerGame = feeNum;
        payload.feeType = "TOTAL_FIXED";
        payload.totalGames = 1;
      }

      const res =
        isEditMode && editId
          ? await updateTournament(editId, payload as UpdateTournamentInput)
          : await createTournament(payload);
      if (res.success && res.data) {
        const tournamentId = res.data.id;
        // [2026-06-08] 대회일정 저장 — 신규/수정 모두 반영.
        //   수정 모드는 진입 시점 기존 경기(existingMatchIds)를 전체 삭제 후 재생성(전체 교체).
        if (isEditMode && existingMatchIds.length > 0) {
          for (const mid of existingMatchIds) {
            try {
              await deleteMatch(mid);
            } catch {
              /* 이미 삭제됐을 수 있음 — 무시 */
            }
          }
        }
        const validMatches = scheduleMatches.filter((m) => m.date && m.time);
        for (let i = 0; i < validMatches.length; i += 1) {
          const m = validMatches[i];
          // 일정별 참가비 입력 제거 — 경기 일정은 안내용. 금액은 대회 단일 참가비로만 관리.
          await createMatch({
            tournamentId,
            opponentName: m.opponentName.trim() || undefined,
            scheduledAt: `${m.date}T${m.time}:00`,
            matchOrder: i + 1,
            // 경기별 장소 우선, 미입력 시 대회 전체 장소로 폴백 저장.
            venueId: m.venueId || venueId || undefined,
          });
        }
        toast.success(
          isEditMode ? "대회가 수정되었습니다." : MESSAGES.tournament.created,
        );
        // [추가 T07-H 2026-05-15] 대회 목록/상세 cache invalidation 신호.
        emitRefresh(REFRESH_KEYS.TOURNAMENTS);
        // [수정 T07-H 2026-05-15] 수정 모드: replace 사용.
        //   사유: edit 페이지에서 detail 로 navigate 하면 history 가 [list, detail, edit, detail] 로 쌓여
        //   사용자가 뒤로가기 누르면 edit 페이지로 되돌아가는 회귀가 발생. replace 로 edit 항목을 제거.
        navigated = true;
        if (isEditMode) {
          await replace(`/tournaments/${res.data.id}`);
        } else {
          await navigate(`/tournaments/${res.data.id}`);
        }
      } else {
        toast.error(res.error?.message ?? MESSAGES.save.error);
      }
    } finally {
      setSubmitting(false);
      // 전환을 시작한 경우(navigated) ref 유지 — 전환 지연 중 재클릭 차단. 실패 시에만 해제.
      if (!navigated) submittingRef.current = false;
    }
  };

  // 관리자 아님 — 진입 차단 안내
  if (!isManager) {
    return (
      <MobileContainer hasBottomNav={false}>
        <PageAppBar
          title={isEditMode ? "대회 수정" : "새 대회 등록"}
          forceNative
        />
        <main className="flex flex-1 flex-col items-center justify-center bg-it-canvas px-8 dark:bg-puck">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-w-md bg-it-fill dark:bg-rink-800">
            <Icon name="lock" className="text-3xl text-it-ink-400" />
          </div>
          <p className="text-center text-w-small text-it-ink-500 dark:text-rink-300">
            {MESSAGES.error.general}
          </p>
        </main>
      </MobileContainer>
    );
  }

  return (
    <MobileContainer hasBottomNav={false}>
      {/* [수정 2026-05-30] 뒤로가기가 같은 화면으로 남던 문제 수정 — onBack 으로 navigate("/tournaments")
          (router.push) 를 명시하던 비표준 패턴 제거. PageAppBar 기본 동작인 back()(history back)을
          사용해 이전 화면(대회 목록)으로 자연스럽게 복귀. awards/create·team/create 와 동일 패턴. */}
      <PageAppBar
        title={isEditMode ? "대회 수정" : "새 대회 등록"}
        forceNative
      />

      <main className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck pb-[calc(60px+var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)))]">
        {/* [수정 2026-05-11] Hero Section 전체 제거 — 사용자 요청. 시각적 노이즈/스크롤
            낭비를 줄이고 폼에 바로 집중. PageAppBar 제목으로 컨텍스트는 충분.
            ICETIMES flat — 섹션 간 8px 회색 갭(gap-2), 각 SectionCard 는 full-bleed 흰 섹션. */}

        <form
          id="tournament-create-form"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
          className="flex flex-col gap-2 pt-2 pb-6"
        >
          {/* Section 1: 기본 정보 */}
          <SectionCard
            icon="edit_note"
            title="기본 정보"
            description={MESSAGES.tournamentForm.titleHint}
            overflowVisible
          >
            <Field label="대회명" required>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 2026 TEAMPLUS 주니어 리그"
                maxLength={100}
                className={`${pillInput} placeholder:text-it-ink-300 placeholder:font-light placeholder:italic`}
                required
              />
              <Hint>{name.length}/100자</Hint>
            </Field>
            <Field label="대회 설명">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={4}
                className={pillTextarea}
              />
              <Hint align="right">{description.length}/500자</Hint>
            </Field>
            {/* [2026-06-19] 대회장소 — 장소명 입력 시에만 저장된 링크장 목록 표시 (수업 MultiDatePickerModal 패턴).
                목록은 absolute 드롭다운(오버레이)으로 띄워 폼 레이아웃이 밀리지 않게 한다 — 흐름 영역은
                항상 1줄(안내문구 또는 선택 해제 버튼)로 고정. */}
            <Field label="대회장소">
              <div className="relative">
                <input
                  type="text"
                  value={venueQuery}
                  onChange={(e) => {
                    setVenueQuery(e.target.value);
                    if (venueId) setVenueId("");
                  }}
                  placeholder="장소 찾아보기"
                  aria-label="대회장소 검색"
                  className={pillInput}
                />
                {!venueId && venueQuery.trim() && (
                  <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-40 divide-y divide-it-line overflow-y-auto rounded-w-md border-[1.5px] border-it-line-strong bg-it-surface shadow-sh-2 dark:divide-rink-700 dark:border-rink-700 dark:bg-rink-800">
                    {filteredVenues.length > 0 ? (
                      filteredVenues.map((v) => (
                        <li key={v.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setVenueId(v.id);
                              setVenueQuery(v.name);
                            }}
                            className="w-full px-3 py-2.5 text-left text-w-body font-medium text-it-ink-800 transition-colors motion-reduce:transition-none hover:bg-it-fill dark:text-white dark:hover:bg-rink-700/40"
                          >
                            {v.name}
                          </button>
                        </li>
                      ))
                    ) : (
                      <li className="px-3 py-2.5 text-w-caption text-it-ink-500 dark:text-rink-300">
                        &ldquo;{venueQuery.trim()}&rdquo; 검색 결과가 없습니다
                      </li>
                    )}
                  </ul>
                )}
              </div>
              {venueId ? (
                <button
                  type="button"
                  onClick={() => {
                    setVenueId("");
                    setVenueQuery("");
                  }}
                  className="mt-1 inline-flex items-center gap-1 text-w-caption font-semibold text-it-ink-500 underline dark:text-rink-300"
                >
                  선택 해제 (장소 미지정)
                </button>
              ) : (
                <Hint>장소명을 입력하면 저장된 링크장이 표시됩니다. 비워두면 장소 미지정.</Hint>
              )}
            </Field>
          </SectionCard>

          {/* 참가 대상 — 선수 명단 선택 (2026-06-16)
              출생연도칩·하위그룹칩은 선수를 고르는 필터. SoT 는 selectedPlayerIds(userId) 단일.
              연도·그룹 어느 칩에서 보든 같은 선수는 동일 선택 상태로 표시된다. */}
          <SectionCard
            icon="groups"
            title="참가 대상"
            description="참가할 선수를 직접 선택하세요 (최소 1명)"
          >
            {membersLoading ? (
              <p className="px-1 py-2 text-w-caption text-it-ink-500 dark:text-rink-300">
                {MESSAGES.common.loading}
              </p>
            ) : teamMembers.length === 0 ? (
              <p className="px-1 py-2 text-w-caption text-it-ink-500 dark:text-rink-300">
                {MESSAGES.tournament.participantEmpty}
              </p>
            ) : (
              <>
                {/* 요약 + 트리거 — 실제 선택은 전용 시트(ParticipantPickerSheet)에서 수행. */}
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`min-w-0 truncate text-w-small font-extrabold ${
                      selectedPlayerIds.size > 0
                        ? "text-it-ink-800 dark:text-white"
                        : "text-it-ink-500 dark:text-rink-300"
                    }`}
                  >
                    {selectedPlayerIds.size > 0
                      ? MESSAGES.tournament.participantSelectedSummary(
                          selectedPlayerIds.size,
                        )
                      : MESSAGES.tournament.participantSelectPrompt}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="shrink-0 rounded-w-md border-[1.5px] border-it-blue-500 bg-it-blue-50 px-4 py-2 text-w-small font-extrabold text-it-blue-500 transition-colors motion-reduce:transition-none hover:bg-it-blue-100 active:scale-[0.98] dark:bg-it-blue-500/15"
                  >
                    {selectedPlayerIds.size > 0
                      ? MESSAGES.tournament.participantPickerChange
                      : MESSAGES.tournament.participantPickerOpen}
                  </button>
                </div>

                {orphanSelectedIds.length > 0 && (
                  <p className="text-w-caption text-it-ink-500 dark:text-rink-300">
                    {MESSAGES.tournament.participantLeftTeam} (
                    {orphanSelectedIds.length}명)
                  </p>
                )}
              </>
            )}
          </SectionCard>

          {/* [2026-06-16] 결제 방식 — 선불/후불 토글. 후불은 종료 후 1인당 금액 일괄 청구. */}
          <SectionCard
            icon="payments"
            title={MESSAGES.tournament.billingModeLabel}
            description="참가비를 미리 받을지(선불), 종료 후 정산할지(후불) 선택하세요"
          >
            <div
              role="radiogroup"
              aria-label={MESSAGES.tournament.billingModeLabel}
              className="grid grid-cols-2 gap-2"
            >
              {(
                [
                  ["PREPAID", MESSAGES.tournament.billingModePrepaid],
                  ["POSTPAID", MESSAGES.tournament.billingModePostpaid],
                ] as const
              ).map(([mode, label]) => {
                const active = billingMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    // [2026-06-17] 수정 모드 — 이미 만들어진 대회는 결제방식 변경 불가(비활성화).
                    //   신청/정산이 진행된 뒤 선불↔후불 전환 시 결제 데이터 정합성이 깨짐.
                    disabled={isEditMode}
                    onClick={() => {
                      if (isEditMode) return;
                      setBillingMode(mode);
                    }}
                    className={`flex h-11 items-center justify-center rounded-w-md border-[1.5px] text-w-small font-extrabold transition-colors motion-reduce:transition-none ${
                      active
                        ? "border-it-blue-500 bg-it-blue-50 text-it-blue-500 dark:bg-it-blue-500/15"
                        : "border-it-line-strong bg-it-surface text-it-ink-600 hover:border-it-ink-300 dark:border-rink-700 dark:bg-rink-800 dark:text-rink-100"
                    } ${isEditMode ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {isEditMode && (
              <Hint>결제 방식은 대회 생성 후 변경할 수 없습니다.</Hint>
            )}
            {isPostpaid ? (
              <Hint>{MESSAGES.tournament.postpaidScheduleHint}</Hint>
            ) : (
              <Field label={MESSAGES.tournamentForm.feeLabel}>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1000}
                    value={tournamentFee}
                    onChange={(e) =>
                      setTournamentFee(e.target.value.replace(/[^0-9]/g, ""))
                    }
                    placeholder={MESSAGES.tournamentForm.feePlaceholder}
                    aria-label={MESSAGES.tournamentForm.feeLabel}
                    className={`${pillInput} min-w-0 box-border pr-8 text-left font-num tabular-nums placeholder:font-light placeholder:italic`}
                  />
                  {tournamentFee && (
                    <span className="pointer-events-none absolute right-3 text-card-meta font-medium text-it-ink-400">
                      원
                    </span>
                  )}
                </div>
                <Hint>{MESSAGES.tournamentForm.feeHint}</Hint>
              </Field>
            )}
          </SectionCard>

          {/* [2026-06-05 3단계] 대회일정 — 대회기간 밑. 경기별 vs 상대팀(자유 텍스트) + 날짜/시간.
              신규 등록 시 입력된 경기는 저장과 함께 HockeyMatch 로 생성된다. */}
          <SectionCard
            icon="event_note"
            title="대회일정"
            description={MESSAGES.tournamentForm.scheduleHint}
          >
            {scheduleMatches.length === 0 ? (
              <p className="px-1 py-2 text-w-caption text-it-ink-400 dark:text-rink-300">
                아직 등록된 경기가 없습니다. 아래 버튼으로 추가하세요.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {scheduleMatches.map((m, idx) => {
                  // 수정 모드에서 이미 지난 경기(날짜 < 오늘)는 기록 보존 — 수정·삭제 잠금.
                  const locked = isEditMode && !!m.date && m.date < todayStr;
                  return (
                  <li
                    key={m.key}
                    className="rounded-w-md border-[1.5px] border-it-line-strong bg-it-fill px-3 py-3 dark:border-rink-700 dark:bg-rink-900/40"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-w-caption font-extrabold text-it-ink-600 dark:text-rink-100">
                        {idx + 1}경기
                      </span>
                      {locked ? (
                        <span className="rounded-w-pill bg-it-fill px-2 py-1 text-w-caption font-extrabold text-it-ink-400 dark:bg-rink-800 dark:text-rink-300">
                          지난 경기
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => removeScheduleMatch(m.key)}
                          className="rounded-w-pill px-2 py-1 text-w-caption font-extrabold text-it-red-500 hover:bg-it-red-50 dark:text-it-red-300 dark:hover:bg-it-red-500/10"
                          aria-label={`${idx + 1}경기 삭제`}
                        >
                          삭제
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={m.opponentName}
                      onChange={(e) =>
                        updateScheduleMatch(m.key, { opponentName: e.target.value })
                      }
                      disabled={locked}
                      placeholder="vs 상대팀 (예: 강남 아이스하키)"
                      maxLength={50}
                      className={`${pillInput} mb-2 disabled:opacity-60`}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <DateTriggerButton
                        value={m.date}
                        placeholder="경기 날짜"
                        ariaLabel={`${idx + 1}경기 날짜 선택`}
                        isOpen={openPicker === `schedule-${m.key}`}
                        onOpen={() => setOpenPicker(`schedule-${m.key}`)}
                        disabled={locked}
                      />
                      <input
                        type="time"
                        value={m.time}
                        onChange={(e) =>
                          updateScheduleMatch(m.key, { time: e.target.value })
                        }
                        disabled={locked}
                        aria-label={`${idx + 1}경기 시간`}
                        className={`${pillInput} min-w-0 box-border font-num tabular-nums disabled:opacity-60`}
                      />
                    </div>
                    {/* 경기별 장소 — 입력 문구로 저장된 링크장 검색(대회장소 패턴). 비우면 대회 장소 사용. */}
                    <div className="relative mt-2">
                      <input
                        type="text"
                        value={m.venueQuery}
                        onChange={(e) =>
                          updateScheduleMatch(m.key, {
                            venueQuery: e.target.value,
                            ...(m.venueId ? { venueId: "" } : {}),
                          })
                        }
                        disabled={locked}
                        placeholder="경기 장소 찾아보기 (비우면 대회 장소)"
                        aria-label={`${idx + 1}경기 장소 검색`}
                        className={`${pillInput} disabled:opacity-60`}
                      />
                      {!m.venueId && m.venueQuery.trim() && (() => {
                        const list = filterVenuesByQuery(m.venueQuery);
                        return (
                          <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-40 divide-y divide-it-line overflow-y-auto rounded-w-md border-[1.5px] border-it-line-strong bg-it-surface shadow-sh-2 dark:divide-rink-700 dark:border-rink-700 dark:bg-rink-800">
                            {list.length > 0 ? (
                              list.map((v) => (
                                <li key={v.id}>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateScheduleMatch(m.key, {
                                        venueId: v.id,
                                        venueQuery: v.name,
                                      })
                                    }
                                    className="w-full px-3 py-2.5 text-left text-w-body font-medium text-it-ink-800 transition-colors motion-reduce:transition-none hover:bg-it-fill dark:text-white dark:hover:bg-rink-700/40"
                                  >
                                    {v.name}
                                  </button>
                                </li>
                              ))
                            ) : (
                              <li className="px-3 py-2.5 text-w-caption text-it-ink-500 dark:text-rink-300">
                                &ldquo;{m.venueQuery.trim()}&rdquo; 검색 결과가 없습니다
                              </li>
                            )}
                          </ul>
                        );
                      })()}
                    </div>
                  </li>
                  );
                })}
              </ul>
            )}
            <button
              type="button"
              onClick={addScheduleMatch}
              className="mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-w-md border border-dashed border-it-blue-500/50 text-w-small font-bold text-it-blue-500 transition-colors motion-reduce:transition-none hover:bg-it-blue-50"
            >
              <Icon name="add" className="text-w-title" aria-hidden="true" />
              경기 추가
            </button>
          </SectionCard>

          {/* validation alert + 등록 버튼 — flat 흰 섹션 */}
          <div className="bg-it-surface dark:bg-it-blue-950 px-4 py-4 flex flex-col gap-3">
          {hasAttempted && validationError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-w-md border border-it-red-200 bg-it-red-50 dark:bg-it-red-500/10 px-3 py-3"
            >
              <Icon
                name="error_outline"
                className="mt-0.5 text-w-body-lg text-it-red-500"
                aria-hidden="true"
              />
              <p className="text-w-caption font-medium leading-relaxed text-it-red-700 dark:text-it-red-300">
                {validationError}
              </p>
            </div>
          )}

          {/* [수정 2026-05-30] 등록 버튼을 viewport fixed → form 콘텐츠 흐름 맨 아래로 이동 (사용자 요청).
              화면에 고정하지 않고 스크롤 끝에서 자연스럽게 노출. form 내부 버튼이므로 type="submit"
              만으로 submit (외부 form 속성 불필요), Enter 키 submit 도 동일 동작.
              [수정 2026-05-30] 등록하기 버튼의 check 아이콘 제거 — 수정 모드(수정하기)만 edit 아이콘 유지. */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-w-md bg-it-blue-500 text-w-small font-bold text-white shadow-sh-1 transition-colors motion-reduce:transition-none hover:bg-it-blue-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40"
          >
            {submitting ? (
              <>
                <Icon
                  name="progress_activity"
                  className="animate-spin text-w-title motion-reduce:animate-none"
                  aria-hidden="true"
                />
                {isEditMode ? "수정 중..." : "등록 중..."}
              </>
            ) : (
              <>
                {isEditMode && (
                  <Icon
                    name="edit"
                    className="text-w-title"
                    aria-hidden="true"
                  />
                )}
                {isEditMode ? "수정하기" : "등록하기"}
              </>
            )}
          </button>
          </div>
        </form>
      </main>

      {/* [2026-06-16] 참가 선수 선택 전용 바텀 시트 — 공통 BottomSheet 기반.
          폼 안 SectionCard 의 [선택] 트리거로 열리며 selectedPlayerIds 를 라이브 토글한다.
          포털/ESC/scroll-lock/scrim/애니메이션은 BottomSheet 가 내장 처리한다. */}
      <ParticipantPickerSheet
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        teamMembers={teamMembers}
        teamGroups={teamGroups}
        birthYearChips={birthYearChips}
        playersByYear={playersByYear}
        playersByGroup={playersByGroup}
        selectedPlayerIds={selectedPlayerIds}
        onToggle={togglePlayer}
        onToggleAll={toggleAllPlayers}
      />

      {/* [추가 2026-05-30] 날짜 선택 공통 모달 — 경기 일정(schedule-{key}) 날짜 단일 인스턴스.
          · createPortal(document.body) 렌더라 SectionCard 의 overflow-hidden 영향을 받지 않음.
          · [2026-06-16] 대회 기간(start/end) 수동 입력 제거 — 경기 일정 날짜만 선택. */}
      <DatePickerModal
        isOpen={openPicker !== null}
        value={
          openPicker?.startsWith("schedule-")
            ? (scheduleMatches.find((m) => m.key === openPicker.slice(9))?.date ?? "")
            : ""
        }
        ariaLabel="경기 날짜 선택"
        minDate={scheduleMinDate}
        onClose={() => setOpenPicker(null)}
        onSelect={(iso) => {
          if (openPicker?.startsWith("schedule-")) {
            updateScheduleMatch(openPicker.slice(9), { date: iso });
          }
        }}
      />
    </MobileContainer>
  );
}

function SectionCard({
  icon,
  title,
  description,
  children,
  overflowVisible = false,
}: {
  icon: string;
  title: string;
  description: string;
  children: React.ReactNode;
  /** [2026-06-19] 카드 내부 absolute 드롭다운(장소 찾아보기 목록)이 잘리지 않도록 overflow 허용.
   *  date/number input 이 없는 카드(예: 기본 정보)에서만 안전하게 사용. */
  overflowVisible?: boolean;
}) {
  // [수정 W2.D 2026-05-18 #9/#10] overflow-hidden — 자식 input(date/number) 의 intrinsic
  //   min-content 가 카드 영역 밖으로 넘치는 회귀를 카드 단위에서 한 번 더 차단.
  // ICETIMES flat — 카드 박스(rounded/border/shadow) 제거, full-bleed 흰 섹션.
  return (
    <section
      className={`bg-it-surface px-4 py-4 dark:bg-it-blue-950 ${overflowVisible ? "overflow-visible" : "overflow-hidden"}`}
    >
      {/* [수정 2026-05-30] 섹션 헤더 아이콘 배경 박스(bg-ice-500/10 · rounded-xl) 제거 — 사용자 요청.
          아이콘만 인라인 배치하고 제목 라인에 맞춰 mt-0.5 정렬. */}
      <div className="mb-4 flex items-start gap-2.5">
        <Icon name={icon} className="mt-0.5 shrink-0 text-[22px] text-it-blue-500" aria-hidden="true" />
        <div className="flex min-w-0 flex-col">
          <h3 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white">
            {title}
          </h3>
          <p className="mt-0.5 text-w-caption leading-snug text-it-ink-500 dark:text-rink-300">
            {description}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3 min-w-0">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-w-caption font-bold text-it-ink-600 dark:text-rink-100">
        {label}
        {required && (
          <span className="ml-0.5 text-it-red-500" aria-label="필수">
            *
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

/**
 * 참가대상 선수 1행(체크박스) — 시트의 평면 리스트·섹션 양쪽에서 공용.
 *   checked 는 selectedPlayerIds.has(userId) 단일 참조 → 같은 선수가 연도·그룹 양쪽
 *   섹션에 나와도 동일 상태로 표시된다(중복 선수 단일 상태).
 */
function PlayerRow({
  member,
  checked,
  onToggle,
}: {
  member: TeamMemberRow;
  checked: boolean;
  onToggle: (userId: string) => void;
}) {
  return (
    <label
      className={`flex items-center gap-3 rounded-w-md px-2 py-2.5 cursor-pointer transition-colors motion-reduce:transition-none ${
        checked
          ? "bg-it-blue-50 dark:bg-it-blue-500/10"
          : "hover:bg-it-fill dark:hover:bg-rink-800"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(member.userId)}
        className="h-4 w-4 rounded border-it-line-strong text-it-blue-500 focus:ring-it-blue-500/30"
      />
      <span className="flex-1 min-w-0 truncate text-w-small font-extrabold text-it-ink-800 dark:text-white">
        {playerLabel(member)}
      </span>
      {typeof member.playerAge === "number" && (
        <span className="shrink-0 text-w-caption tabular-nums text-it-ink-400 dark:text-rink-300">
          {member.playerAge}세
        </span>
      )}
    </label>
  );
}

/**
 * 참가 선수 선택 전용 바텀 시트 — 공통 BottomSheet 기반.
 *   · 껍데기(포털/ESC/오버레이클릭/scroll-lock/scrim/애니메이션/헤더/다크)는 BottomSheet 내장.
 *   · footer = 완료(N) 버튼(닫기). children = 검색 + 필터 드롭다운 + 전체선택 행 + 선택 칩 줄 + 단일 평면 리스트.
 *   · [2026-06-16] 이중 아코디언(출생연도·하위그룹 섹션) 제거 → 필터 드롭다운으로 좁히는 단일 평면 리스트.
 *     같은 선수가 연도·그룹에 겹쳐도 리스트에는 1회만 노출(중복 제거). 필터는 표시 대상만 좁힐 뿐 선택 SoT 불변.
 *   · 선택은 selectedPlayerIds 직접 라이브 토글(별도 draft 없음). 완료/닫기는 닫기만 수행.
 */
function ParticipantPickerSheet({
  isOpen,
  onClose,
  teamMembers,
  teamGroups,
  birthYearChips,
  playersByYear,
  playersByGroup,
  selectedPlayerIds,
  onToggle,
  onToggleAll,
}: {
  isOpen: boolean;
  onClose: () => void;
  teamMembers: TeamMemberRow[];
  teamGroups: TeamGroupSummary[];
  birthYearChips: Array<{ key: number | "unknown"; label: string }>;
  playersByYear: (year: number | "unknown") => TeamMemberRow[];
  playersByGroup: (groupId: string) => TeamMemberRow[];
  selectedPlayerIds: Set<string>;
  onToggle: (userId: string) => void;
  onToggleAll: (rows: TeamMemberRow[]) => void;
}) {
  const [search, setSearch] = useState("");
  // 분류 필터 — 'all' | 'year:{연도|unknown}' | 'group:{id}'. 리스트 표시 대상만 좁힌다(선택 SoT 불변).
  const [activeFilter, setActiveFilter] = useState<string>("all");
  // [2026-06-16] 분류 세그먼트 — 'all'(전원) | 'year'(연도 칩) | 'group'(그룹 칩). 선택 세그먼트의 칩만 노출.
  const [filterTab, setFilterTab] = useState<"all" | "year" | "group">("all");

  // 오픈 시 검색어·세그먼트·필터 초기화 (스크롤 잠금·ESC·scrim 은 BottomSheet 내장 처리).
  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setFilterTab("all");
      setActiveFilter("all");
    }
  }, [isOpen]);

  // 세그먼트 전환 — 탭을 바꾸면 칩 미선택 상태(activeFilter='all')로 초기화한다.
  //   연도/그룹 탭으로 가면 전원 표시, 칩을 탭해야 그 분류로 좁혀진다.
  const handleSegmentChange = useCallback((tab: "all" | "year" | "group") => {
    setFilterTab(tab);
    setActiveFilter("all");
  }, []);

  // 선택된 선수 칩 — 멤버 목록에 존재하는 선택자만(팀 이탈 orphan 은 폼 안내에서 처리).
  const selectedMembers = useMemo(
    () => teamMembers.filter((m) => selectedPlayerIds.has(m.userId)),
    [teamMembers, selectedPlayerIds],
  );

  // 현재 필터+검색에 해당하는 선수(평면, 각 1회). 필터로 base 를 좁힌 뒤 이름 부분일치로 거른다.
  //   year/group 분류는 모두 teamMembers 의 부분집합이라 base 자체에 중복이 없다(단일 노출 보장).
  const filteredPlayers = useMemo(() => {
    let base: TeamMemberRow[];
    if (activeFilter.startsWith("year:")) {
      const raw = activeFilter.slice(5);
      const year: number | "unknown" =
        raw === BIRTH_YEAR_UNKNOWN ? BIRTH_YEAR_UNKNOWN : Number(raw);
      base = playersByYear(year);
    } else if (activeFilter.startsWith("group:")) {
      base = playersByGroup(activeFilter.slice(6));
    } else {
      base = teamMembers;
    }
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((m) => playerLabel(m).toLowerCase().includes(q));
  }, [activeFilter, search, teamMembers, playersByYear, playersByGroup]);

  // 전체선택 행 — 현재 표시 대상 기준 선택/전체 카운트 + all-selected 상태.
  const visibleSelectedCount = useMemo(
    () => filteredPlayers.filter((m) => selectedPlayerIds.has(m.userId)).length,
    [filteredPlayers, selectedPlayerIds],
  );
  const allVisibleSelected =
    filteredPlayers.length > 0 &&
    visibleSelectedCount === filteredPlayers.length;

  const doneCount = selectedPlayerIds.size;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={MESSAGES.tournament.participantPickerTitle}
      maxHeight="85vh"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="flex h-12 w-full items-center justify-center rounded-w-md bg-it-blue-500 text-w-small font-bold text-white transition-colors motion-reduce:transition-none hover:bg-it-blue-600 active:scale-[0.98]"
        >
          {MESSAGES.tournament.participantPickerDone(doneCount)}
        </button>
      }
    >
      {/* 검색 입력 */}
      <div className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-w-body-lg text-it-ink-400"
          aria-hidden="true"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={MESSAGES.tournament.participantSearchPlaceholder}
          aria-label={MESSAGES.tournament.participantSearchPlaceholder}
          className={`${pillInput} pl-10`}
        />
      </div>

      {/* [2026-06-16] 분류 세그먼트(전체/연도/그룹) — 선택 세그먼트의 칩만 그 아래 노출.
          활성 세그먼트는 배경 채움(bg-wsurface text-ice-500)으로만 구분(파이프·divide-x·border-l/r 없음, RULE-D04). */}
      {teamMembers.length > 0 && (
        <>
          <div
            role="tablist"
            aria-label={MESSAGES.tournament.participantPickerTitle}
            className="mt-3 grid grid-cols-3 gap-1 rounded-w-md bg-it-fill border-[1.5px] border-it-line-strong p-1 dark:border-rink-700 dark:bg-rink-800"
          >
            {(
              [
                ["all", MESSAGES.tournament.participantSegmentAll],
                ["year", MESSAGES.tournament.participantSegmentYear],
                ["group", MESSAGES.tournament.participantSegmentGroup],
              ] as const
            ).map(([tab, label]) => {
              const active = filterTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => handleSegmentChange(tab)}
                  className={`flex h-9 items-center justify-center rounded-w-sm text-w-caption font-extrabold transition-colors motion-reduce:transition-none ${
                    active
                      ? "bg-it-surface text-it-blue-500 shadow-sh-1 dark:bg-rink-900"
                      : "text-it-ink-600 hover:text-it-ink-800 dark:text-rink-300 dark:hover:text-white"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* 선택 세그먼트의 칩만 노출 — 전체 탭은 칩 행 없음(전원 표시).
              nowrap·shrink-0 로 줄바꿈 없이 한 줄 가로 스크롤. 칩 탭 시 activeFilter 로 좁힌다(선택 SoT 불변). */}
          {filterTab !== "all" &&
            (() => {
              const chips: Array<{ value: string; label: string }> =
                filterTab === "year"
                  ? birthYearChips.map((chip) => ({
                      value: `year:${chip.key}`,
                      label: chip.label,
                    }))
                  : teamGroups.map((g) => ({
                      value: `group:${g.id}`,
                      label: g.name,
                    }));
              if (chips.length === 0) return null;
              return (
                <div className="mt-3 flex flex-nowrap gap-2 overflow-x-auto pb-1 hide-scrollbar">
                  {chips.map((chip) => {
                    const active = activeFilter === chip.value;
                    return (
                      <button
                        key={chip.value}
                        type="button"
                        onClick={() => setActiveFilter(chip.value)}
                        aria-pressed={active}
                        className={`shrink-0 whitespace-nowrap rounded-w-pill border-[1.5px] px-3.5 py-1.5 text-w-caption font-extrabold transition-colors motion-reduce:transition-none ${
                          active
                            ? "border-it-blue-500 bg-it-blue-50 text-it-blue-500 dark:bg-it-blue-500/15"
                            : "border-it-line-strong bg-it-surface text-it-ink-600 hover:border-it-ink-300 dark:border-rink-700 dark:bg-rink-800 dark:text-rink-100"
                        }`}
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
        </>
      )}

      {/* 선택 칩 줄 — 0명이면 숨김. × 탭 시 해당 선수 해제. */}
      {selectedMembers.length > 0 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
          {selectedMembers.map((m) => (
            <li key={m.userId} className="shrink-0">
              <button
                type="button"
                onClick={() => onToggle(m.userId)}
                aria-label={`${playerLabel(m)} 선택 해제`}
                className="flex items-center gap-1 rounded-w-pill border-[1.5px] border-it-blue-500/40 bg-it-blue-50 py-1.5 pl-3 pr-2 text-w-caption font-extrabold text-it-blue-500 transition-colors motion-reduce:transition-none hover:bg-it-blue-100 dark:bg-it-blue-500/15"
              >
                <span className="max-w-[7rem] truncate">{playerLabel(m)}</span>
                <Icon name="close" className="text-base" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 선수 목록 — 전체선택 행(고정) + 단일 평면 리스트(내부 스크롤).
          [2026-06-16] 리스트 영역 고정 높이(h-[50vh]) — 필터로 인원이 1명이든 30명이든
          시트 전체 높이가 일정하게 유지된다(적으면 여백, 많으면 내부 스크롤). 전체선택 행은
          리스트 상단에 고정하고 그 아래 선수 목록만 스크롤한다. */}
      <div className="mt-3 h-[50vh]">
        {teamMembers.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="px-1 text-center text-w-caption text-it-ink-500 dark:text-rink-300">
              {MESSAGES.tournament.participantEmpty}
            </p>
          </div>
        ) : filteredPlayers.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="px-1 text-center text-w-caption text-it-ink-500 dark:text-rink-300">
              {MESSAGES.tournament.participantSearchEmpty}
            </p>
          </div>
        ) : (
          <div className="flex h-full flex-col rounded-w-md border-[1.5px] border-it-line-strong bg-it-fill dark:border-rink-700 dark:bg-rink-900/40">
            {/* 전체 선택 행 — 현재 표시 대상 기준 선택/전체 카운트 + 체크박스 아이콘으로 상태 표시(고정). */}
            <button
              type="button"
              onClick={() => onToggleAll(filteredPlayers)}
              aria-pressed={allVisibleSelected}
              className="flex w-full shrink-0 items-center gap-2.5 border-b border-it-line px-3 py-3 text-left transition-colors motion-reduce:transition-none hover:bg-it-line/50 dark:border-rink-700 dark:hover:bg-rink-800"
            >
              <Icon
                name={allVisibleSelected ? "check_box" : "check_box_outline_blank"}
                className={`shrink-0 text-w-body-lg ${
                  allVisibleSelected ? "text-it-blue-500" : "text-it-ink-400"
                }`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-w-small font-extrabold text-it-ink-800 dark:text-white">
                {MESSAGES.tournament.participantSelectAllCount(
                  visibleSelectedCount,
                  filteredPlayers.length,
                )}
              </span>
            </button>
            <ul className="flex flex-1 flex-col overflow-y-auto px-1 py-1 hide-scrollbar">
              {filteredPlayers.map((m) => (
                <li key={m.userId}>
                  <PlayerRow
                    member={m}
                    checked={selectedPlayerIds.has(m.userId)}
                    onToggle={onToggle}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

// [제거 2026-05-11] HeroFeature — Hero 섹션과 함께 폐기.

function Hint({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <p
      className={`text-w-caption text-it-ink-500 dark:text-rink-300 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </p>
  );
}

// ICETIMES 컨테이너형 input — border 1.5px + bg-it-fill, 포커스 it-blue (SoT §3).
const pillInputBase =
  "w-full rounded-w-md border-[1.5px] border-it-line-strong bg-it-fill px-3 text-w-body text-it-ink-800 placeholder:text-it-ink-400 transition-colors motion-reduce:transition-none focus:border-it-blue-500 focus:bg-it-surface focus:outline-none dark:border-rink-700 dark:bg-rink-800 dark:text-white dark:placeholder:text-wtext-3 dark:focus:bg-rink-800";
// 단일 행 input — 고정 높이 h-11(44px).
const pillInput = `h-11 ${pillInputBase}`;
// 멀티라인 textarea — h-11 고정 높이 대신 4줄 기준 min-height 적용.
//   [수정 2026-05-30] pillInput(h-11)을 그대로 상속하면 rows={4} 가 무시되고 44px 단일행으로
//   강제되어 placeholder 텍스트가 상하 패딩에 밀려 "아래로 내려간 느낌"을 주던 회귀 차단.
//   pt-2.5/pb-3 로 텍스트가 박스 상단에서 자연스럽게 시작하도록 조정.
const pillTextarea = `min-h-[7.5rem] pt-2.5 pb-3 leading-relaxed resize-none ${pillInputBase}`;

// [2026-06-16] parseLocalDate 제거 — 대회 기간(start/end) 수동 입력 폐기로 minDate prop 미사용.

// [추가 2026-05-30] 날짜 선택 트리거 버튼 — 네이티브 date input 대체.
//   클릭 시 DatePickerModal(공통 달력) 오픈. pillInput 과 동일한 필 스타일로 다른 입력과 정렬.
function DateTriggerButton({
  value,
  placeholder,
  ariaLabel,
  isOpen,
  onOpen,
  disabled,
}: {
  value: string;
  placeholder: string;
  ariaLabel: string;
  isOpen: boolean;
  onOpen: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      aria-label={ariaLabel}
      className={`${pillInput} flex min-w-0 items-center justify-between gap-2 text-left disabled:opacity-60 disabled:cursor-not-allowed`}
    >
      <span
        className={`truncate font-num tabular-nums ${
          value ? "font-bold text-it-ink-800 dark:text-white" : "text-it-ink-400"
        }`}
      >
        {value ? formatDateLabel(value) : placeholder}
      </span>
      <Icon
        name="calendar_today"
        className="shrink-0 text-base text-it-ink-400"
        aria-hidden="true"
      />
    </button>
  );
}
