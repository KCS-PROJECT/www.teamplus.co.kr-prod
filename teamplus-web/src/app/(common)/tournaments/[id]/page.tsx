"use client";

/**
 * Tournament Detail Page (공통 — 모든 인증 사용자)
 *
 * 레퍼런스: 사용자 제공 HTML "대회 상세 및 대진표"
 *
 * 구조:
 *  - Sticky Header (arrow_back + 공유)
 *  - TournamentHeroSection
 *  - 3×Quick Action Grid (규정/장소/상금)
 *  - Info List (장소/참가비/방식)
 *  - Tabs (대진표 · 순위 · 경기 일정)
 *  - BracketVisualizer
 *  - Sticky Bottom CTA (관리자=대회 수정 / 일반=참가 신청)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { usePageReady } from '@/hooks/usePageReady';
import { cn } from "@/lib/utils";
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { useNavigation } from "@/components/ui/NavLink";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useToast } from "@/components/ui/Toast";
import { useNativeUI } from "@/hooks/useNativeUI";
import { MESSAGES } from "@/lib/messages";
import { formatEligibleBirthYearsLabel } from "@/lib/gradeToBirthYear";
import { TournamentHeroSection, ChildPaymentRow } from "@/components/tournament";
import {
  calculateDDay,
  canManageMatch,
  cancelTournamentRegistration,
  confirmTournamentSettlement,
  deleteTournament,
  cancelTournamentSettlement,
  getTournament,
  listTournamentRegistrations,
  mapTournamentUiStatus,
  canCancelTournamentRegistration,
  buildTournamentChildOptions,
  isTournamentChildApplicable,
  type MatchSummary,
  type TournamentDetail,
  type TournamentRegistrationRow,
  type TournamentUiStatus,
} from "@/services/tournament.service";
import { useModal } from "@/components/ui/Modal";
import { api } from "@/services/api-client";
import { getTeamMembers } from "@/services/team.service";

// [2026-06-08] 대진표/순위 탭 제거 — 경기일정만 표시(Tab 타입 불필요).

// 후불 결제요청 활성화 대기 — 경기 시간이 30분~1시간이라 마지막 경기 시작 +1시간부터 종료로 본다.
const SETTLE_OPEN_DELAY_MS = 60 * 60 * 1000;

// [2026-07-21] 대회 축 5-state·결제방식 배지 — 수업 축(classes/[id]/students) TIMING_META/
//   ROW_STATUS_META 값·토큰·MESSAGES 라벨을 동일 재사용(단일 SoT). 대회는 BOTH/UNASSIGNED 없음.
type TournamentBillingStatus =
  | "UNSETTLED"
  | "BILLED"
  | "PAID"
  | "CANCELLED"
  | "REFUNDED";
type TournamentBillingTiming = "PREPAID" | "POSTPAID";

const ROW_STATUS_META: Record<
  TournamentBillingStatus,
  { label: string; chip: string; dot: string }
> = {
  PAID: {
    label: MESSAGES.settlement.rowStatusPaid,
    chip: "bg-mint-100 text-rink-800 dark:bg-mint-500/20 dark:text-mint-100",
    dot: "bg-mint-500",
  },
  BILLED: {
    label: MESSAGES.settlement.rowStatusBilled,
    chip: "bg-ice-500/10 text-ice-500 dark:bg-ice-500/20 dark:text-ice-100",
    dot: "bg-ice-500",
  },
  UNSETTLED: {
    label: MESSAGES.settlement.rowStatusUnsettled,
    chip: "bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-100",
    dot: "bg-wtext-3",
  },
  CANCELLED: {
    label: MESSAGES.settlement.rowStatusCancelled,
    chip: "bg-wline-2 text-wtext-3 dark:bg-rink-700 dark:text-rink-300",
    dot: "bg-wtext-4",
  },
  REFUNDED: {
    label: MESSAGES.settlement.rowStatusRefunded,
    chip: "bg-wline-2 text-wtext-3 dark:bg-rink-700 dark:text-rink-300",
    dot: "bg-wtext-4",
  },
};

const TIMING_META: Record<
  TournamentBillingTiming,
  { label: string; cls: string }
> = {
  PREPAID: {
    label: MESSAGES.settlement.prepaid,
    cls: "bg-ice-500/10 text-ice-500 dark:bg-ice-500/15 dark:text-ice-100",
  },
  POSTPAID: {
    label: MESSAGES.settlement.postpaid,
    cls: "bg-sun-500/15 text-rink-800 dark:bg-sun-500/20 dark:text-sun-100",
  },
};

export default function CommonTournamentDetailPage() {
  const { user } = useSessionAuth();
  const params = useParams();
  const { navigate } = useNavigation();
  const { toast } = useToast();
  const { modal } = useModal();
  const isManager = canManageMatch(user?.userType);

  const id = (params?.id ?? "") as string;

  const [tournament, setTournament] = useState<TournamentDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // [2026-06-16] 후불 정산 모달 — 1인당 참가비 입력 + 대상 인원 미리보기.
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleFee, setSettleFee] = useState("");
  const [settleTargetCount, setSettleTargetCount] = useState<number | null>(null);
  const [settleSubmitting, setSettleSubmitting] = useState(false);

  // [2026-06-17] 감독 — 참가선수목록(후불 결제 현황). 경기일정 밑 노출.
  const [regRows, setRegRows] = useState<TournamentRegistrationRow[]>([]);
  // 선택 결제요청 — 체크한 등록(registrationId)에게만 청구. 정산 전(UNPAID)만 체크 대상
  //   (PENDING 재청구는 행 단위 "금액 수정"으로 분리 — 반복 결제요청 방지).
  const [selectedRegIds, setSelectedRegIds] = useState<Set<string>>(new Set());
  // 정산 모달의 실제 청구 대상 — 결제요청(선택 목록) / 금액 수정(단건) 공용.
  const [settleTargetIds, setSettleTargetIds] = useState<string[]>([]);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  // [2026-06-08] 대진표/순위 탭 제거 — 경기일정만 표시하므로 tab 상태 불필요.

  useNativeUI({
    showStatusBar: true,
    showAppBar: false, // 커스텀 헤더 사용
    showBottomNav: true,
    showBackButton: true,
  });

  const load = useCallback(async () => {
    if (!id) return;
    // 예약어 가드: /tournaments/create, /tournaments/edit 등이
    // [id] 동적 라우트로 잘못 매칭되어 존재하지 않는 ID로 API 호출되는 것 차단
    // (해당 경로는 정적 page.tsx가 있을 때만 우선 매칭됨 — 없으면 이 가드가 재발 방지)
    const RESERVED_IDS = ["create", "new", "edit"];
    if (RESERVED_IDS.includes(id)) {
      navigate("/tournaments");
      return;
    }
    setIsLoading(true);
    const res = await getTournament(id);
    if (res.success && res.data) {
      setTournament(res.data);
    } else {
      toast.error(res.error?.message ?? MESSAGES.error.general);
    }
    setIsLoading(false);
  }, [id, toast, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  // [2026-06-17] 학부모 — 자녀별 대회 결제내역(선불 결제완료 + 후불 정산/결제 흐름).
  const [myRegRows, setMyRegRows] = useState<
    {
      id: string;
      name: string;
      registrationId: string;
      paymentStatus: string;
      amount: number;
      orderNumber: string | null;
    }[]
  >([]);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // [2026-06-16] 참가 대상 = selectedParticipantIds 명단(User.id).
  //  · 감독/코치: 팀 멤버 조회 → 대상 선수 이름(playerName) 목록 + 전체 명단 시트.
  //  · 학부모/학생: 본인 자녀 중 대상 자녀 이름만(타 자녀 이름 노출 금지).
  const [participantNames, setParticipantNames] = useState<string[]>([]);
  const [playersSheetOpen, setPlayersSheetOpen] = useState(false);

  // 내 자녀 목록 — 학부모 시점 1회 조회 후 결제내역 이름 매핑·참가대상 이름·신청 가능 판정이 공유.
  //   (기존: 결제내역/참가대상이 각자 /children 을 중복 호출 → 단일 state 로 통합)
  const [myChildren, setMyChildren] = useState<Array<{
    id: string;
    firstName?: string;
    lastName?: string;
    birthDate?: string | null;
  }> | null>(null);

  useEffect(() => {
    if (isManager || !user?.id) return;
    void (async () => {
      const cRes = await api.get<
        | { children: Array<{ id: string; firstName?: string; lastName?: string; birthDate?: string | null }> }
        | Array<{ id: string; firstName?: string; lastName?: string; birthDate?: string | null }>
      >("/children");
      const list = cRes.success && cRes.data
        ? Array.isArray(cRes.data)
          ? cRes.data
          : (cRes.data.children ?? [])
        : [];
      setMyChildren(list);
    })();
  }, [isManager, user?.id]);

  const loadMyRegistrations = useCallback(async () => {
    if (isManager || !tournament) {
      setMyRegRows([]);
      return;
    }
    const regs = tournament.myRegistrations ?? [];
    if (regs.length === 0) {
      setMyRegRows([]);
      return;
    }
    if (myChildren === null) return; // 자녀 목록 로딩 전 — 이름 미상("본인") 플래시 방지
    const childrenList = myChildren;
    const nameMap = new Map(
      childrenList.map((c) => [
        c.id,
        `${c.lastName ?? ""}${c.firstName ?? ""}`.trim() || "자녀",
      ]),
    );
    setMyRegRows(
      regs.map((r) => ({
        id: r.participantId,
        name: nameMap.get(r.participantId) ?? "본인",
        registrationId: r.registrationId,
        paymentStatus: r.paymentStatus,
        amount: r.amount,
        orderNumber: r.orderNumber,
      })),
    );
  }, [isManager, tournament, myChildren]);

  useEffect(() => {
    void loadMyRegistrations();
  }, [loadMyRegistrations]);

  // [2026-06-17] 감독 — 참가선수목록. 선불·후불 모두 로드(DP2 게이트 완화).
  //   [2026-07-21] billingMode 조건 제거 → 선불 대회 감독도 신청·결제 현황 조회.
  //     CANCELLED/REFUNDED 필터 제거 → 취소·환불 명단 보존(행 배지로 상태 구분).
  const loadRegRows = useCallback(async () => {
    if (!isManager || !tournament) {
      setRegRows([]);
      return;
    }
    const res = await listTournamentRegistrations(id);
    if (res.success && res.data) {
      setRegRows(res.data.registrations ?? []);
    } else {
      setRegRows([]);
    }
  }, [isManager, tournament, id]);

  useEffect(() => {
    void loadRegRows();
  }, [loadRegRows]);

  // [2026-07-21] DP4 — 해시 앵커(#participants·#settlement) 진입 스크롤.
  //   데이터·regRows 렌더 완료 후 대상 요소로 scrollIntoView(하드코딩 px/좌표 금지).
  //   #settlement 이 없는 선불 대회는 #participants 로 폴백. 요소 없으면 no-op(학부모 등).
  const hashScrolledRef = useRef(false);
  useEffect(() => {
    if (isLoading || !tournament) return;
    if (typeof window === "undefined") return;
    if (hashScrolledRef.current) return;
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    let el = document.getElementById(hash);
    if (!el && hash === "settlement") el = document.getElementById("participants");
    if (!el) return; // 대상 섹션 미렌더 — regRows 로드 후 재시도, 끝내 없으면 no-op
    hashScrolledRef.current = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [isLoading, tournament, regRows]);

  // [2026-06-16] 참가 대상 명단 해석 — 역할별 조건부 fetch(불필요한 호출 회피).
  const loadParticipantNames = useCallback(async () => {
    if (!tournament) {
      setParticipantNames([]);
      return;
    }
    const ids = Array.isArray(tournament.selectedParticipantIds)
      ? tournament.selectedParticipantIds
      : [];
    if (ids.length === 0) {
      setParticipantNames([]);
      return;
    }
    const idSet = new Set(ids);

    if (isManager) {
      // 감독/코치: 팀 멤버에서 대상 선수 이름(playerName) 해석. teamId 없으면 이름 생략.
      if (!tournament.teamId) {
        setParticipantNames([]);
        return;
      }
      const res = await getTeamMembers(tournament.teamId);
      if (res.success && res.data) {
        const names = res.data.members
          .filter((m) => idSet.has(m.userId))
          .map(
            (m) =>
              m.playerName?.trim() ||
              `${m.user?.lastName ?? ""}${m.user?.firstName ?? ""}`.trim() ||
              MESSAGES.tournament.participantNameUnknown,
          );
        setParticipantNames(names);
      } else {
        setParticipantNames([]);
      }
      return;
    }

    // 학부모/학생: 본인 자녀 중 대상 자녀 이름만(타 자녀 노출 금지).
    if (myChildren === null) return; // 자녀 목록 로딩 전
    const names = myChildren
      .filter((c) => idSet.has(c.id))
      .map(
        (c) =>
          `${c.lastName ?? ""}${c.firstName ?? ""}`.trim() ||
          MESSAGES.tournament.participantNameUnknown,
      );
    setParticipantNames(names);
  }, [isManager, tournament, myChildren]);

  useEffect(() => {
    void loadParticipantNames();
  }, [loadParticipantNames]);

  // [신청 가능 자녀 판정] 신청 페이지와 동일 규칙(공용 util) — 남은 자녀가 없으면 CTA 비활성.
  const applyOptions = useMemo(
    () =>
      !isManager && tournament && myChildren
        ? buildTournamentChildOptions(tournament, myChildren)
        : null,
    [isManager, tournament, myChildren],
  );
  // 참가 신청 마감 — 첫 경기 시작 후에는 신청 불가(백엔드 registerTournament 가드와 동일 기준).
  const firstMatchStarted = useMemo(() => {
    const times = (tournament?.matches ?? [])
      .map((m) => new Date(m.scheduledAt).getTime())
      .filter((t) => !Number.isNaN(t));
    return times.length > 0 && Math.min(...times) <= Date.now();
  }, [tournament]);
  const applyDisabledReason = useMemo(() => {
    if (firstMatchStarted) return MESSAGES.tournament.applyClosedAfterStart;
    if (!applyOptions) return null; // 자녀 목록 로딩 전 — 기존 동작 유지
    if (applyOptions.some(isTournamentChildApplicable)) return null;
    // 자격 충족 자녀가 있는데 전원 신청·결제 완료 vs 대상 자녀 자체가 없음.
    return applyOptions.some((o) => o.isEligible)
      ? MESSAGES.tournament.applyAllChildrenDone
      : MESSAGES.tournament.applyNoEligibleChildren;
  }, [applyOptions, firstMatchStarted]);

  const handleCancelPayment = useCallback(
    async (childId: string, childName: string, registrationId: string) => {
      const ok = await modal.confirm({
        title: "대회 참가 취소",
        message: `${childName} 선수의 대회 참가를 취소하시겠습니까?\n결제 완료된 건은 환불 처리됩니다.`,
        confirmText: "참가 취소",
        cancelText: "닫기",
        variant: "danger",
      });
      if (!ok) return;
      setCancellingId(childId);
      const res = await cancelTournamentRegistration(id, registrationId);
      if (res.success) {
        toast.success("대회 참가가 취소되었습니다.");
        await load();
      } else {
        toast.error(res.error?.message ?? MESSAGES.error.general);
      }
      setCancellingId(null);
    },
    [id, modal, toast, load],
  );

  // [2026-06-17] 정산 시트 열기 — 이미 로드된 참가선수목록(regRows)에서 정산 대상(UNPAID/PENDING) 카운트.
  //   (기존: getTournamentRegistrations 재조회 → 응답이 배열이 아닌 {registrations} 객체라
  //    .filter 가 터져 카운트가 null 로 남아 "불러오는중"에서 멈추던 버그 수정.)
  // 참가선수목록 로드/갱신 시 정산 전(UNPAID) 대상만 기본 전체 선택.
  //   PENDING(결제 대기)은 기본 제외 — 이미 요청된 건의 반복 발송 방지.
  useEffect(() => {
    const payable = regRows
      .filter((r) => r.paymentStatus === "UNPAID")
      .map((r) => r.id);
    setSelectedRegIds(new Set(payable));
  }, [regRows]);

  const toggleRegSelection = useCallback((regId: string) => {
    setSelectedRegIds((prev) => {
      const next = new Set(prev);
      if (next.has(regId)) next.delete(regId);
      else next.add(regId);
      return next;
    });
  }, []);

  const openSettlement = useCallback(() => {
    // 감독이 대회 생성 시 입력한 참고 예상 금액(feePerGame)을 기본값으로 프리필 — 그대로/수정 확정.
    const prefill =
      tournament?.feePerGame != null ? Number(tournament.feePerGame) : 0;
    setSettleFee(Number.isFinite(prefill) && prefill > 0 ? String(prefill) : "");
    // 정산 대상 = 체크된 등록(UNPAID) 목록.
    setSettleTargetIds([...selectedRegIds]);
    setSettleTargetCount(selectedRegIds.size);
    setSettleOpen(true);
  }, [selectedRegIds, tournament]);

  // PENDING(결제 대기) 단건 금액 수정 — 현재 청구액 프리필, 해당 등록 1건만 재청구.
  const openAmountEdit = useCallback(
    (row: TournamentRegistrationRow) => {
      const current = row.calculatedFee != null ? Number(row.calculatedFee) : 0;
      const prefill =
        Number.isFinite(current) && current > 0
          ? current
          : tournament?.feePerGame != null
            ? Number(tournament.feePerGame)
            : 0;
      setSettleFee(prefill > 0 ? String(prefill) : "");
      setSettleTargetIds([row.id]);
      setSettleTargetCount(1);
      setSettleOpen(true);
    },
    [tournament],
  );

  const handleConfirmSettlement = useCallback(async () => {
    const fee = Number(settleFee);
    if (!Number.isFinite(fee) || fee < 1) {
      toast.error(MESSAGES.tournament.settleFeeRequired);
      return;
    }
    if (!settleTargetCount || settleTargetCount < 1) {
      toast.error(MESSAGES.tournament.settleNoTarget);
      return;
    }
    setSettleSubmitting(true);
    const res = await confirmTournamentSettlement(id, fee, settleTargetIds);
    setSettleSubmitting(false);
    if (res.success && res.data) {
      toast.success(
        MESSAGES.tournament.settleSuccess(
          res.data.billedCount,
          res.data.totalAmount,
        ),
      );
      setSettleOpen(false);
      void load();
    } else {
      toast.error(res.error?.message ?? MESSAGES.error.general);
    }
  }, [id, settleFee, settleTargetCount, settleTargetIds, toast, load]);

  // [2026-06-17] 결제요청 취소 — 정산(결제요청)으로 청구한 미결제 건을 UNPAID 로 환원.
  const handleCancelSettlement = useCallback(async () => {
    const ok = await modal.confirm({
      title: "결제요청 취소",
      message:
        "참가자에게 보낸 결제 요청을 취소하시겠습니까?\n결제 완료된 건은 취소되지 않습니다.",
      confirmText: "결제요청 취소",
      cancelText: "닫기",
      variant: "danger",
    });
    if (!ok) return;
    const res = await cancelTournamentSettlement(id);
    if (res.success && res.data) {
      toast.success(
        `결제 요청이 취소되었습니다. (${res.data.revertedCount}명)`,
      );
      void load();
    } else {
      toast.error(res.error?.message ?? MESSAGES.error.general);
    }
  }, [id, modal, toast, load]);

  const uiStatus: TournamentUiStatus = useMemo(() => {
    if (!tournament) return "recruiting";
    return mapTournamentUiStatus(
      tournament.status,
      tournament.endDate,
    );
  }, [tournament]);

  // 종료/취소(또는 종료일 경과) 대회 — 수정 잠금 판정.
  const isEnded = uiStatus === "completed" || uiStatus === "cancelled";

  const dDay = useMemo(
    () =>
      tournament ? calculateDDay(tournament.registrationDeadline) : undefined,
    [tournament],
  );

  if (isLoading || !tournament) {
    return null;
  }

  // [수정 2026-05-15 T03 협업] tournament.location (신규 필드) 우선 사용.
  // [2026-06-22] 장소 폴백은 venue/rink 만 사용 — team.name/club.clubName(팀·클럽명)이
  //   장소 자리에 노출되던 버그 수정. 대회 전체 장소(venue?.name)를 우선 폴백에 포함.
  const location =
    tournament.location ??
    tournament.venue?.name ??
    tournament.rink?.location ??
    tournament.rink?.name ??
    "장소 추후 안내";
  // [수정 2026-05-15] 참가비 표시 — 빈칸/0 은 "무료"로 명시.
  //  · feePerGame === null 또는 0 → "무료" (사용자가 참가금액 비워서 등록)
  //  · feePerGame > 0 && feeType === "TOTAL_FIXED" → "30,000원" (단일 고정 참가비)
  //  · feePerGame > 0 && PER_GAME → "30,000원 / 경기"
  const feeValue = tournament.feePerGame != null ? Number(tournament.feePerGame) : 0;
  // 후불(POSTPAID): 감독이 입력한 경기당 참가비(feePerGame)가 있으면 금액을 노출,
  //   미입력 시에만 "후불 정산(종료 후 청구)" 문구로 폴백. 확정액은 종료 후 정산에서 결정.
  const isPostpaid = tournament.billingMode === "POSTPAID";
  const entryFee = isPostpaid
    ? feeValue > 0
      ? `${new Intl.NumberFormat("ko-KR").format(feeValue)}원`
      : MESSAGES.tournament.postpaidFeeLabel
    : feeValue <= 0
      ? "무료"
      : tournament.feeType === "TOTAL_FIXED"
        ? `${new Intl.NumberFormat("ko-KR").format(feeValue)}원`
        : `${new Intl.NumberFormat("ko-KR").format(feeValue)}원 / 경기`;
  // [추가 2026-05-11] 대회 기본 정보 표시용 가공값.
  const formatDateLong = (iso: string | null | undefined) => {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}.${m}.${day}`;
  };
  const startLabel = formatDateLong(tournament.startDate);
  const endLabel = formatDateLong(tournament.endDate);
  // 당일 대회(시작=종료)는 단일 날짜로 표기. 기간 null = 일정 미정 문구로 대체.
  const periodLabel =
    !tournament.startDate || !tournament.endDate
      ? MESSAGES.tournament.datesTbdLong
      : startLabel === endLabel
        ? startLabel
        : `${startLabel} ~ ${endLabel}`;
  // 참가 대상 = 선택 선수 명단(selectedParticipantIds) 스냅샷.
  //   · 감독/코치: 선수 이름 최대 5명 인라인 + "외 N명"(초과 시 전체 명단 시트).
  //   · 학부모/학생: 본인 자녀 중 대상 자녀 이름만.
  //   · 이름 미해석(teamId 없음 등) 시 "선수 N명" / 명단 없는 레거시 대회는 출생연도 라벨로 폴백.
  const participantCount = Array.isArray(tournament.selectedParticipantIds)
    ? tournament.selectedParticipantIds.length
    : 0;
  const ageGroupLabel = formatEligibleBirthYearsLabel(
    tournament.eligibleBirthYears,
    tournament.eligibleBirthYearFrom,
    tournament.eligibleBirthYearTo,
  );
  const INLINE_NAME_LIMIT = 5;
  // [2026-06-05 1단계] registrationDeadlineLabel / hostTeamLabel / selectedCount 제거
  //   — 모집마감/주최팀/참가인원 InfoRow 삭제로 미사용.

  return (
    <MobileContainer hasBottomNav>
      {/* [수정 2026-05-30] 공통 AppBar 가 스크롤 컨테이너(main) 내부에 있어 스크롤 시 함께
          내려가던 문제 수정 — PageAppBar 를 MobileContainer 직속(main 밖)으로 이동하여
          flex column 첫 항목으로 상단 고정. main 은 flex-1 자체 스크롤만 담당(표준 페이지 패턴). */}
      {/* [수정 2026-05-30] 공통 AppBar 표준 우측 액션 사용 — 사용자 요청.
          종전: extraActions 로 공유(share) 아이콘을 주입하여 우측이 [공유][☰] 로 렌더되고
                기본 알림(🔔)이 자동 숨김되던 오류. (PageAppBar isDetailLike 분기 정책)
          변경: extraActions 제거 → PageAppBar default(detail) 표준 패턴으로 폴백.
                showMy(알림)/showMenu(메뉴) 기본 true → 우측 [🔔 알림][☰ 메뉴] 노출. */}
      <PageAppBar title="대회 정보" forceNative />

      {/* [수정 2026-05-30] 페이지 진입 stagger 애니메이션(globals.css 의 slideUp) 비활성화 — 사용자 요청.
          data-no-enter 마커로 `main:not([data-no-enter])` selector 에서 제외 → 상세 정보가
          하단→상단으로 올라오지 않고 즉시 고정 표시(화면 멈춤). 이 페이지에만 적용(전역 영향 0). */}
      <main data-no-enter className="flex-1 min-h-0 overflow-y-auto bg-it-canvas dark:bg-puck">
      {/* Hero */}
      <TournamentHeroSection
        title={tournament.name}
        subtitle={tournament.club?.clubName ?? "아이스하키 대회"}
        startDate={tournament.startDate}
        endDate={tournament.endDate}
        status={uiStatus}
        dDay={dDay}
        iceTheme
      />

      {/* [2026-06-05 1단계] Quick Action(규정/장소/상금) + 규정/장소/상금 카드 박스 삭제.
          Info List 에서 모집마감/주최팀/방식/참가인원 행 삭제 — 대회기간/참가연령/장소/참가비만 유지.
          ICETIMES flat — 흰 섹션 래퍼(카드 박스 제거, hairline 행). */}
      <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 pt-3 pb-4">
        <InfoRow label="대회 기간" value={periodLabel} />
        <ParticipantTargetRow
          isManager={isManager}
          names={participantNames}
          totalCount={participantCount}
          inlineLimit={INLINE_NAME_LIMIT}
          fallbackLabel={ageGroupLabel}
          onShowAll={() => setPlayersSheetOpen(true)}
          onViewList={() =>
            document
              .getElementById("participants")
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
        />
        <InfoRow label="장소" value={location} />
        <InfoRow label="참가비" value={entryFee} />
        {tournament.description && (
          <div className="mt-3 rounded-w-md bg-it-fill dark:bg-rink-900/40 px-3 py-3">
            <p className="text-w-caption font-extrabold uppercase tracking-wider text-it-ink-400 dark:text-wtext-4 mb-1.5">
              대회 설명
            </p>
            <p className="text-w-small leading-relaxed text-it-ink-600 dark:text-rink-100 whitespace-pre-wrap">
              {tournament.description}
            </p>
          </div>
        )}
      </section>

      {/* [2026-06-05 1단계] 규정 / 장소 / 상금 카드 박스 섹션 삭제. */}

      {/* [2026-06-08] 대진표/순위 탭 제거 — 경기일정(대회일정)만 표시. */}
      {tournament.matches.length > 0 && (
        <>
          <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
          <div className="bg-it-surface dark:bg-it-blue-950">
            <div className="flex items-center gap-1.5 px-4 pt-3 pb-2">
              <Icon
                name="event_note"
                className="text-w-body text-it-blue-500"
                aria-hidden="true"
              />
              <h2 className="text-w-small font-bold text-it-ink-800 dark:text-white">
                {MESSAGES.tournament.tabs.schedule}
              </h2>
            </div>
            <div className="h-px w-full bg-it-line dark:bg-rink-700" />
          </div>

          <div className="bg-it-surface dark:bg-it-blue-950 px-0 py-4">
            <ScheduleTab
              matches={tournament.matches}
              hostTeamName={tournament.team?.name}
              fallbackVenueText={
                tournament.location ??
                tournament.venue?.name ??
                tournament.rink?.location ??
                tournament.rink?.name ??
                null
              }
            />
          </div>
        </>
      )}

      {/* [2026-06-17] 감독 — 참가선수목록. [2026-07-21] 선불=읽기전용 현황 / 후불=정산 확정 액션. */}
      {isManager && regRows.length > 0 && (() => {
        // 행 5-state·결제방식 해석 — BE Dual Emit 우선, 미제공 시 레거시 paymentStatus·대회 모드 폴백.
        const rowStatusOf = (r: TournamentRegistrationRow): TournamentBillingStatus =>
          r.billingStatus ??
          (r.paymentStatus === "PAID"
            ? "PAID"
            : r.paymentStatus === "PENDING"
              ? "BILLED"
              : r.paymentStatus === "CANCELLED"
                ? "CANCELLED"
                : r.paymentStatus === "REFUNDED"
                  ? "REFUNDED"
                  : "UNSETTLED");
        const rowTimingOf = (
          r: TournamentRegistrationRow,
        ): TournamentBillingTiming =>
          r.billingTiming ?? (isPostpaid ? "POSTPAID" : "PREPAID");
        // 활성 참가자(취소·환불 제외) — 카운트/정산 분모.
        const activeRows = regRows.filter((r) => {
          const s = rowStatusOf(r);
          return s !== "CANCELLED" && s !== "REFUNDED";
        });
        const needPay = regRows.filter(
          (r) => r.paymentStatus === "UNPAID" || r.paymentStatus === "PENDING",
        ).length;
        // 결제요청 취소 가능 — 정산됨(PENDING) 미결제 건이 있을 때.
        const pendingCount = regRows.filter(
          (r) => r.paymentStatus === "PENDING",
        ).length;
        // 종료 판정 — status='finished' 또는 마지막 경기 시작 +1시간 경과(결제요청 활성화).
        //   status 가 자동 전이되지 않으므로 시각 경과도 종료로 인정. 백엔드
        //   confirmTournamentSettlement 가드와 동일 기준.
        const isEnded = (() => {
          if (tournament.status === "finished") return true;
          if (tournament.status === "cancelled") return false;
          const matchTimes = (tournament.matches ?? [])
            .map((m) => new Date(m.scheduledAt).getTime())
            .filter((t) => !Number.isNaN(t));
          if (matchTimes.length > 0) {
            return Math.max(...matchTimes) + SETTLE_OPEN_DELAY_MS <= Date.now();
          }
          // 경기 미등록 폴백 — endDate 는 @db.Date(시각 없음)라 다음날 0시부터 종료.
          if (!tournament.endDate) return false;
          const end = new Date(tournament.endDate).getTime();
          if (Number.isNaN(end)) return false;
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return end < today.getTime();
        })();
        const nameOf = (r: TournamentRegistrationRow) =>
          r.child
            ? `${r.child.lastName ?? ""}${r.child.firstName ?? ""}`.trim() ||
              MESSAGES.tournament.participantNameUnknown
            : `${r.user?.lastName ?? ""}${r.user?.firstName ?? ""}`.trim() ||
              MESSAGES.tournament.participantNameUnknown;
        // 결제요청취소 — 요청에 따라 임시 숨김. 로직(pendingCount/handleCancelSettlement)은 보존.
        const SHOW_CANCEL_REQUEST = false;
        // 체크박스 선택 대상 = 정산 전(UNPAID)만(후불 정산 액션 전용).
        //   PENDING 은 행 단위 "금액 수정"으로 재청구 — 반복 결제요청 방지.
        const payableIds = regRows
          .filter((r) => r.paymentStatus === "UNPAID")
          .map((r) => r.id);
        const allPayableSelected =
          payableIds.length > 0 &&
          payableIds.every((pid) => selectedRegIds.has(pid));
        const toggleAllPayable = () =>
          setSelectedRegIds(
            allPayableSelected ? new Set() : new Set(payableIds),
          );
        return (
          <section
            id="participants"
            aria-label={MESSAGES.tournament.rosterSectionTitle}
            className="mt-2 bg-it-surface px-4 py-4 dark:bg-it-blue-950"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-card-title font-extrabold text-it-ink-800 dark:text-white">
                <Icon name="groups" className="text-[18px] text-it-ink-400" aria-hidden="true" />
                {MESSAGES.tournament.rosterSectionTitle}
              </h2>
              <span className="text-w-caption font-bold text-it-ink-400 dark:text-rink-300">
                {isPostpaid
                  ? MESSAGES.tournament.rosterPayNeeded(needPay, activeRows.length)
                  : MESSAGES.tournament.rosterParticipantCount(activeRows.length)}
              </span>
            </div>
            {isPostpaid && payableIds.length > 0 && (
              <label className="mb-1 flex w-fit cursor-pointer items-center gap-2 py-1.5 text-w-small font-bold text-it-ink-600 dark:text-rink-100">
                <input
                  type="checkbox"
                  checked={allPayableSelected}
                  onChange={toggleAllPayable}
                  aria-label={MESSAGES.tournament.rosterSelectAllAria}
                  className="h-[18px] w-[18px] shrink-0 cursor-pointer accent-it-blue-500"
                />
                <span>
                  {MESSAGES.tournament.participantSelectAllCount(
                    selectedRegIds.size,
                    payableIds.length,
                  )}
                </span>
              </label>
            )}
            <div className="flex flex-col">
              {regRows.map((r, idx) => {
                const rowStatus = rowStatusOf(r);
                const rowTiming = rowTimingOf(r);
                const statusMeta =
                  ROW_STATUS_META[rowStatus] ?? ROW_STATUS_META.UNSETTLED;
                const timingMeta = TIMING_META[rowTiming] ?? TIMING_META.PREPAID;
                // 정산 확정 액션(체크박스·금액수정)은 후불 대회만. 선불은 읽기전용.
                const checkable = isPostpaid && r.paymentStatus === "UNPAID";
                const editable = isPostpaid && r.paymentStatus === "PENDING";
                // 표시 금액 — 완납=결제 금액 / 청구=청구 금액. BE 파생 우선, 미제공 시 폴백.
                const rowFee =
                  r.billedAmount != null
                    ? Number(r.billedAmount)
                    : r.paidAmount != null && r.paidAmount > 0
                      ? Number(r.paidAmount)
                      : r.calculatedFee != null
                        ? Number(r.calculatedFee)
                        : r.payment?.amount != null
                          ? Number(r.payment.amount)
                          : 0;
                const amountLabel =
                  rowStatus === "PAID" && rowFee > 0
                    ? MESSAGES.tournament.settlePaidAmount(rowFee)
                    : rowStatus === "BILLED" && rowFee > 0
                      ? MESSAGES.tournament.settleBilledAmount(rowFee)
                      : null;
                return (
                  <div
                    key={r.id}
                    className={`flex items-center justify-between gap-3 py-3.5 ${
                      idx !== regRows.length - 1 ? "border-b border-it-line dark:border-rink-700" : ""
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {isPostpaid &&
                        (checkable ? (
                          <input
                            type="checkbox"
                            checked={selectedRegIds.has(r.id)}
                            onChange={() => toggleRegSelection(r.id)}
                            aria-label={MESSAGES.tournament.rosterRowCheckAria(
                              nameOf(r),
                            )}
                            className="h-[18px] w-[18px] shrink-0 cursor-pointer accent-it-blue-500"
                          />
                        ) : (
                          <span className="w-[18px] shrink-0" aria-hidden="true" />
                        ))}
                      <Icon name="person" className="text-[20px] text-it-ink-400" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-bold text-it-ink-800 dark:text-white">
                            {nameOf(r)}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 inline-flex items-center rounded-w-pill px-1.5 py-0.5 text-w-caption font-extrabold",
                              timingMeta.cls,
                            )}
                          >
                            {timingMeta.label}
                          </span>
                        </span>
                        {amountLabel && (
                          <span className="block text-w-caption text-it-ink-400 dark:text-rink-300 tabular-nums">
                            {amountLabel}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-w-pill px-2 py-0.5 text-w-caption font-extrabold",
                          statusMeta.chip,
                        )}
                      >
                        <span
                          className={cn("h-1.5 w-1.5 rounded-w-pill", statusMeta.dot)}
                          aria-hidden="true"
                        />
                        {statusMeta.label}
                      </span>
                      {editable && (
                        <button
                          type="button"
                          disabled={!isEnded}
                          title={
                            !isEnded
                              ? MESSAGES.tournament.settleAvailableAfterHour
                              : undefined
                          }
                          onClick={() => openAmountEdit(r)}
                          className="rounded-w-pill border border-it-line px-2.5 py-1 text-w-caption font-bold text-it-ink-600 hover:bg-it-fill disabled:opacity-40 dark:border-rink-700 dark:text-rink-100 dark:hover:bg-rink-700"
                        >
                          {MESSAGES.tournament.settleEditAmount}
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            {/* [2026-07-21] 정산 확정 액션(결제요청) — 후불 대회만. 선불은 읽기전용 현황.
                #settlement 앵커(팀 허브 detailPath 드릴다운 대상). */}
            {isPostpaid && (
              <div id="settlement" className="mt-3 flex flex-col items-end gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!isEnded || selectedRegIds.size === 0}
                  title={
                    !isEnded
                      ? MESSAGES.tournament.settleAvailableAfterHour
                      : undefined
                  }
                  onClick={() => void openSettlement()}
                >
                  {MESSAGES.tournament.settleRequestCta}
                </Button>
                {!isEnded && (
                  <p className="text-w-caption text-it-ink-400 dark:text-rink-300">
                    {MESSAGES.tournament.settleAvailableAfterHour}
                  </p>
                )}
                {SHOW_CANCEL_REQUEST && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-it-red-500 text-it-red-500 hover:border-it-red-500 hover:bg-it-red-50 dark:border-it-red-500 dark:text-it-red-300 dark:hover:bg-it-red-500/10"
                    disabled={pendingCount === 0}
                    onClick={() => void handleCancelSettlement()}
                  >
                    {MESSAGES.tournament.settleRequestCancelCta}
                  </Button>
                )}
              </div>
            )}
          </section>
        );
      })()}

      {/* [2026-06-17] 학부모 — 자녀별 대회 결제내역(선불 결제완료 + 후불 정산/결제). */}
      {(() => {
        // 선불은 결제완료(PAID)만, 후불은 신청 전 단계(정산 대기/결제 대기)까지 표시.
        const visibleRows = myRegRows.filter(
          (r) => r.paymentStatus === "PAID" || isPostpaid,
        );
        if (isManager || visibleRows.length === 0) return null;
        return (
          <section
            aria-label="자녀별 결제내역"
            className="mt-2 bg-it-surface px-4 py-4 dark:bg-it-blue-950"
          >
            <h2 className="mb-3 flex items-center gap-1.5 text-card-title font-extrabold text-it-ink-800 dark:text-white">
              <Icon name="receipt_long" className="text-[18px] text-it-ink-400" aria-hidden="true" />
              자녀별 결제내역
            </h2>
            <div className="flex flex-col">
              {visibleRows.map((c) => (
                <ChildPaymentRow
                  key={c.registrationId}
                  name={c.name}
                  amount={c.amount}
                  paymentStatus={c.paymentStatus}
                  orderNumber={c.orderNumber}
                  cancelling={cancellingId === c.id}
                  canCancel={canCancelTournamentRegistration(tournament.startDate)}
                  iceTheme
                  onPay={() => {
                    const params = new URLSearchParams({
                      orderNumber: c.orderNumber!,
                      amount: String(c.amount),
                      name: `${tournament.name} 참가비`,
                    });
                    navigate(`/payment/postpaid?${params.toString()}`);
                  }}
                  onCancel={() =>
                    handleCancelPayment(c.id, c.name, c.registrationId)
                  }
                />
              ))}
            </div>
          </section>
        );
      })()}

      {/* [수정 2026-05-30] 하단 액션 바를 viewport fixed → body(콘텐츠) 흐름 맨 아래로 이동 — 사용자 요청.
          화면에 고정하지 않고 스크롤 끝에서 자연 노출. */}
      <div className="w-full min-w-0 bg-it-surface px-4 pt-4 pb-6 dark:bg-it-blue-950 mt-2">
        {isManager ? (
          // [수정 2026-05-30] 대회 수정(파랑) : 삭제 = 6 : 4 — 수정 버튼을 더 크게(col-span-3 : col-span-2).
          //   공통 Button 통일 + 아이콘 제거. 위계: 삭제=outline(red) / 수정=primary(ice solid).
          <>
            {/* [2026-06-17] 후불 정산(결제요청)은 위 "참가선수목록" 섹션의 결제요청 버튼으로 통합. */}
            <div className="grid grid-cols-5 gap-2 w-full min-w-0">
            <Button
              variant="outline"
              size="lg"
              fullWidth
              className="col-span-2 border-it-red-500 text-it-red-500 hover:border-it-red-500 hover:bg-it-red-50 dark:border-it-red-500 dark:text-it-red-300 dark:hover:bg-it-red-500/10"
              onClick={async () => {
                const ok = await modal.confirm({
                  title: "대회 삭제",
                  message:
                    "이 대회를 삭제하시겠습니까?\n삭제된 대회는 복구할 수 없으며, 참가 신청도 모두 함께 삭제됩니다.",
                  confirmText: "삭제하기",
                  cancelText: "취소",
                  variant: "danger",
                });
                if (!ok) return;
                const res = await deleteTournament(id);
                if (res.success) {
                  toast.success(MESSAGES.tournament.deleteSuccess);
                  navigate("/tournaments");
                } else {
                  toast.error(res.error?.message ?? MESSAGES.error.general);
                }
              }}
            >
              대회 삭제
            </Button>
            {isEnded ? (
              <div className="col-span-3 flex items-center justify-center rounded-w-md border border-it-line-strong dark:border-rink-700 px-2 text-center text-w-caption font-semibold text-it-ink-500 dark:text-rink-300">
                {MESSAGES.tournament.endedNoEdit}
              </div>
            ) : (
              <Button
                variant="primary"
                size="lg"
                fullWidth
                className="col-span-3"
                onClick={() => navigate(`/tournaments/create?edit=${id}`)}
              >
                대회 수정
              </Button>
            )}
            </div>
          </>
        ) : applyDisabledReason ? (
          // 비활성 사유(신청 마감·대상 자녀 없음 등)는 행동이 아닌 상태 안내 — apply 후불 안내 배너와 동일 패턴.
          <div className="flex items-start gap-2.5 rounded-w-md border-[1.5px] border-it-blue-500/30 bg-it-blue-50 p-4 text-w-small text-it-ink-600 dark:bg-it-blue-500/10 dark:text-rink-100">
            <Icon
              name="info"
              className="text-[18px] text-it-blue-500 shrink-0 mt-0.5"
              aria-hidden="true"
              filled
            />
            <span>{applyDisabledReason}</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (uiStatus === "recruiting" || uiStatus === "closing_soon") {
                navigate(`/tournaments/${id}/apply`);
              } else {
                toast.info(
                  uiStatus === "completed" || uiStatus === "cancelled"
                    ? MESSAGES.tournamentStatus.finished
                    : MESSAGES.tournament.viewOnlyHint,
                );
              }
            }}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-w-md bg-it-blue-500 text-w-body-lg font-bold text-white shadow-sh-1 hover:bg-it-blue-600 active:brightness-95 transition-colors motion-reduce:transition-none disabled:opacity-50"
            disabled={uiStatus === "completed" || uiStatus === "cancelled"}
          >
            <span>
              {isPostpaid
                ? MESSAGES.tournament.postpaidApplyCta
                : MESSAGES.tournament.applyCta}
            </span>
            <Icon name="arrow_forward" className="text-xl" />
          </button>
        )}
      </div>
      </main>

      {/* [2026-06-17] 후불 정산 시트 — 공통 BottomSheet 사용(버튼 잘림/safe-area 처리). */}
      <SettlementModal
        isOpen={settleOpen}
        fee={settleFee}
        onFeeChange={setSettleFee}
        targetCount={settleTargetCount}
        submitting={settleSubmitting}
        onClose={() => {
          if (!settleSubmitting) setSettleOpen(false);
        }}
        onConfirm={() => void handleConfirmSettlement()}
      />

      {/* [2026-06-16] 감독/코치 — 참가 선수 전체 명단(스크롤). 인라인 5명 초과 시 노출. */}
      {isManager && (
        <BottomSheet
          isOpen={playersSheetOpen}
          onClose={() => setPlayersSheetOpen(false)}
          title={MESSAGES.tournament.participantListTitle}
        >
          <p className="pb-2 pt-1 text-w-small font-bold text-it-ink-500 dark:text-rink-300">
            {MESSAGES.tournament.participantTargetCount(
              participantNames.length || participantCount,
            )}
          </p>
          <ul className="flex flex-col gap-1 pb-2">
            {participantNames.map((name, i) => (
              <li
                key={`${name}-${i}`}
                className="flex items-center gap-2 rounded-w-md bg-it-fill px-3 py-2.5 dark:bg-rink-900/40"
              >
                <Icon
                  name="person"
                  className="text-[20px] text-it-ink-400"
                  aria-hidden="true"
                />
                <span className="text-w-small font-medium text-it-ink-800 dark:text-white">
                  {name}
                </span>
              </li>
            ))}
          </ul>
        </BottomSheet>
      )}
    </MobileContainer>
  );
}

/**
 * [2026-06-16] 후불 대회 정산 모달.
 *  · 1인당 참가비(정수 ≥ 1) 입력 → 정산 대상 인원 × 단가 = 총 청구 금액 미리보기.
 *  · 대상 1명 이상 + 단가 ≥ 1원일 때만 정산하기 활성화.
 */
function SettlementModal({
  isOpen,
  fee,
  onFeeChange,
  targetCount,
  submitting,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  fee: string;
  onFeeChange: (v: string) => void;
  targetCount: number | null;
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const feeNum = Number(fee);
  const validFee = Number.isFinite(feeNum) && feeNum >= 1;
  const count = targetCount ?? 0;
  const total = validFee ? feeNum * count : 0;
  const canConfirm = validFee && count >= 1 && !submitting;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={MESSAGES.tournament.settleTitle}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="lg"
            fullWidth
            onClick={onClose}
            disabled={submitting}
          >
            {MESSAGES.common.cancel}
          </Button>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={onConfirm}
            disabled={!canConfirm}
          >
            {submitting
              ? MESSAGES.common.processing
              : MESSAGES.tournament.settleCta}
          </Button>
        </div>
      }
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-w-caption font-bold text-it-ink-600 dark:text-rink-100">
          {MESSAGES.tournament.settleFeeLabel}
        </span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          step={1000}
          value={fee}
          onChange={(e) => onFeeChange(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder={MESSAGES.tournament.settleFeePlaceholder}
          aria-label={MESSAGES.tournament.settleFeeLabel}
          className="h-11 w-full rounded-w-md border-[1.5px] border-it-line-strong bg-it-fill px-3 text-w-body font-num tabular-nums text-it-ink-800 placeholder:text-it-ink-400 focus:border-it-blue-500 focus:bg-it-surface focus:outline-none dark:border-rink-700 dark:bg-rink-800 dark:text-white dark:focus:bg-rink-800"
        />
      </label>

      <div className="mt-4 rounded-w-md bg-it-blue-50 px-3.5 py-3 dark:bg-it-blue-500/10">
        <div className="flex items-center justify-between">
          <span className="text-w-small font-bold text-it-ink-600 dark:text-rink-100">
            {targetCount === null
              ? MESSAGES.common.loading
              : MESSAGES.tournament.settleTargetCount(count)}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-w-small font-bold text-it-ink-600 dark:text-rink-100">
            {MESSAGES.tournament.settleTotalLabel}
          </span>
          <span className="text-w-body font-extrabold text-it-blue-500 tabular-nums">
            {new Intl.NumberFormat("ko-KR").format(total)}원
          </span>
        </div>
      </div>

      {targetCount !== null && count < 1 && (
        <p className="mt-3 text-w-caption font-medium text-it-red-500">
          {MESSAGES.tournament.settleNoTarget}
        </p>
      )}
    </BottomSheet>
  );
}

// [2026-06-05 1단계] QuickAction / DetailCard / composeVenueBody / formatPrizeAmount /
//   scrollToCard 제거 — 규정·장소·상금 카드 박스 삭제로 미사용.

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[25%_1fr] gap-x-4 border-t border-it-line py-4 first:border-t-0 dark:border-rink-700">
      <p className="text-w-small font-medium text-it-ink-500 dark:text-rink-300">
        {label}
      </p>
      <p className="text-w-small font-medium text-it-ink-800 dark:text-rink-100">
        {value}
      </p>
    </div>
  );
}

/**
 * [2026-06-16] 참가 대상 행 — 역할 분기 표기(개인정보 고려).
 *  · 감독/코치(isManager): 선수 이름 최대 inlineLimit 명 인라인.
 *      초과 시 "외 N명" 탭 → 전체 명단 BottomSheet. 옆에 "명단 보기"(선수정보 페이지) 링크.
 *      이름 미해석(teamId 없음 등) 시 "선수 N명"만.
 *  · 학부모/학생(비-isManager): 본인 자녀 중 대상 자녀 이름만(타 자녀 노출 금지).
 *      대상 자녀 없으면 안전 폴백(연령 라벨).
 *  · 명단/이름 모두 없으면 연령 라벨 폴백.
 */
function ParticipantTargetRow({
  isManager,
  names,
  totalCount,
  inlineLimit,
  fallbackLabel,
  onShowAll,
  onViewList,
}: {
  isManager: boolean;
  names: string[];
  totalCount: number;
  inlineLimit: number;
  fallbackLabel: string;
  onShowAll: () => void;
  onViewList: () => void;
}) {
  const labelCell = (
    <p className="text-w-small font-medium text-it-ink-500 dark:text-rink-300">
      참가 대상
    </p>
  );

  // 학부모/학생 — 본인 자녀 이름으로 문장형 안내(없으면 라벨-값 폴백).
  if (!isManager) {
    if (names.length === 0) {
      return (
        <div className="grid grid-cols-[25%_1fr] gap-x-4 border-t border-it-line py-4 dark:border-rink-700">
          {labelCell}
          <p className="text-w-small font-medium text-it-ink-800 dark:text-rink-100">
            {fallbackLabel}
          </p>
        </div>
      );
    }
    return (
      <div className="grid grid-cols-[25%_1fr] gap-x-4 border-t border-it-line py-4 dark:border-rink-700">
        {labelCell}
        <p className="flex items-center gap-1.5 text-w-small font-bold text-it-ink-800 dark:text-rink-100">
          <Icon
            name="check_circle"
            filled
            className="shrink-0 text-[18px] text-it-blue-500"
            aria-hidden="true"
          />
          {MESSAGES.tournament.participantParentNotice(names.join(" · "))}
        </p>
      </div>
    );
  }

  // 감독/코치 — 이름 해석 실패 시 "선수 N명" 또는 연령 폴백.
  if (names.length === 0) {
    const value =
      totalCount > 0
        ? MESSAGES.tournament.participantTargetCount(totalCount)
        : fallbackLabel;
    return (
      <div className="grid grid-cols-[25%_1fr] gap-x-4 border-t border-it-line py-4 dark:border-rink-700">
        {labelCell}
        <p className="text-w-small font-medium text-it-ink-800 dark:text-rink-100">
          {value}
        </p>
      </div>
    );
  }

  const inline = names.slice(0, inlineLimit);
  const overflow = names.length - inline.length;

  return (
    <div className="grid grid-cols-[25%_1fr] gap-x-4 border-t border-it-line py-4 dark:border-rink-700">
      {labelCell}
      <div className="flex flex-col gap-1.5">
        <p className="text-w-small font-medium text-it-ink-800 dark:text-rink-100">
          <span>{inline.join(" · ")}</span>
          {overflow > 0 && (
            <>
              {" "}
              <button
                type="button"
                onClick={onShowAll}
                className="font-bold text-it-blue-500 hover:text-it-blue-600"
              >
                {MESSAGES.tournament.participantMore(overflow)}
              </button>
            </>
          )}
        </p>
        <button
          type="button"
          onClick={onViewList}
          className="inline-flex w-fit items-center gap-0.5 text-w-caption font-bold text-it-blue-500 hover:text-it-blue-600"
        >
          <Icon name="groups" className="text-[16px]" aria-hidden="true" />
          {MESSAGES.tournament.participantViewList}
        </button>
      </div>
    </div>
  );
}

// [2026-06-08] TabButton / RankingTab 제거 — 대진표/순위 탭 삭제, 경기일정만 표시.

function ScheduleTab({
  matches,
  hostTeamName,
  fallbackVenueText,
}: {
  matches: MatchSummary[];
  /** 대회 주최 팀명 — 경기에 홈팀이 직접 연결돼 있지 않을 때 홈 자리에 표시(폴백). */
  hostTeamName?: string | null;
  /** 대회 장소(location > venue > rink) — 경기에 장소가 없을 때 폴백 표시. */
  fallbackVenueText?: string | null;
}) {
  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-12 text-it-ink-400">
        <Icon name="event_busy" className="mb-2 text-4xl" />
        <p className="text-w-small">등록된 경기가 없습니다</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col px-4">
      {matches.map((m, idx) => {
        const dt = new Date(m.scheduledAt);
        const dateStr = `${dt.getMonth() + 1}.${String(dt.getDate()).padStart(2, "0")}`;
        const timeStr = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
        // 경기 시각이 지났는데 아직 scheduled 면 종료로 보정(status 자동 전이가 없음).
        const isPast = !Number.isNaN(dt.getTime()) && dt.getTime() < Date.now();
        const effStatus = m.status === "scheduled" && isPast ? "completed" : m.status;
        const isCompleted = effStatus === "completed";
        return (
          <div
            key={m.id}
            className={`py-4 ${
              idx !== matches.length - 1 ? "border-b border-it-line dark:border-rink-700" : ""
            }`}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="event" className="text-w-title text-it-ink-400" />
                <span className="text-w-small font-medium text-it-ink-800 dark:text-white tabular-nums">
                  {dateStr} {timeStr}
                </span>
              </div>
              <span
                className={`rounded-w-pill px-2 py-1 text-w-caption font-bold ${
                  isCompleted
                    ? "bg-it-fill text-it-ink-600 dark:bg-rink-700 dark:text-rink-100"
                    : "bg-it-blue-50 text-it-blue-500 dark:bg-it-blue-500/15 dark:text-it-blue-500"
                }`}
              >
                {MESSAGES.match.statusLabel[effStatus] ?? effStatus}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-w-body font-bold text-it-ink-800 dark:text-white">
                {m.homeTeam?.name ?? hostTeamName ?? "우리 팀"}
              </span>
              <span className="text-w-small font-bold text-it-ink-400">VS</span>
              <span className="text-w-small font-medium text-it-ink-800 dark:text-white">
                {/* [2026-06-05 3단계] 등록 팀(awayTeam) 없으면 상대팀 자유 텍스트(opponentName) 표시. */}
                {m.awayTeam?.name ?? m.opponentName ?? "TBD"}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1 text-w-caption text-it-ink-400 dark:text-rink-300">
              <Icon name="location_on" className="text-w-small" />
              {/* 경기 직접 입력(venueName) > 경기 링크장 > 대회 장소 폴백. */}
              <span>
                {m.venueName ??
                  m.rink?.name ??
                  m.venue?.name ??
                  fallbackVenueText ??
                  "-"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// [2026-06-08] Standing / computeStandings 제거 — 순위(RankingTab) 삭제로 미사용.
