"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import { useNavigation } from "@/components/ui/NavLink";
import { Icon } from "@/components/ui/Icon";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { api } from "@/services/api-client";
import { MESSAGES } from "@/lib/messages";
import { formatClassPriceLabel } from "@/lib/class-price";
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { useChildren } from "@/hooks/useChildren";
import { useSelectedChild } from "@/contexts/SelectedChildContext";
import { getChildEligibilityForClass, isChildAgeEligibleForClass } from "@/lib/child-status";
import { getDashboardPathByUserType } from "@/lib/auth-routing";
import { useClassForm } from "@/hooks/useClassForm";
import { useToast } from "@/components/ui/Toast";
import { useModal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import { openShareSheet } from "@/lib/share";
import { resolveImageUrl, resolveImageSrc } from "@/lib/image-url";
// [추가 2026-05-18] 자녀 선택 단일 진입점 — 수업 상세에서 ChildSelector 노출,
//  결제 옵션 페이지는 readonly SelectedChildDisplay 로 통일.
import { ChildSelector } from "@/components/payment/ChildSelector";
import { ScheduleCalendarView } from "@/components/classes/ScheduleCalendarView";
// [2026-05-11] classes 도메인 trainingType SoT — class-categories.ts 통합.
// 기존 자체 정의(CLASS_TYPE_LABEL) 는 옛 대문자 enum 만 인식해 신규 데이터를 놓치는 버그였음.
import {
  TRAINING_TYPE_LABEL,
  getTrainingTypeBadgeClass,
  formatDaySchedulesFull,
  sortDaySchedules,
  type DaySchedule,
} from "@/lib/class-categories";

/* ────────────────────────────────────────────
   Types
   ──────────────────────────────────────────── */

interface ClassProduct {
  id: string;
  productName: string;
  description?: string | null;
  price: number;
  sessionsPerMonth: number;
  feeType?: string;
  feePerSession?: number | null;
  sessionsPerWeek?: number | null;
  // 패키지 유효기간 — PackageEditSheet 수정 모드 초기값 채움용.
  durationDays?: number | null;
  billingTiming?: string;
  // PACKAGE_END_GUARD (2026-05-22) — 백엔드 getClassProducts 계산 필드.
  // 본 페이지의 수강료 카드에서 비활성 패키지를 grayscale + 배지로 표시.
  isActive?: boolean;
  isPurchasable?: boolean;
  classEndDate?: string | null;
  expectedExpiresAt?: string | null;
  disabledReason?: string | null;
}

interface ClassDetail {
  id: string;
  className: string;
  instructorName: string;
  capacity: number;
  startTime?: string;
  endTime?: string;
  clubId?: string;
  /** 정규 수업의 팀 ID (백엔드 응답이 teamId 로 내려오는 케이스 호환) */
  teamId?: string;
  /** 오픈클래스 식별 — academyId 있으면 회원/가입 개념 없는 수업 단위 등록.
   *  설계서(260423_회의_기능재설계_설계서.md §4.6): "오픈클래스 자체에는 가입 없음.
   *  수업 안에 수강생이 등록될 뿐". 팀 멤버십 가드 우회. */
  academyId?: string | null;
  /** [Phase B] 결제 방식 — POSTPAID(후불) 등록 분기용 */
  billingMode?: string;
  teamLogoUrl?: string | null;
  club?: {
    id: string;
    clubName: string;
  };
  description?: string;
  trainingType?: string;
  levelRequired?: string;
  ageMin?: number;
  ageMax?: number;
  /** 대상 출생연도 개별 목록(SoT). [] 또는 미존재 = 전 연령. ageMin/ageMax 는 파생 표시값. */
  targetBirthYears?: number[];
  category?: string;
  classDays?: string[];
  coachId?: string;
  coachName?: string;
  coachProfileImage?: string;
  /** [추가 2026-05-12] 다중 코치 배정 (ClassCoachAssignment ACCEPTED) — LEAD 먼저 */
  coachAssignments?: Array<{
    coachUserId: string;
    role: string;
    coachName: string;
    coachUserType?: string | null;
  }>;
  venueId?: string;
  venueName?: string;
  venueAddress?: string;
  /** [2026-06-05] 요일별 시간·장소 규칙 — 백엔드 getClass 응답. 규칙 없으면 빈 배열. */
  daySchedules?: DaySchedule[];
  currentEnrollment?: number;
  waitlistCount?: number;
  isActive?: boolean;
  /** 승인 상태 — 일정 관리 CTA 가시성 판정에 사용 */
  approvalStatus?: "PENDING" | "APPROVED" | "REJECTED";
  /** [추가 2026-05-15 T03 협업] 회당 가격 (원 단위, 직접 컬럼) */
  singlePrice?: number | null;
  /** [추가 2026-05-15 T03 협업] 월 정기 가격 (원 단위, 직접 컬럼) */
  monthlyPrice?: number | null;
  /** [추가 2026-05-15 T03 협업] 회당 가격 라벨 — 'tbd' | 'krw' | null */
  singlePriceLabel?: "tbd" | "krw" | null;
  /** [추가 2026-05-15 T03 협업] 월 정기 가격 라벨 — 'tbd' | 'krw' | null */
  monthlyPriceLabel?: "tbd" | "krw" | null;
  products?: ClassProduct[];
  /** 명단관리용 — 배치된 학생 목록 (ClassRegistration active, classes.service.ts:874).
   *  결제 흐름(Enrollment)과 별개. 코치가 직접 배치한 학생도 포함.
   *  결제취소 후 UI 갱신(status='refunded')에 사용. */
  enrollments?: Array<{
    id: string;
    userId: string;
    status: string;
    userName: string;
  }>;
  /** [추가 2026-05-15] 결제이력(paid Enrollment) 카운트 — 휴지통 가드 판정용.
   *  1명 이상이면 삭제 불가. */
  paidEnrollmentCount?: number;
  /** [추가 2026-05-15] 오픈클래스 노출 팀 목록 — ClassTeamVisibility 매핑.
   *  오픈클래스 감독이 어떤 팀에 노출했는지 수업 정보에 표시. */
  visibleTeams?: Array<{
    id: string;
    name: string;
    teamCode?: string | null;
  }>;
}

/** [추가 2026-05-13] 학부모 본인/자녀 결제 완료된 Enrollment — 결제취소 버튼 판정용.
 *  ⚠️ 백엔드 EnrollmentResponseDto 응답 구조: child/class 는 중첩 객체 (최상위에 childId/classId 없음).
 *      [수정 2026-05-13] 응답 매핑 잘못 가정 → 매칭 실패 수정.
 *  [수정 2026-05-18] requester 필드 추가 — 자녀별 잠금 판정 시 본인 pending 재시도 허용 가드용.
 *      `/enrollments` 전체 조회로 변경 (paid 외에도 pending/approved 자녀를 ChildSelector 잠금 표기). */
interface MyEnrollment {
  id: string;
  child: { id: string };
  class: { id: string };
  requester?: { id: string };
  status: string;
  paymentId?: string | null;
  /** [2026-06-18] 결제한 수강 플랜(ClassProduct) — 결제완료 패키지 표시·잠금용. */
  product?: { id: string } | null;
}

// [추가 2026-05-18] 결제 옵션 페이지와 동일 — 본 수업에 신청/수강 중으로 간주할 상태.
const ENROLLED_STATUSES = new Set([
  "pending",
  "pending_approval",
  "approved",
  "paid",
]);

/** 백엔드 ClassSchedule */
interface ClassScheduleItem {
  id: string;
  scheduledDate: string;
  // [2026-06-09] 오픈클래스 날짜별 일정 — 시간/장소(백엔드 ClassSchedule + venue 조인).
  startTime?: string | null;
  endTime?: string | null;
  venueId?: string | null;
  venue?: { id: string; name: string } | null;
  isCancelled?: boolean;
}

/* ────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────── */

function formatTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  // Class.startTime/endTime 은 벽시계 시각을 KST 변환 없이 naive 저장(timestamp without tz).
  //   Prisma 가 UTC 로 역직렬화하므로 getUTCHours/getUTCMinutes 로 추출해야 입력 시각과 일치.
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

function formatDateCompact(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  // [수정 2026-05-15] 형식 통일 — `26.05.14` (연도 2자리 + 월/일 0 pad).
  //   기존 `2026.5.13` 형식이 사용자 가이드에서 변경 요청됨.
  const y = String(d.getFullYear()).slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

function formatPrice(price: number): string {
  return price.toLocaleString("ko-KR");
}

function translateLevel(level?: string): string | null {
  if (!level) return null;
  const normalized = level.trim();
  if (/beg|입문|기초/i.test(normalized)) return "입문";
  if (/int|중급/i.test(normalized)) return "중급";
  if (/adv|고급|상급/i.test(normalized)) return "고급";
  return normalized;
}

function formatClassDays(days?: string[]): string | null {
  if (!days || days.length === 0) return null;
  if (days.length === 7) return "매일";
  if (
    days.length === 5 &&
    ["월", "화", "수", "목", "금"].every((d) => days.includes(d))
  )
    return "평일";
  if (days.length === 2 && days.includes("토") && days.includes("일"))
    return "주말";
  return days.join(" · ");
}

// [2026-05-12] 코치 호칭 매핑 + 다중 코치 한 줄 텍스트 생성
function getRoleLabel(userType?: string | null): string {
  const t = userType?.toUpperCase();
  if (t === "DIRECTOR") return "감독";
  if (t === "ACADEMY_DIRECTOR") return "감독";
  return "코치";
}

function formatCoachList(
  assignments: ClassDetail["coachAssignments"],
  fallback?: string,
): string {
  if (assignments && assignments.length > 0) {
    return assignments
      .map((a) => `${a.coachName} ${getRoleLabel(a.coachUserType)}`)
      .join(" · ");
  }
  return fallback ?? "코치 미정";
}

/* ────────────────────────────────────────────
   Info Row — awards 리스트 카드의 메타 패턴
   ──────────────────────────────────────────── */

/* ────────────────────────────────────────────
   Main Component
   ──────────────────────────────────────────── */

export default function ClassDetailPage() {
  const { back, navigate } = useNavigation();
  const params = useParams();
  const classId = params?.id as string;

  const { user } = useSessionAuth();
  const { children: parentChildren } = useChildren();
  const { toast } = useToast();
  const { modal } = useModal();

  const [classData, setClassData] = useState<ClassDetail | null>(null);
  // [수정 2026-05-15] academyId 전달 — 오픈클래스 삭제 시 backend /academies/:id/classes/:classId
  //  으로 분기. 누락 시 /teams/:teamId/... 호출로 404 발생.
  const { deleteClass, isDeleting } = useClassForm({
    mode: "edit",
    classId,
    academyId: classData?.academyId ?? undefined,
  });

  const [scheduleRange, setScheduleRange] = useState<{ start: string; end: string } | null>(null);
  // [2026-06-09] 오픈클래스 날짜별 일정 전체 — 상세 "일정" 표시용.
  const [scheduleList, setScheduleList] = useState<ClassScheduleItem[]>([]);
  // [2026-06-09] 학부모 결제 — 상세 수강플랜에서 선택한 회차(ClassProduct) id 집합(복수).
  //   전체(MONTHLY_FIXED)는 회차별(PER_SESSION)과 배타: 전체 선택 시 회차별 모두 해제·비활성.
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const handleProductToggle = useCallback(
    (id: string, products: { id: string; feeType?: string }[]) => {
      setSelectedProductIds((prev) => {
        const next = new Set(prev);
        const product = products.find((p) => p.id === id);
        const fullId = products.find((p) => p.feeType === 'MONTHLY_FIXED')?.id;
        if (next.has(id)) {
          next.delete(id);
          return next;
        }
        if (product?.feeType === 'MONTHLY_FIXED') return new Set([id]); // 전체만
        if (fullId) next.delete(fullId); // 회차별 선택 → 전체 해제
        next.add(id);
        return next;
      });
    },
    [],
  );
  const [isLoading, setIsLoading] = useState(true);

  // 본인 소속 팀 ID — 매니저 UI 가드 이중 안전망용. /teams/my/list 결과 캐시.
  const [myTeamIds, setMyTeamIds] = useState<string[]>([]);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  // 🛡️ Native UI 동기화 (2026-05-11):
  //   - Status Bar 복원: LoadingContext 가 fetch 진입 시 `ui.hideStatusBar()` 를 호출하는데,
  //     이전엔 fetch 완료 후 ui.setConfig 호출자가 없어 status bar 가 영구 숨김 상태로 락됨.
  //   - showAppBar: false — 헤더는 Web DOM 의 `<PageAppBar forceNative />` 가 그리므로 Flutter
  //     AppBar 는 사용 안 함 (인접 페이지 payments/classes 목록과 동일 패턴).
  //   - isDataLoaded: !isLoading — fetch 완료된 후에만 setConfig 적용 (race condition 차단).
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
    isDataLoaded: !isLoading,
  });
  const [isFavorite, setIsFavorite] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  /* ── 수강신청 — /payment/options 로 이동 ──
   * 상품 선택은 options 페이지에서 결제 방식으로 수행
   * 정원 마감 정책: Waitlist UX 미노출 (월/시즌 운영 특성상 대기 순번 비현실적)
   */

  /**
   * 수강 가능 자녀 가드 — 수업 유형에 따라 분기.
   *  - 오픈클래스 (academyId IS NOT NULL): 가입 개념 없음, 자녀 1명 이상이면 등록 가능
   *    (설계서 §4.6 "오픈클래스 자체에는 가입 없음, 수업 안에 수강생이 등록될 뿐")
   *  - 팀 수업 (teamId IS NOT NULL): 자녀가 해당 팀에 approved ClubMember 여야 함
   *    (설계서 §4.2 정규 훈련 필터 + 백엔드 enrollments.service.ts:173-177 가드)
   *  - child.clubIds 는 useChildren 에서 approved 멤버십만 추출해 둔 값
   *  - 백엔드 응답이 clubId / teamId 어느 쪽으로 내려오든 매칭되도록 둘 다 검사
   */
  const isOpenClass = !!classData?.academyId;

  // [2026-06-09] 오픈클래스 결제 회차 기본 선택 — 전체(MONTHLY_FIXED) 우선, 없으면 첫 회차.
  useEffect(() => {
    const products = classData?.products ?? [];
    if (products.length === 0) return;
    setSelectedProductIds((prev) => {
      if (prev.size > 0) return prev;
      const fullProduct = products.find((p) => p.feeType === 'MONTHLY_FIXED');
      return new Set([(fullProduct ?? products[0]).id]);
    });
  }, [classData?.products]);
  // [2026-05-15] 수업 수정 폼 경로 — 오픈클래스(academyId)는 academy 전용 라우트로,
  //   팀 수업은 기존 classes-manage 폼으로. academy 라우트는 isAcademyMode=true 로 동작.
  const editClassPath = isOpenClass
    ? `/academy-classes/edit/${classId}`
    : `/classes-manage/create?edit=${classId}`;
  const eligibleTeamId = classData?.teamId ?? classData?.clubId ?? null;
  const hasEligibleChild = useMemo(() => {
    // 오픈클래스: 팀 멤버십 무관 — 등록된 자녀가 1명 이상이면 등록 가능
    if (isOpenClass) return parentChildren.length > 0;
    // 팀 수업: 자녀가 해당 팀에 approved 멤버여야 등록 가능
    if (!eligibleTeamId) return false;
    return parentChildren.some((c) => c.clubIds?.includes(eligibleTeamId));
  }, [parentChildren, eligibleTeamId, isOpenClass]);

  /** [수정 2026-05-18] 학부모 본인 + 자녀 Enrollment 전체 조회 (paid 만이 아닌 전체).
   *  - 결제 옵션 페이지(/payment/options)와 동일 패턴: `/enrollments` 호출 후 본 수업 매칭만 필터.
   *  - 이유: ChildSelector 가 paid 외에도 pending/approved 자녀를 "이미 수강 중"으로 잠가야 함.
   *  - 자녀 A 결제 완료 / 자녀 B 미결제 다자녀 시나리오에서 자녀별 분기 가능해야 함.
   *  - paid Enrollment 만 별도 추출하여 결제취소 진입 판정 (자녀 ID → MyEnrollment 매핑).
   */
  const [myEnrollments, setMyEnrollments] = useState<MyEnrollment[]>([]);

  // 본 수업에 신청/수강 중인 자녀 ID 집합 (pending/pending_approval/approved)
  //   - 본인이 만든 pending(requester=본인) 은 결제 재시도 가능 → 잠금 제외.
  //   - [수정 2026-05-18] 'paid' 자녀는 결제취소 진입(자녀 선택) 가능해야 하므로 별도 집합(paidByChildId)
  //     에서만 관리하고 본 잠금 집합에는 포함시키지 않음. 단, ChildSelector 에서 paid 자녀는
  //     "결제완료" 라벨을 표시해 다른 자녀와 구별 (다자녀 시나리오 — 자녀 A paid, 자녀 B 미결제).
  // [Phase B] 후불(POSTPAID) 수업 판별 — billingMode 또는 products billingTiming(양 fetch 경로 안전).
  const isPostpaid =
    classData?.billingMode === "POSTPAID" ||
    (classData?.products ?? []).some((p) => p.billingTiming === "POSTPAID");

  const enrolledChildIds = useMemo(() => {
    const ids = new Set<string>();
    const myUserId = user?.id;
    for (const e of myEnrollments) {
      if (e.class?.id !== classId) continue;
      if (!ENROLLED_STATUSES.has(e.status)) continue;
      if (!e.child?.id) continue;
      if (e.status === "pending" && e.requester?.id === myUserId) continue;
      // paid 자녀는 결제취소 진입을 위해 선택 가능해야 함 → 잠금 집합에서 제외.
      if (e.status === "paid") continue;
      // [Phase B] 후불 수강 중(approved)은 "수강 종료" 위해 선택 가능 → 잠금 제외.
      if (isPostpaid && e.status === "approved") continue;
      ids.add(e.child.id);
    }
    return ids;
  }, [myEnrollments, classId, user?.id, isPostpaid]);

  // 자녀 ID → paid Enrollment 매핑 (결제취소 진입 판정용)
  //   - status='paid' 이고 paymentId 가 존재하는 항목만 포함.
  const paidByChildId = useMemo(() => {
    const map = new Map<string, MyEnrollment>();
    for (const e of myEnrollments) {
      if (e.class?.id !== classId) continue;
      if (e.status !== "paid") continue;
      if (!e.paymentId) continue;
      if (!e.child?.id) continue;
      map.set(e.child.id, e);
    }
    return map;
  }, [myEnrollments, classId]);

  // [Phase B] 자녀 ID → 후불 수강 중(approved) Enrollment 매핑 (수강 종료 진입용).
  const postpaidByChildId = useMemo(() => {
    const map = new Map<string, MyEnrollment>();
    if (!isPostpaid) return map;
    for (const e of myEnrollments) {
      if (e.class?.id !== classId) continue;
      if (e.status !== "approved") continue;
      if (!e.child?.id) continue;
      map.set(e.child.id, e);
    }
    return map;
  }, [myEnrollments, classId, isPostpaid]);

  // 수업 대상 연령(targetBirthYears 우선, ageMin/ageMax 폴백)에 맞지 않는 자녀 ID 집합.
  //   결제 옵션 페이지와 동일하게 공용 isChildAgeEligibleForClass 사용 (출생연도 비연속 정확 매칭).
  const ageIncompatibleChildIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of parentChildren) {
      if (
        !isChildAgeEligibleForClass(c, {
          targetBirthYears: classData?.targetBirthYears,
          ageMin: classData?.ageMin,
          ageMax: classData?.ageMax,
        })
      ) {
        ids.add(c.id);
      }
    }
    return ids;
  }, [
    parentChildren,
    classData?.targetBirthYears,
    classData?.ageMin,
    classData?.ageMax,
  ]);

  // 팀 가입 미승인 자녀 ID 집합 + 사유 매핑 (결제 옵션 페이지 §4.5 + BR-12 동일)
  const { notApprovedChildIds, approvalStatusById } = useMemo(() => {
    const notApproved = new Set<string>();
    const statusMap = new Map<string, "pending" | "rejected" | "not_member">();
    if (isOpenClass || eligibleTeamId) {
      for (const c of parentChildren) {
        const result = getChildEligibilityForClass(c, {
          isOpenClass,
          eligibleTeamId,
        });
        if (result.eligible) continue;
        notApproved.add(c.id);
        statusMap.set(c.id, result.reason);
      }
    }
    return { notApprovedChildIds: notApproved, approvalStatusById: statusMap };
  }, [parentChildren, isOpenClass, eligibleTeamId]);

  // 자녀 선택 단일 진입점 (Option A1) — ChildSelector 가 본 state 를 갱신.
  //   - 자동 선택 우선순위:
  //     1. 미결제 + 등록 가능 자녀 (enrolled/notApproved/ageIncompatible 모두 아닌 자녀) — 등록(결제)하기 기본 액션.
  //     2. 위가 없으면 paid 자녀 (결제취소 진입 가능) — 모든 자녀가 결제완료된 경우 첫 번째 paid 자녀.
  //   - 선택된 자녀가 부적합 상태로 변경되면 해제 후 재선택.
  //   - paid 자녀는 enrolledChildIds 에서 제외되어 있으므로 잠금 대상 아님 (선택 가능).
  // [2026-06-19 사용자 직접 지시] 홈/전체메뉴에서 선택된 자녀를 수강생 기본 선택 기준으로 사용.
  const { selectedChildId: globalSelectedChildId } = useSelectedChild();
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  // [2026-06-09] 오픈클래스 자녀 복수 선택 — 선택 자녀별 개별 결제 순차 진행.
  const [selectedChildIds, setSelectedChildIds] = useState<Set<string>>(new Set());
  const handleChildToggle = useCallback((id: string) => {
    setSelectedChildIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // [2026-06-09] 오픈클래스 자녀 복수 — 단일 기본 선택(selectedChildId)을 복수 집합에 동기화.
  useEffect(() => {
    if (!isOpenClass || !selectedChildId) return;
    setSelectedChildIds((prev) => (prev.size > 0 ? prev : new Set([selectedChildId])));
  }, [isOpenClass, selectedChildId]);

  useEffect(() => {
    if (parentChildren.length === 0) return;
    // 현재 선택된 자녀가 부적합 상태가 되면 해제 (paid 는 부적합 아님 — 결제취소 가능)
    if (
      selectedChildId &&
      (enrolledChildIds.has(selectedChildId) ||
        notApprovedChildIds.has(selectedChildId) ||
        ageIncompatibleChildIds.has(selectedChildId))
    ) {
      setSelectedChildId("");
      return;
    }
    if (!selectedChildId) {
      // [2026-06-19] 0순위: 홈/전체메뉴에서 선택된 자녀(globalSelectedChildId) — 단, 부적합(잠금) 상태가
      //   아니어야 함(잠금이면 해제 useEffect 와 충돌). 임선수 페이지면 임선수가 기본 선택되도록.
      if (globalSelectedChildId) {
        const globalChild = parentChildren.find(
          (c) =>
            c.id === globalSelectedChildId &&
            !enrolledChildIds.has(c.id) &&
            !notApprovedChildIds.has(c.id) &&
            !ageIncompatibleChildIds.has(c.id),
        );
        if (globalChild) {
          setSelectedChildId(globalChild.id);
          return;
        }
      }
      // 1순위: 미결제 + 등록 가능 자녀
      const firstAvailable = parentChildren.find(
        (c) =>
          !enrolledChildIds.has(c.id) &&
          !notApprovedChildIds.has(c.id) &&
          !ageIncompatibleChildIds.has(c.id) &&
          !paidByChildId.has(c.id),
      );
      if (firstAvailable) {
        setSelectedChildId(firstAvailable.id);
        return;
      }
      // 2순위: paid 자녀 (결제취소 진입)
      const firstPaid = parentChildren.find((c) => paidByChildId.has(c.id));
      if (firstPaid) {
        setSelectedChildId(firstPaid.id);
        return;
      }
      // [Phase B 수정] 3순위(무조건 첫 자녀 선택) 제거 — 모든 자녀가 등록/부적합이면 미선택 유지.
      //   기존 fallback 은 등록된 자녀를 강제 선택 → 해제 useEffect 와 충돌해 무한 루프(Maximum update depth) 유발.
    }
    // Set/Map 들은 매 렌더마다 새 참조이므로 JSON stringify 로 안정화
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    parentChildren,
    selectedChildId,
    globalSelectedChildId,
    JSON.stringify([...enrolledChildIds]),
    JSON.stringify([...notApprovedChildIds]),
    JSON.stringify([...ageIncompatibleChildIds]),
    JSON.stringify([...paidByChildId.keys()]),
  ]);

  // 선택된 자녀에 대한 paid Enrollment (결제취소 진입 판정)
  const paidEnrollment = useMemo(
    () => (selectedChildId ? paidByChildId.get(selectedChildId) ?? null : null),
    [paidByChildId, selectedChildId],
  );

  // [2026-06-18] 선택 자녀가 이미 결제완료한 수강 플랜(ClassProduct) id —
  //   해당 패키지 카드를 '결제완료'로 표시하고 재선택을 막는다.
  const paidProductId = useMemo(
    () => paidEnrollment?.product?.id ?? null,
    [paidEnrollment],
  );

  const [isCancelling, setIsCancelling] = useState(false);
  // 캘린더 보기 아코디언 — 기본 접힘.
  const [showCalendar, setShowCalendar] = useState(false);

  // 학부모인 경우, 본인/자녀 Enrollment 전체 조회 (1회).
  //   ⚠️ [2026-05-14] api-client unwrapEnvelope 가 백엔드 envelope({success,data,total}) 를
  //      자동으로 한 번 풀어주므로 res.data 는 곧 MyEnrollment[] 배열이다.
  //   ⚠️ user?.userType 인라인 검사 — isParent 변수는 아래에서 선언되므로 TDZ 회피.
  //   [수정 2026-05-18] /enrollments?status=paid → /enrollments — pending/approved 자녀도 잠금 표기.
  useEffect(() => {
    if (user?.userType !== "parent" || !user?.id) return;
    let cancelled = false;
    (async () => {
      const res = await api.get<MyEnrollment[]>("/enrollments");
      if (cancelled) return;
      const list = res.success && Array.isArray(res.data) ? res.data : [];
      setMyEnrollments(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.userType, user?.id]);

  const handleCancelPayment = async () => {
    if (!paidEnrollment?.paymentId) return;
    // [수정 2026-05-18] 자녀명·수업명 명시 (다자녀 시나리오 — 자녀 A 결제취소 시 B 와 혼동 방지).
    const selectedChild = parentChildren.find((c) => c.id === selectedChildId);
    const childName = selectedChild?.name ?? "";
    const className = classData?.className ?? "";
    const ok = await modal.confirm({
      title: MESSAGES.enrollment.cancelConfirmTitle,
      message: MESSAGES.enrollment.cancelConfirmMessage(childName, className),
      confirmText: "결제취소",
      cancelText: "돌아가기",
    });
    if (!ok) return;
    setIsCancelling(true);
    try {
      const res = await api.post(`/payments/${paidEnrollment.paymentId}/cancel`, {
        cancelReason: "학부모 요청 (수업 상세에서 결제취소)",
      });
      if (!res.success) {
        toast.error(res.error?.message ?? MESSAGES.payment2.cancelFailed);
        return;
      }
      toast.success(MESSAGES.payment2.cancelSuccess);
      // 화면 갱신 — Enrollment 상태 갱신 반영
      setClassData((prev) =>
        prev
          ? {
              ...prev,
              enrollments: prev.enrollments?.map((e) =>
                e.id === paidEnrollment.id ? { ...e, status: "refunded" } : e,
              ),
            }
          : prev,
      );
      // [추가 2026-05-18] myEnrollments 에서도 해당 항목 제거 → paidByChildId 재계산 → CTA 즉시 갱신.
      setMyEnrollments((prev) => prev.filter((e) => e.id !== paidEnrollment.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : MESSAGES.payment2.cancelFailed);
    } finally {
      setIsCancelling(false);
    }
  };

  // 후불: 선택 자녀의 수강 중(approved) 등록 — "수강 종료" 대상.
  const postpaidEnrollment = selectedChildId
    ? postpaidByChildId.get(selectedChildId) ?? null
    : null;

  // 후불 수강 종료 — 백엔드 cancelEnrollment 가 ClassRegistration inactive 처리.
  const handleEndEnrollment = async () => {
    if (!postpaidEnrollment) return;
    const childName =
      parentChildren.find((c) => c.id === selectedChildId)?.name ?? '';
    const className = classData?.className ?? '';
    const ok = await modal.confirm({
      title: MESSAGES.enrollment.endConfirmTitle,
      message: MESSAGES.enrollment.endConfirmMessage(childName, className),
      confirmText: MESSAGES.enrollment.endConfirm,
      cancelText: '돌아가기',
    });
    if (!ok) return;
    setIsCancelling(true);
    try {
      const res = await api.delete(`/enrollments/${postpaidEnrollment.id}`);
      if (!res.success) {
        toast.error(res.error?.message ?? MESSAGES.error.general);
        return;
      }
      toast.success(MESSAGES.enrollment.endSuccess);
      setMyEnrollments((prev) =>
        prev.filter((e) => e.id !== postpaidEnrollment.id),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : MESSAGES.error.general);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleEnrollClick = async () => {
    // 자녀 0명 → noChildren / 팀 수업인데 자녀 모두 팀 미가입 → notEligibleForTeam
    // (승인 상태 자체는 노출하지 않되, 사유는 구분해 안내한다.)
    const hasAnyChild = !!parentChildren && parentChildren.length > 0;
    if (!hasAnyChild) {
      await modal.alert({
        title: '신청할 수 없어요',
        message: MESSAGES.enrollment.noChildren,
        buttonText: '확인',
      });
      return;
    }
    if (!hasEligibleChild) {
      await modal.alert({
        title: '신청할 수 없어요',
        message: MESSAGES.enrollment.notEligibleForTeam,
        buttonText: '확인',
      });
      return;
    }
    const products = classData?.products ?? [];
    if (products.length === 0) {
      toast.error(MESSAGES.class.noProducts);
      return;
    }
    // [수정 2026-05-18] 자녀 선택 단일 진입점 — childId 필수 전달 (결제 옵션 페이지는 readonly).
    if (isOpenClass ? selectedChildIds.size === 0 : !selectedChildId) {
      await modal.alert({
        title: '신청할 수 없어요',
        message: MESSAGES.enrollment.selectChild,
        buttonText: '확인',
      });
      return;
    }
    // [Phase B] 후불(POSTPAID) — 선결제 없이 즉시 수강 등록(구독형). 결제 페이지 미이동.
    //   reload 대신 myEnrollments 낙관적 갱신 → 토스트 유지 + 즉시 "수강 중" 반영(무한 루프 회피).
    if (isPostpaid) {
      const childIds = isOpenClass
        ? Array.from(selectedChildIds).filter((id) =>
            parentChildren.some((c) => c.id === id),
          )
        : [selectedChildId];
      try {
        const newEntries: MyEnrollment[] = [];
        for (const cid of childIds) {
          const res = await api.post<{ id: string }>('/enrollments', {
            classId,
            childId: cid,
          });
          if (!res.success) {
            throw new Error(res.error?.message ?? MESSAGES.error.general);
          }
          newEntries.push({
            id: res.data?.id ?? `tmp-${cid}`,
            child: { id: cid },
            class: { id: classId },
            status: 'approved',
            requester: { id: user?.id ?? '' },
            paymentId: null,
          });
        }
        setMyEnrollments((prev) => [...prev, ...newEntries]);
        toast.success(MESSAGES.enrollment.postpaidEnrolled);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : MESSAGES.error.general);
      }
      return;
    }
    // [2026-06-09] 오픈클래스 자녀 복수 × 회차 복수 — (자녀, 회차) 모든 조합을 순차 결제(개별 반복).
    if (isOpenClass) {
      const childIds = Array.from(selectedChildIds).filter((id) =>
        parentChildren.some((c) => c.id === id),
      );
      const productIds = Array.from(selectedProductIds);
      const pairs: { childId: string; productId: string }[] = [];
      for (const cid of childIds) {
        for (const pid of productIds) pairs.push({ childId: cid, productId: pid });
      }
      if (pairs.length === 0) return;
      const [first, ...rest] = pairs;
      try {
        // 남은 큐 — complete 페이지 "다음 결제 진행" 이 1건씩 소비.
        sessionStorage.setItem(
          'openclass_pay_queue',
          JSON.stringify({ classId, pairs: rest }),
        );
        // 전체 내역(불변) — 결제 옵션 페이지가 "선택한 전체 수강 내역" 목록으로 표시.
        sessionStorage.setItem(
          'openclass_pay_session',
          JSON.stringify({ classId, all: pairs }),
        );
      } catch {
        /* 저장 실패 시 첫 건만 진행 */
      }
      navigate(
        `/payment/options?classId=${classId}&childId=${first.childId}${first.productId ? `&productId=${first.productId}` : ''}`,
      );
      return;
    }
    // 팀 수업 — 단일 자녀/회차.
    const teamProductId = Array.from(selectedProductIds)[0] ?? '';
    navigate(
      `/payment/options?classId=${classId}&childId=${selectedChildId}${teamProductId ? `&productId=${teamProductId}` : ''}`,
    );
  };

  /* ── 수업 삭제 (감독/코치 전용) ── */
  const handleDelete = async () => {
    setShowDeleteConfirm(false);
    await deleteClass();
  };

  /* ── SNS 공유 ── */

  const handleShare = () => {
    if (!classData) return;
    // [2026-06-05] 요일별 규칙이 있으면 공유 텍스트도 "월 17:00 ~ 18:00 / 수 ..." 로 표기.
    const dayScheduleLabel = formatDaySchedulesFull(classData.daySchedules);
    const schedule = dayScheduleLabel ?? formatClassDays(classData.classDays) ?? '';
    const time = dayScheduleLabel
      ? ''
      : classData.startTime && classData.endTime
      ? `${formatTime(classData.startTime)} ~ ${formatTime(classData.endTime)}`
      : classData.startTime
        ? formatTime(classData.startTime)
        : '';
    const venue = classData.venueName ?? '';
    const coach = classData.coachAssignments && classData.coachAssignments.length > 0
      ? formatCoachList(classData.coachAssignments)
      : classData.coachName
        ? `${classData.coachName} 코치`
        : '';
    const perSession = classData.products?.find((p) => p.feeType === 'PER_SESSION');
    const monthly = classData.products?.find((p) => p.feeType === 'MONTHLY_FIXED');
    const price = perSession
      ? `${perSession.price.toLocaleString()}원/회`
      : monthly
        ? `${monthly.price.toLocaleString()}원/월`
        : '';

    openShareSheet({
      template: 'class',
      title: MESSAGES.class.shareTitle(classData.className),
      text: classData.description ?? '',
      url: typeof window !== "undefined" ? window.location.href : undefined,
      imageUrl: resolveImageUrl(classData.teamLogoUrl) ?? undefined,
      schedule,
      time,
      venue,
      coach,
      price,
    });
  };

  /* ── 즐겨찾기 (UI 전용, API 미연동) ── */

  const handleToggleFavorite = () => {
    setIsFavorite((prev) => !prev);
  };

  /* ── 데이터 로드 ── */

  useEffect(() => {
    if (!classId) return;
    // Race-guard: classId 변경 또는 unmount 시 진행 중 fetch 의 setState 차단.
    //   Strict Mode 의 effect 더블 실행 / 라우트 전환 race / 백엔드 응답 지연이
    //   stale 응답으로 setState → 부모 리렌더 → effect 재실행 → 무한 루프 유발할
    //   가능성을 제거.
    let cancelled = false;
    // 403 캐치 시 토스트 + 역할별 대시보드 리다이렉트.
    // 매니저가 비소속 수업에 직접 URL 접근하는 경로 차단 (BE getClass 권한 게이트와 짝).
    const handleForbidden = () => {
      toast.error(MESSAGES.class.accessDenied);
      const path = getDashboardPathByUserType(user?.userType) ?? "/";
      navigate(path);
    };

    const load = async () => {
      setIsLoading(true);
      try {
        const clubsRes = await api.get<Array<{ id: string }>>("/teams/my/list");
        if (cancelled) return;
        if (clubsRes.success && Array.isArray(clubsRes.data)) {
          setMyTeamIds(clubsRes.data.map((t) => t.id));
        }
        if (!clubsRes.success || !clubsRes.data?.[0]) {
          const classRes = await api.get<ClassDetail>(`/classes/${classId}`);
          if (cancelled) return;
          if (classRes.success && classRes.data) {
            setClassData(classRes.data);
          } else if (classRes.error?.statusCode === 403) {
            handleForbidden();
            return;
          }
          // [2026-06-09] 팀 없는 사용자(오픈클래스 감독/학부모)도 일정을 조회.
          //   기존엔 classRes 만 호출하고 return 해 scheduleList 가 비어, 상세 '수업 정보'에
          //   날짜별 일정 대신 기간/시간/장소가 잘못 표시되던 버그 수정.
          const [schedRes] = await Promise.allSettled([
            api.get<ClassScheduleItem[]>(`/classes/${classId}/schedules`),
          ]);
          if (cancelled) return;
          if (
            schedRes.status === "fulfilled" &&
            schedRes.value.success &&
            Array.isArray(schedRes.value.data) &&
            schedRes.value.data.length > 0
          ) {
            const activeList = schedRes.value.data.filter((s) => !s.isCancelled);
            setScheduleList(activeList);
            const valid = activeList
              .map((s) => new Date(s.scheduledDate))
              .filter((d) => !Number.isNaN(d.getTime()));
            if (valid.length > 0) {
              const ts = valid.map((d) => d.getTime());
              setScheduleRange({
                start: new Date(Math.min(...ts)).toISOString(),
                end: new Date(Math.max(...ts)).toISOString(),
              });
            }
          }
          return;
        }
        const clubId = clubsRes.data[0].id;

        // [수정 2026-05-15] 일정 조회는 teamId 무관 단축 엔드포인트(`/classes/:id/schedules`)
        //  로 변경 — 오픈클래스(teamId=null) 도 동일 호출로 처리.
        const [classRes, schedRes] = await Promise.allSettled([
          api.get<ClassDetail>(`/teams/${clubId}/classes/${classId}`),
          api.get<ClassScheduleItem[]>(`/classes/${classId}/schedules`),
        ]);
        if (cancelled) return;

        if (
          classRes.status === "fulfilled" &&
          classRes.value.success &&
          classRes.value.data
        ) {
          setClassData(classRes.value.data);
        } else if (
          classRes.status === "fulfilled" &&
          classRes.value.error?.statusCode === 403
        ) {
          handleForbidden();
          return;
        }
        if (
          schedRes.status === "fulfilled" &&
          schedRes.value.success &&
          Array.isArray(schedRes.value.data) &&
          schedRes.value.data.length > 0
        ) {
          const activeList = schedRes.value.data.filter((s) => !s.isCancelled);
          setScheduleList(activeList);
          const valid = activeList
            .map((s) => new Date(s.scheduledDate))
            .filter((d) => !Number.isNaN(d.getTime()));
          if (valid.length > 0) {
            const ts = valid.map((d) => d.getTime());
            setScheduleRange({
              start: new Date(Math.min(...ts)).toISOString(),
              end: new Date(Math.max(...ts)).toISOString(),
            });
          }
        }
      } catch {
        // 네트워크 에러 등 — 무시
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [classId]);

  /* ── 로딩 상태 ── */

  if (isLoading) {
    return null;
  }

  /* ── 에러 상태 ── */

  if (!classData) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar variant="detail" title={isOpenClass ? "오픈클래스 상세" : "훈련 상세"} forceNative />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-20">
          <div
            className="flex items-center justify-center size-16 rounded-2xl bg-it-blue-500/10 text-it-blue-500 ring-4 ring-it-blue-500/5"
            aria-hidden="true"
          >
            <Icon name="error_outline" className="text-[32px]" />
          </div>
          <p className="text-card-emphasis font-bold text-wtext-1 dark:text-white">
            {MESSAGES.error.general}
          </p>
          <p className="text-card-body text-wtext-3 dark:text-rink-300 text-center max-w-[260px]">
            잠시 후 다시 시도해주세요.
          </p>
          <button
            type="button"
            onClick={() => back()}
            className="mt-2 inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-it-blue-500 hover:bg-it-blue-600 text-white text-card-body font-semibold transition-colors motion-reduce:transition-none active:brightness-95"
          >
            뒤로 가기
          </button>
        </div>
      </MobileContainer>
    );
  }

  /* ── 파생 상태 ── */

  const isParent = user?.userType === "parent";
  const userTypeLower = (user?.userType ?? "").toLowerCase();
  const isManagerRole = ["coach", "director", "admin", "academy_director"].includes(
    userTypeLower,
  );
  // 매니저 역할 + 본인 소속 교집합 검사 (이중 안전망 — BE assertClassAccessForManager 와 짝).
  //   - ADMIN: 모든 수업 통과 (디버깅 목적)
  //   - 팀 매니저(COACH/DIRECTOR): class.teamId 가 본인 매니지 팀 목록에 있어야 함
  //   - 오픈클래스(academyId): ACADEMY_DIRECTOR/ADMIN 만 통과 (BE 가 본인 academy 검증)
  //   - 페이지 진입은 BE 게이트가 이미 차단했으므로 이 조건은 ADMIN 의 의도된 노출
  //     +방어선 역할.
  const isOwnTeamClass =
    !!classData.teamId && myTeamIds.includes(classData.teamId);
  const isManager =
    isManagerRole &&
    (userTypeLower === "admin" ||
      (isOpenClass
        ? userTypeLower === "academy_director"
        : isOwnTeamClass));
  // [2026-05-15] 오픈클래스(academyId) 수정·일정관리는 ACADEMY_DIRECTOR/ADMIN 전용.
  //   팀 감독(DIRECTOR)·코치(COACH)는 오픈클래스 수정·일정 권한 없음 → 버튼 숨김.
  //   ACADEMY_DIRECTOR 라도 본인 academy 가 아니면 BE 가드(403)로 차단됨.
  const canManageOpenClass =
    userTypeLower === "academy_director" || userTypeLower === "admin";
  const canEditClass = isManager && (!isOpenClass || canManageOpenClass);
  const enrolled = classData.currentEnrollment ?? 0;
  const capacity = classData.capacity;
  const remaining = Math.max(0, capacity - enrolled);
  const occupancy = capacity > 0 ? Math.round((enrolled / capacity) * 100) : 0;
  const isFull = capacity > 0 && remaining === 0;
  const isUrgent = !isFull && remaining > 0 && remaining <= 3;

  // classes 도메인 SoT (class-categories.ts) — regular/lesson + deprecated/training 도메인 키 호환.
  const rawTypeLabel = classData.trainingType
    ? TRAINING_TYPE_LABEL[classData.trainingType] ?? null
    : null;
  const typeLabel = rawTypeLabel;
  // levelLabel 은 순수히 level 만 표시 (typeLabel fallback 제거 — 색상/의미 혼선 방지)
  const levelLabel = translateLevel(classData.levelRequired);
  const hasProducts = (classData.products ?? []).length > 0;
  // [2026-06-05] 요일별 시간·장소 — 규칙이 있으면 "수업 정보" 카드에 모두 나열,
  //   없으면 기존 단일 startTime/endTime · venueName 표시로 폴백.
  const daySchedules = classData.daySchedules ?? [];
  const hasDaySchedules = daySchedules.length > 0;
  // 정규/오픈 공통 — 등록된 개별 일정(ClassSchedule)이 있으면 달력 + 전체 일정으로 표시한다.
  const hasScheduleList = scheduleList.length > 0;

  /** 수업 주차 — DB 원본 startTime/endTime 우선 (사용자 명시: DB 값과 일치해야 함).
   *  scheduleRange 는 schedules 응답 기반 폴백. */
  const weekCount = (() => {
    const startISO = classData.startTime ?? scheduleRange?.start;
    const endISO = classData.endTime ?? scheduleRange?.end;
    if (!startISO || !endISO) return null;
    const days = Math.ceil(
      (new Date(endISO).getTime() - new Date(startISO).getTime()) /
        (1000 * 60 * 60 * 24),
    );
    if (days <= 0) return null;
    return Math.max(1, Math.ceil(days / 7));
  })();

  /** 단일 회차 여부 — DB 원본 startTime/endTime 비교. */
  const isSingleDay = (() => {
    if (!classData.startTime) return false;
    if (!classData.endTime) return true;
    return formatDate(classData.startTime) === formatDate(classData.endTime);
  })();

  const hasVenue = !!(classData.venueName || classData.venueAddress);

  const capacityAriaLabel =
    capacity > 0
      ? `정원 ${capacity}명 중 ${enrolled}명 신청 · ${remaining > 0 ? `${remaining}석 남음` : "마감"}`
      : "정원 정보 없음";

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar variant="detail" title={isOpenClass ? "오픈클래스 상세" : "훈련 상세"} forceNative />

      <main
        className={cn(
          "flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck",
          // [수정 2026-05-14 D2] 앱 최대 스크롤 시 sticky 액션바와 일정 정보가 겹치는 회귀 수정.
          // 액션바 높이(약 75px) + bottom 오프셋(60px BottomNav) + safe-area-inset-bottom(최대 ~44px) ≈ 180px.
          // pb-44(176px) → pb-52(208px) + safe-area 추가로 모든 디바이스에서 여유 확보.
          isManager
            ? "pb-52 [padding-bottom:calc(13rem+var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)))]"
            : "pb-8",
        )}
        style={{ WebkitOverflowScrolling: "touch" as never }}
      >
        {/* ── 메인 카드 — 헤더(로고 타일 + 칩) + 모집 배너(manager) + 정원 + 빠른 액션(manager) ── */}
        <section
          className="mx-5 mt-3 rounded-[18px] bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 shadow-sm overflow-hidden"
          aria-label="수업 요약"
        >
          {/* 헤더: 로고 타일 + 이름 + 칩 + 우측 액션 */}
          <div className="flex items-center gap-3 px-4 py-2.5">
            {/* 팀 로고 타일 — logoUrl 있으면 이미지, 없으면 기본 아이콘 */}
            {resolveImageSrc(classData.teamLogoUrl) ? (
              <img
                src={resolveImageSrc(classData.teamLogoUrl)}
                alt={classData.club?.clubName ?? ''}
                className="shrink-0 size-12 rounded-2xl object-cover shadow-md bg-wline dark:bg-rink-700"
              />
            ) : (
              <div
                className="shrink-0 flex size-12 items-center justify-center rounded-2xl bg-it-blue-500 text-white shadow-md"
                aria-hidden="true"
              >
                <svg width={26} height={26} viewBox="0 0 26 26" fill="none">
                  <path
                    d="M5 19l4-12 4 4 4-8 4 16"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            )}

            {/* 이름 + 배지 + 메타 — 3단 구조 (2026-05-20 재배치).
                기존: 수업명 옆에 배지를 wrap 으로 붙임 → 수업명 길이에 따라 배지 위치가 달라짐.
                개선: 제목(1줄) → 배지(1줄) → 메타(1줄) 로 시각 위계 명확화 + 배지 위치 일관성 확보. */}
            <div className="flex-1 min-w-0">
              {/* 수업명 — 1열 단독, truncate 로 한 줄 ellipsis */}
              <h1 className="text-card-emphasis font-extrabold text-wtext-1 dark:text-white tracking-tight truncate">
                {classData.className}
              </h1>
              {/* 배지 줄 — 분류(typeLabel: 정규/레슨/대회) + 레벨(levelLabel: 입문/중급/고급).
                  [수정 2026-05-20] `text-card-meta` 커스텀 utility 가 twMerge 의 `text-{color}` 그룹으로
                  잘못 분류되어 `getTrainingTypeBadgeClass` 가 반환하는 `text-blue-700` 등에 의해 제거되던
                  회귀 수정. 그 결과 폰트 사이즈가 부모(16px) 로 inherit 되어 옆 레벨 배지(12px) 보다
                  1.3~2배 크게 표시되는 버그. native arbitrary 값(`text-[12px] leading-[1.45]`)으로 풀어써
                  twMerge 충돌을 회피한다. */}
              {(typeLabel || levelLabel) && (
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {typeLabel && classData.trainingType && (
                    <span
                      className={cn(
                        "px-1.5 py-0.5 rounded-md text-[12px] leading-[1.45] font-extrabold tracking-wider",
                        getTrainingTypeBadgeClass(classData.trainingType),
                      )}
                    >
                      {typeLabel}
                    </span>
                  )}
                  {levelLabel && (
                    <span className="px-1.5 py-0.5 rounded-md bg-it-blue-500/10 text-it-blue-500 text-card-meta font-extrabold tracking-wider">
                      {levelLabel}
                    </span>
                  )}
                </div>
              )}
              {/* 요일·회차 메타는 하단 "수업 정보" 영역에 별도 노출되므로 헤더에서는 생략(중복 방지). */}
            </div>

            {/* 우측 액션 — 찜 / 공유 */}
            <div className="shrink-0 flex items-center">
              <button
                type="button"
                onClick={handleToggleFavorite}
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg transition-colors motion-reduce:transition-none active:brightness-95",
                  isFavorite
                    ? "text-rose-500"
                    : "text-wtext-3 dark:text-rink-300 hover:text-it-blue-500",
                )}
                aria-label={isFavorite ? "찜 해제" : "찜 추가"}
                aria-pressed={isFavorite}
              >
                <Icon
                  name={isFavorite ? "bookmark" : "bookmark_border"}
                  className="text-[18px]"
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="flex size-8 items-center justify-center rounded-lg text-wtext-3 dark:text-rink-300 hover:text-it-blue-500 transition-colors motion-reduce:transition-none active:brightness-95"
                aria-label={MESSAGES.class.shareAriaLabel(classData.className)}
              >
                <Icon
                  name="ios_share"
                  className="text-[18px]"
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>

          {/* [제거 2026-05-19] 모집 상태 인라인 배너 — 정원 충원 영역과 정보 100% 중복 +
              "모집관리" 버튼이 /classes-manage/edit/[id] (수업 상세 + 액션 hub) 으로
              우회 이동하여 의도-동작 mismatch.
              정원 정보는 바로 아래 "정원 충원" 진행률 영역에서 더 정확하게 표시 (enrolled/capacity · occupancy%).
              운영자 액션은 빠른 액션 4종(출석/수강생/결제/공유) + Bottom Action Bar(삭제/일정관리/수정하기) 로 충분.
              /classes-manage/edit/[id] 진입점은 /classes-organize, /coach-schedules 에서 유지. */}

          {/* 정원 + 빠른 액션 영역 — 정원(capacity>0)도 없고 운영자도 아니면 영역 자체 비노출(빈 패딩 방지) */}
          {(capacity > 0 || isManager) && (
          <div className="px-4 pt-3 pb-4">
            {capacity > 0 && !isOpenClass && (
              <div className={cn(isManager ? "mb-3" : "")}>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-card-meta font-bold text-wtext-3 dark:text-rink-300 tracking-widest">
                    정원 충원
                  </span>
                  <span className="text-card-meta font-extrabold text-wtext-1 dark:text-white tabular-nums">
                    {enrolled}/{capacity}명 · {occupancy}%
                  </span>
                </div>
                <div
                  className="h-1 w-full rounded-w-pill bg-wline-2 dark:bg-rink-700 overflow-hidden"
                  role="progressbar"
                  aria-valuenow={enrolled}
                  aria-valuemin={0}
                  aria-valuemax={capacity}
                  aria-label={capacityAriaLabel}
                >
                  <div
                    className={cn(
                      "h-full rounded-w-pill transition-[width] duration-500 motion-reduce:transition-none",
                      isFull
                        ? "bg-wtext-4 dark:bg-wbg0"
                        : isUrgent
                          ? "bg-rose-500"
                          : "bg-it-blue-500",
                    )}
                    style={{ width: `${Math.min(occupancy, 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* 빠른 액션 4종 — manager 전용 (2x2 grid)
                [수정 2026-05-18 SPEC v2] 수강생 버튼이 결제 페이지로 잘못 라우팅되던 버그 fix.
                  수강생(/classes/:id/students) 과 결제 확인(/classes/:id/payments) 을 별도 분리. */}
            {isManager && (
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/attendance-manage?classId=${classId}`)
                  }
                  className="h-9 rounded-[10px] bg-wbg dark:bg-rink-900/40 border border-wline-2 dark:border-rink-700 flex items-center justify-center gap-1.5 hover:border-it-blue-500/40 transition-colors motion-reduce:transition-none active:brightness-95"
                  aria-label="출석 이력 보기"
                >
                  <Icon
                    name="checklist"
                    size={14}
                    className="text-wtext-2 dark:text-rink-100"
                    aria-hidden="true"
                  />
                  <span className="text-card-meta font-bold text-wtext-2 dark:text-rink-100 tracking-tight">
                    출석 이력
                  </span>
                </button>
                {/* [제거 2026-05-19] 코치메모 버튼 삭제 — 백엔드 미구현 + 공식 PRD/로드맵 등재 없음.
                    유사 도메인 ClassDiary(/api/v1/class-diary)가 정식으로 존재. */}
                {/* 선수정보 — 수강생 명단 + 결제 상태를 한 화면에서 확인 (팀·학원 공용).
                    URL: /classes/:id/students ((coach-access) 그룹 RBAC 가드). 기존 학원 전용
                    수강생 페이지를 흡수 통합 — 단일 진입점. */}
                <button
                  type="button"
                  onClick={() => navigate(`/classes/${classId}/students`)}
                  className="h-9 rounded-[10px] bg-wbg dark:bg-rink-900/40 border border-wline-2 dark:border-rink-700 flex items-center justify-center gap-1.5 hover:border-it-blue-500/40 transition-colors motion-reduce:transition-none active:brightness-95"
                  aria-label={MESSAGES.academy.students.actionPlayersAriaLabel}
                >
                  <Icon
                    name="group"
                    size={14}
                    className="text-wtext-2 dark:text-rink-100"
                    aria-hidden="true"
                  />
                  <span className="text-card-meta font-bold text-wtext-2 dark:text-rink-100 tracking-tight">
                    {MESSAGES.academy.students.actionPlayers}
                  </span>
                </button>
              </div>
            )}
          </div>
          )}
        </section>

        {/* ── 수업 정보 카드 — 키-값-보조 테이블 ── */}
        <div className="mx-5 mt-3">
          <p className="px-1 pb-2 text-card-meta font-extrabold text-wtext-2 dark:text-rink-100 tracking-tight">
            수업 정보
          </p>
          <div className="rounded-[18px] bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 shadow-sm px-4">
            {(() => {
              type Row = {
                k: string;
                v: string;
                s: string;
                warn?: boolean;
                /** 보조칸(s)을 탭 가능 버튼으로 만들 때의 핸들러 (예: 담당 코치 전체 보기). */
                onSubClick?: () => void;
              };
              // [수정 2026-05-12] isSingleDay 는 상단(weekCount 옆)에서 한 번 계산해 재사용.

              // [수정 2026-05-15] DB 원본(startTime/endTime) 우선 — 사용자 요청:
              //  수정 화면 입력값과 동일하게 표시. derived field 미사용.
              // 개별 일정이 있으면 기간을 일정의 min~max 날짜로 산출(입력값과 일치),
              //   없으면 DB 단일 대표값(startTime/endTime) 폴백.
              const periodValue = hasScheduleList && scheduleRange
                ? formatDateCompact(scheduleRange.start) ===
                  formatDateCompact(scheduleRange.end)
                  ? formatDateCompact(scheduleRange.start)
                  : `${formatDateCompact(scheduleRange.start)} ~ ${formatDateCompact(scheduleRange.end)}`
                : classData.startTime
                  ? isSingleDay
                    ? formatDateCompact(classData.startTime)
                    : `${formatDateCompact(classData.startTime)} ~ ${formatDateCompact(classData.endTime!)}`
                  : "기간 미정";

              const periodSub = hasScheduleList
                ? `총 ${scheduleList.length}회`
                : isSingleDay
                  ? "단일"
                  : weekCount !== null
                    ? `${weekCount}주`
                    : "—";

              const timeValue =
                classData.startTime && classData.endTime
                  ? `${formatTime(classData.startTime)} ~ ${formatTime(classData.endTime)}`
                  : classData.startTime
                    ? formatTime(classData.startTime)
                    : "시간 미정";

              /**
               * 회당 시간 계산 — startTime/endTime 은 수업 전체 기간(N개월)이
               * 아니라 회차 시간(시:분)을 의미. 시·분만 추출해 일중 차이를 계산.
               */
              const timeSub = (() => {
                if (!classData.startTime || !classData.endTime) return "—";
                const start = new Date(classData.startTime);
                const end = new Date(classData.endTime);
                // naive timestamp → getUTC* 로 추출 (formatTime 과 동일 정책).
                const startMin = start.getUTCHours() * 60 + start.getUTCMinutes();
                const endMin = end.getUTCHours() * 60 + end.getUTCMinutes();
                let diffMin = endMin - startMin;
                if (diffMin < 0) diffMin += 24 * 60; // 자정 넘김 보정
                if (diffMin <= 0) return "—";
                if (diffMin >= 60) {
                  const hours = Math.floor(diffMin / 60);
                  const mins = diffMin % 60;
                  return mins
                    ? `${hours}시간 ${mins}분/회`
                    : `${hours}시간/회`;
                }
                return `${diffMin}분/회`;
              })();

              const venueValue = classData.venueName ?? "장소 미정";
              const venueSub = classData.venueAddress
                ? "주소 등록"
                : classData.venueName
                  ? "—"
                  : "배정 필요";
              const venueWarn = !classData.venueName;

              // 오픈클래스(academyId) — 노출팀 대신 회당 훈련비(PER_SESSION 상품 가격) 표시.
              const isOpen = !!classData.academyId;
              const feeValue =
                classData.singlePriceLabel === "krw" && classData.singlePrice
                  ? `${classData.singlePrice.toLocaleString()}원`
                  : "별도 책정";

              // [대상 연령] targetBirthYears(SoT) 우선 — 연속이면 "2015~2020년생",
              //   비연속이면 "2015·2017년생", 보조(s)에 한국나이. 빈 배열/미존재 시 ageMin/ageMax 폴백,
              //   그래도 없으면 "전 연령".
              const ageRow: Row = (() => {
                const years = [...(classData.targetBirthYears ?? [])].sort(
                  (a, b) => a - b,
                );
                if (years.length > 0) {
                  const isContiguous = years.every(
                    (y, i) => i === 0 || y === years[i - 1] + 1,
                  );
                  const yearLabel =
                    isContiguous && years.length > 1
                      ? `${years[0]}~${years[years.length - 1]}년생`
                      : `${years.join("·")}년생`;
                  return { k: "대상", v: yearLabel, s: "" };
                }
                return { k: "대상", v: "전체", s: "" };
              })();

              // 개별 일정(ClassSchedule) 또는 요일 규칙(daySchedules)이 있으면 시간·장소
              //   단일 행을 빼고 아래 멀티라인 "일정" 행으로 일정별 시간+장소를 나열한다.
              //   기간 행은 일정 min~max·총 N회로 산출해 항상 표시한다.
              // 개별 일정(달력) 또는 요일 규칙이 있으면 시간·장소는 그쪽에서 표시하므로
              //   단일 행을 빼고, 단일 회차일 때만 단일 시간·장소 행을 둔다.
              const rows: Row[] = [
                { k: "기간", v: periodValue, s: periodSub } as Row,
                ...(hasScheduleList || hasDaySchedules
                  ? []
                  : [
                      { k: "시간", v: timeValue, s: timeSub } as Row,
                      { k: "장소", v: venueValue, s: venueSub, warn: venueWarn } as Row,
                    ]),
                ageRow,
                ...(isOpen
                  ? [{ k: "회당\n훈련비", v: feeValue, s: "" } as Row]
                  : []),
              ];

              return (
                <>
                  {rows.map((r, i, arr) => (
                    <div
                      key={r.k}
                      className={cn(
                        "flex items-center gap-3 py-2.5",
                        (i < arr.length - 1 || (hasDaySchedules && !hasScheduleList)) &&
                          "border-b border-wline-2 dark:border-rink-700",
                      )}
                    >
                      <div className="w-12 text-[11px] font-bold text-wtext-3 dark:text-rink-300 tracking-wider whitespace-pre-line leading-tight">
                        {r.k}
                      </div>
                      <div
                        className={cn(
                          "flex-1 text-[13px] font-semibold tracking-tight tabular-nums truncate",
                          r.warn
                            ? "text-orange-500"
                            : "text-wtext-1 dark:text-white",
                        )}
                      >
                        {r.v}
                      </div>
                      {r.onSubClick ? (
                        <button
                          type="button"
                          onClick={r.onSubClick}
                          className="shrink-0 inline-flex items-center gap-0.5 min-h-[28px] pl-1.5 -mr-1 text-[11px] font-bold text-it-blue-500 active:brightness-90"
                          aria-label={`담당 코치 전체 보기 (${r.s})`}
                        >
                          {r.s}
                          <Icon name="chevron_right" className="text-[14px]" aria-hidden="true" />
                        </button>
                      ) : (
                        <div className="text-[11px] font-medium text-wtext-3 dark:text-rink-300 shrink-0">
                          {r.s}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* 요일별 시간·장소 — 규칙이 있고 개별 일정이 없을 때만(구버전 요일 등록 호환). */}
                  {hasDaySchedules && !hasScheduleList && (
                    <div className="flex items-start gap-3 py-2.5">
                      <div className="w-12 text-[11px] font-bold text-wtext-3 dark:text-rink-300 tracking-wider pt-0.5">
                        일정
                      </div>
                      <ul className="flex-1 flex flex-col gap-1.5 list-none">
                        {sortDaySchedules(daySchedules).map((d, idx) => (
                          <li
                            key={`${d.dayOfWeek}-${idx}`}
                            className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
                          >
                            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-md bg-it-blue-500/10 text-it-blue-500 text-[11px] font-extrabold">
                              {d.dayOfWeek}
                            </span>
                            <span className="text-[13px] font-semibold tracking-tight tabular-nums text-wtext-1 dark:text-white">
                              {d.startTime}
                              {d.endTime ? ` ~ ${d.endTime}` : ""}
                            </span>
                            {d.venueName && (
                              <span className="text-[12px] font-medium text-wtext-3 dark:text-rink-300">
                                {d.venueName}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>

        {/* ── 수업 소개 카드 ── */}
        <div className="mx-5 mt-4">
          <p className="px-1 pb-2 text-card-meta font-extrabold text-wtext-2 dark:text-rink-100 tracking-tight">
            수업 소개
          </p>
          <div className="rounded-[18px] bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 shadow-sm px-4 py-3.5">
            <p className="text-card-body text-wtext-2 dark:text-rink-100 leading-relaxed whitespace-pre-line">
              {classData.description || "등록된 설명이 없습니다."}
            </p>
          </div>
        </div>

        {/* ── 수업일정(일정 목록) + 캘린더 보기(아코디언) — 읽기 전용 ── */}
        {hasScheduleList && (
          <>
            {/* 수업일정 — 일정 목록 (캘린더 위) */}
            <div className="mx-5 mt-4">
              <p className="px-1 pb-2 text-card-meta font-extrabold text-wtext-2 dark:text-rink-100 tracking-tight">
                수업일정
                <span className="ml-1.5 font-semibold text-wtext-3 dark:text-rink-300 tabular-nums">
                  {scheduleList.length}건
                </span>
              </p>
              <div className="rounded-[18px] bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 shadow-sm overflow-hidden">
                <ScheduleCalendarView schedules={scheduleList} readOnly part="list" />
              </div>
            </div>

            {/* 캘린더 보기 — 아코디언, 기본 접힘 */}
            <div className="mx-5 mt-4">
              <button
                type="button"
                onClick={() => setShowCalendar((v) => !v)}
                aria-expanded={showCalendar}
                className="flex w-full items-center justify-between px-1 pb-2"
              >
                <span className="text-card-meta font-extrabold text-wtext-2 dark:text-rink-100 tracking-tight">
                  캘린더 보기
                </span>
                <Icon
                  name={showCalendar ? 'expand_less' : 'expand_more'}
                  className="text-xl text-wtext-3 dark:text-rink-300"
                  aria-hidden="true"
                />
              </button>
              {showCalendar && (
                <div className="rounded-[18px] bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 shadow-sm overflow-hidden">
                  <ScheduleCalendarView schedules={scheduleList} readOnly part="calendar" />
                </div>
              )}
            </div>
          </>
        )}

        {/* ── 가격 표시 (싱글/월 가격 라벨 기반) ──
            [추가 2026-05-15 T03 협업 / T05-F1] singlePriceLabel/monthlyPriceLabel 노출.
              · 회당 가격 + 정기권 2열 표기
              · 라벨 분기: krw → "금액원", tbd → "별도 책정"
              · 둘 다 표시 불가일 때만 섹션 숨김. */}
        {(() => {
          const singleText = formatClassPriceLabel(
            classData.singlePriceLabel,
            classData.singlePrice,
          );
          const monthlyText = formatClassPriceLabel(
            classData.monthlyPriceLabel,
            classData.monthlyPrice,
          );
          if (!singleText && !monthlyText) return null;
          return (
            <div className="mx-5 mt-4">
              <p className="px-1 pb-2 text-card-meta font-extrabold text-wtext-2 dark:text-rink-100 tracking-tight">
                가격
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-[14px] border border-wline-2 bg-white p-3 dark:border-rink-700 dark:bg-rink-800">
                  <p className="text-card-meta font-bold uppercase tracking-wider text-wtext-3 dark:text-wtext-4">
                    회당
                  </p>
                  <p className="mt-1 text-card-title font-extrabold text-wtext-1 dark:text-white tabular-nums">
                    {singleText ?? "—"}
                  </p>
                </div>
                <div className="rounded-[14px] border border-wline-2 bg-white p-3 dark:border-rink-700 dark:bg-rink-800">
                  <p className="text-card-meta font-bold uppercase tracking-wider text-wtext-3 dark:text-wtext-4">
                    정기권
                  </p>
                  <p className="mt-1 text-card-title font-extrabold text-wtext-1 dark:text-white tabular-nums">
                    {monthlyText ?? "—"}
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── 수강 플랜 — 카드 리스트 (BEST 배지) ── */}
        <div className="mx-5 mt-4">
          <p className="px-1 pb-2 text-card-meta font-extrabold text-wtext-2 dark:text-rink-100 tracking-tight">
            {isOpenClass ? "훈련비용" : "수업료"}
          </p>
          {hasProducts ? (
            <div className="flex flex-col gap-2">
              {(() => {
                // [2026-06-09] 수강 플랜 정렬 — 1회권→N회권(PER_SESSION, sessionsPerMonth 오름차순)
                //   →전체(MONTHLY_FIXED) 순으로 노출.
                const products = [...(classData.products ?? [])].sort((a, b) => {
                  const order = (p: ClassProduct) =>
                    p.feeType === 'MONTHLY_FIXED' ? 100000 : (p.sessionsPerMonth ?? 0);
                  return order(a) - order(b);
                });
                return products.map((p) => {
                  // [2026-06-09] 오픈클래스는 '수업 종료일 초과' 오판정으로 비활성/문구가 뜨지 않도록
                  //   항상 활성 처리(오픈클래스는 종료일 개념이 날짜별 일정과 맞지 않음).
                  const baseDisabled = !isOpenClass && p.isPurchasable === false;
                  // [2026-06-09] 학부모 회차 복수 선택(체크박스). 전체(MONTHLY_FIXED) 선택 시
                  //   회차별(PER_SESSION)은 배타로 비활성.
                  const fullSelected =
                    !isManager &&
                    products.some(
                      (pp) => pp.feeType === 'MONTHLY_FIXED' && selectedProductIds.has(pp.id),
                    );
                  const isLocked =
                    !isManager && fullSelected && p.feeType !== 'MONTHLY_FIXED';
                  // [2026-06-18] 선택 자녀가 이미 결제완료한 패키지 — 재선택 불가, '결제완료' 표시.
                  const isPaidPackage = !isManager && !!paidProductId && p.id === paidProductId;
                  const isDisabled = baseDisabled || isLocked || isPaidPackage;
                  const isSelected = !isManager && selectedProductIds.has(p.id);
                  const disabledBadge = baseDisabled
                    ? p.disabledReason ?? MESSAGES.classProduct.unavailableEndDateExceed
                    : null;
                  return (
                    <div
                      key={p.id}
                      onClick={
                        !isManager && !isDisabled
                          ? () => handleProductToggle(p.id, products)
                          : undefined
                      }
                      role={!isManager && !isDisabled ? 'button' : undefined}
                      aria-pressed={!isManager && !isDisabled ? isSelected : undefined}
                      className={cn(
                        "relative flex items-center gap-3 px-4 py-3.5 rounded-[14px] shadow-sm transition-colors motion-reduce:transition-none",
                        !isManager && !isDisabled && "cursor-pointer",
                        isSelected && "ring-2 ring-it-blue-500 ring-offset-1 dark:ring-offset-rink-900",
                        // [2026-06-18] 결제완료 패키지 — emerald 강조 테두리.
                        isPaidPackage && "ring-2 ring-emerald-500 ring-offset-1 dark:ring-offset-rink-900",
                        // [수정 2026-05-22 사용자 직접 지시] 회색 톤으로 다운, 카드 내부 사유 표시.
                        //   학부모/학생은 백엔드에서 비활성 응답 자체 제외되므로 본 분기는 코치·감독·관리자 시점에서만 활성.
                        isDisabled && !isPaidPackage
                          ? "border border-wline-2 dark:border-rink-700 bg-wline-2/40 dark:bg-rink-700/40"
                          : "border border-wline-2 dark:border-rink-700 bg-white dark:bg-rink-800",
                      )}
                      aria-disabled={isDisabled || undefined}
                    >
                      {/* [2026-06-09] 학부모 회차 복수 선택 체크박스 (가독성).
                          [2026-06-18] 결제완료 패키지는 emerald 체크로 '완료' 표시. */}
                      {!isManager && (
                        <span
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                            isPaidPackage
                              ? 'bg-emerald-500 border-emerald-500 text-white'
                              : isSelected
                                ? 'bg-it-blue-500 border-it-blue-500 text-white'
                                : 'bg-wsurface dark:bg-rink-900 border-wline-2 dark:border-rink-600',
                            isDisabled && !isPaidPackage && 'opacity-40',
                          )}
                          aria-hidden="true"
                        >
                          {(isSelected || isPaidPackage) && <Icon name="check" className="text-sm" />}
                        </span>
                      )}
                      <div className={cn("flex-1 min-w-0", isDisabled && !isPaidPackage && "opacity-70")}>
                        <div className="flex items-center gap-1.5">
                          <p className="text-card-body font-extrabold text-wtext-1 dark:text-white tracking-tight truncate">
                            {p.productName}
                          </p>
                          {/* [2026-06-18] 선택 자녀가 이미 결제완료한 패키지 배지. */}
                          {isPaidPackage && (
                            <span className="shrink-0 inline-flex items-center rounded-w-pill bg-emerald-100 px-2 py-0.5 text-card-caption font-extrabold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                              결제완료
                            </span>
                          )}
                        </div>
                        {/* [수정 2026-05-22 사용자 직접 지시] 비활성 사유는 카드 안쪽 회색 톤으로 표시.
                            학부모/학생은 백엔드에서 비활성 응답 자체 제외되므로 본 라벨은 코치·감독·관리자에게만 노출. */}
                        {isDisabled && disabledBadge && (
                          <p
                            role="status"
                            className="mt-1 text-card-caption font-semibold text-wtext-3 dark:text-rink-300 truncate"
                          >
                            {disabledBadge}
                          </p>
                        )}
                      </div>
                      <div className={cn("shrink-0 text-right", isDisabled && "opacity-70")}>
                        <p className="text-card-title font-extrabold text-wtext-1 dark:text-white tracking-tight tabular-nums leading-none">
                          {formatPrice(p.price)}
                          <span className="ml-0.5 text-card-meta font-bold text-wtext-3 dark:text-rink-300">
                            원
                          </span>
                        </p>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-[18px] bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 shadow-sm px-4 py-4">
              <div
                className="shrink-0 flex size-9 items-center justify-center rounded-lg bg-wline-2 dark:bg-rink-700 text-wtext-3 dark:text-rink-300"
                aria-hidden="true"
              >
                <Icon name="payments" size={18} />
              </div>
              <p className="text-card-body text-wtext-3 dark:text-rink-300">
                가격 정보를 준비 중입니다.
              </p>
            </div>
          )}
        </div>

        {/* ── 장소 카드 ── */}
        {hasVenue && (
          <div className="mx-5 mt-4">
            <p className="px-1 pb-2 text-card-meta font-extrabold text-wtext-2 dark:text-rink-100 tracking-tight">
              장소
            </p>
            <div className="rounded-[18px] bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 shadow-sm overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-3">
                <div
                  className="shrink-0 flex size-9 items-center justify-center rounded-lg bg-it-blue-500/10 text-it-blue-500"
                  aria-hidden="true"
                >
                  <Icon name="location_on" size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-card-body font-bold text-wtext-1 dark:text-white truncate tracking-tight">
                    {classData.venueName ?? "장소 미정"}
                  </p>
                  {classData.venueAddress && (
                    <p className="text-card-meta text-wtext-3 dark:text-rink-300 truncate mt-0.5">
                      {classData.venueAddress}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── parent ChildSelector + CTA — 자녀 단일 선택 진입점 ──
            [추가 2026-05-18] Option A1 — 자녀 선택을 수업 상세에서 단일 진입점으로 통일.
              - ChildSelector: 자녀 ≥1명 일 때 노출. 자녀별 잠금 상태(enrolled/notApproved/ageIncompatible) 표시.
              - 자녀가 전원 부적합이면 안내 메시지 + CTA disabled.
              - 결제 옵션 페이지(/payment/options)는 readonly 로 표시만 (변경 불가).

            CTA 라벨 분기 (selectedChildId 기준):
              - paidEnrollment 존재 → 좌측 "결제취소" / 우측 "결제완료" (disabled)
              - 선택 자녀가 enrolled/notApproved/ageIncompatible → 우측 사유 라벨 + disabled
              - 그 외 → 좌측 "돌아가기" / 우측 "등록(결제)하기"
        */}
        {isParent && (
          <div className="mx-5 mt-5 flex flex-col gap-4">
            {/* ChildSelector — 자녀 ≥1명 일 때만 노출. 0명은 handleEnrollClick 의 modal.alert 가 안내. */}
            {parentChildren.length > 0 && (() => {
              // "모두 잠금" 판정 (paid 는 잠금 아님 — 결제취소 가능하므로 제외)
              const noneSelectable = parentChildren.every(
                (c) =>
                  enrolledChildIds.has(c.id) ||
                  notApprovedChildIds.has(c.id) ||
                  ageIncompatibleChildIds.has(c.id),
              );
              const ageRangeLabel =
                classData.ageMin != null || classData.ageMax != null
                  ? classData.ageMin != null && classData.ageMax != null
                    ? `${classData.ageMin}~${classData.ageMax}세`
                    : classData.ageMin != null
                      ? `${classData.ageMin}세 이상`
                      : `${classData.ageMax}세 이하`
                  : null;
              return (
                <section aria-label="수강생 선택">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <h3 className="text-card-body font-bold text-wtext-1 dark:text-white">
                      수강생 선택
                    </h3>
                    {ageRangeLabel && (
                      <span className="text-card-meta font-medium text-wtext-3 dark:text-rink-300">
                        수강 연령 · {ageRangeLabel}
                      </span>
                    )}
                  </div>
                  <ChildSelector
                    childList={parentChildren}
                    selectedId={selectedChildId}
                    onSelect={setSelectedChildId}
                    enrolledChildIds={enrolledChildIds}
                    ageIncompatibleChildIds={ageIncompatibleChildIds}
                    notApprovedChildIds={notApprovedChildIds}
                    approvalStatusById={approvalStatusById}
                    paidChildIds={
                      new Set(Array.from(paidByChildId.keys()))
                    }
                    multiSelect={isOpenClass}
                    selectedIds={selectedChildIds}
                    onToggle={handleChildToggle}
                  />
                  {/* 안내 메시지 — 모든 자녀가 잠금이면(paid 제외) 메시지 표시 */}
                  {noneSelectable && ageRangeLabel && (
                    <p className="text-card-meta text-wtext-3 dark:text-rink-300 px-1 mt-2">
                      {MESSAGES.enrollment.noEligibleChildForAge(ageRangeLabel)}
                    </p>
                  )}
                  {noneSelectable && !ageRangeLabel && (
                    <p className="text-card-meta text-wtext-3 dark:text-rink-300 px-1 mt-2">
                      {MESSAGES.enrollment.allChildrenEnrolled}
                    </p>
                  )}
                </section>
              );
            })()}

            {/* CTA 영역 — 선택 자녀 상태별 라벨 분기 */}
            {(() => {
              // 선택 자녀의 부적합 상태 판정
              const isSelectedEnrolled =
                !!selectedChildId && enrolledChildIds.has(selectedChildId);
              const isSelectedNotApproved =
                !!selectedChildId && notApprovedChildIds.has(selectedChildId);
              const isSelectedAgeIncompatible =
                !!selectedChildId && ageIncompatibleChildIds.has(selectedChildId);
              const approvalKind = selectedChildId
                ? approvalStatusById.get(selectedChildId)
                : undefined;

              // disabled 라벨 — 선택 자녀 사유 우선순위 반영
              let disabledRightLabel: string | null = null;
              if (!hasProducts) disabledRightLabel = "신청 불가";
              else if (isFull) disabledRightLabel = "정원 마감";
              else if (isSelectedEnrolled)
                disabledRightLabel = MESSAGES.enrollment.disabledEnrolledLabel;
              else if (isSelectedNotApproved)
                disabledRightLabel =
                  approvalKind === "rejected"
                    ? MESSAGES.team.disabledRejectedLabel
                    : approvalKind === "pending"
                      ? MESSAGES.team.disabledPendingLabel
                      : MESSAGES.team.disabledNotMemberLabel;
              else if (isSelectedAgeIncompatible)
                disabledRightLabel = MESSAGES.enrollment.disabledAgeLabel;

              const rightDisabled =
                !!paidEnrollment ||
                !hasProducts ||
                isFull ||
                !selectedChildId ||
                isSelectedEnrolled ||
                isSelectedNotApproved ||
                isSelectedAgeIncompatible;

              return (
                // [2026-06-18 사용자 직접 지시] 배치·문구 변경 —
                //   신청 전: [신청하기(좌)] [돌아가기(우)]
                //   신청 후: [신청완료(좌)] [신청취소(우)]
                <div className="flex gap-2">
                  {/* 좌 — 주 액션/상태: 신청하기 / 신청완료 / (후불) 수강 상태 */}
                  <button
                    type="button"
                    onClick={handleEnrollClick}
                    disabled={rightDisabled || !!postpaidEnrollment}
                    aria-disabled={rightDisabled || !!postpaidEnrollment}
                    className="flex-[6] min-w-0 h-12 rounded-xl bg-it-blue-500 hover:bg-it-blue-600 text-white font-extrabold text-card-body tracking-tight transition-colors motion-reduce:transition-none active:brightness-95 disabled:bg-wline dark:disabled:bg-rink-700 disabled:text-wtext-3 disabled:cursor-not-allowed disabled:hover:bg-wline dark:disabled:hover:bg-rink-700"
                  >
                    {postpaidEnrollment
                      ? MESSAGES.enrollment.enrolledLabel
                      : paidEnrollment
                        ? "신청완료"
                        : disabledRightLabel ??
                          (isPostpaid
                            ? MESSAGES.enrollment.postpaidEnrollCta
                            : "신청하기")}
                  </button>
                  {/* 우 — 보조: 돌아가기 / 신청취소 / (후불) 수강 종료 */}
                  <button
                    type="button"
                    onClick={
                      paidEnrollment
                        ? handleCancelPayment
                        : postpaidEnrollment
                          ? handleEndEnrollment
                          : () => back()
                    }
                    disabled={paidEnrollment || postpaidEnrollment ? isCancelling : false}
                    aria-disabled={paidEnrollment || postpaidEnrollment ? isCancelling : false}
                    className={cn(
                      "flex-[4] min-w-0 h-12 rounded-xl font-bold text-card-body tracking-tight transition-colors motion-reduce:transition-none active:brightness-95 disabled:cursor-not-allowed",
                      paidEnrollment || postpaidEnrollment
                        ? "border border-red-500 bg-white dark:bg-rink-800 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 disabled:opacity-60"
                        : "border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-wtext-2 dark:text-rink-100 hover:bg-wbg dark:hover:bg-rink-700",
                    )}
                  >
                    {paidEnrollment
                      ? isCancelling
                        ? "취소 중..."
                        : "신청취소"
                      : postpaidEnrollment
                        ? isCancelling
                          ? MESSAGES.enrollment.ending
                          : MESSAGES.enrollment.endConfirm
                        : "돌아가기"}
                  </button>
                </div>
              );
            })()}
          </div>
        )}
      </main>

      {/* ── manager 스티키 액션바 — 휴지통 + 일정 관리 + 수업 수정하기 ── */}
      {/* [수정 2026-05-13 D20] bottom 하드코딩 (64px) 제거 — iOS 노치/홈인디케이터,
         Android navigation bar 디바이스에서 액션바가 BottomNav 와 겹쳐 잘림 보고.
         BottomNav 기본 높이(60px) + safe-area-inset-bottom 폴백으로 전 디바이스 대응.

         [수정 2026-05-14 D2] flex-1/flex-[1.4] 기반 폭 분배가 좁은 폭(xs ≤359px)에서
         "수업 수정하기" / "일정 관리" 라벨이 부모 박스를 침범하던 회귀 수정.
         → grid grid-cols-[auto_1fr_1.4fr] gap-2 w-full + 각 텍스트 버튼 min-w-0 + label truncate.
         delete 아이콘 버튼은 size-11 고정 폭 유지(아이콘이 늘어나지 않도록).

         [수정 2026-05-15] 오픈클래스 액션바는 팀 감독/코치에게 권한 없음 →
         canEditClass(=isManager && (!isOpenClass || academy_director/admin)) 가드로
         삭제·일정관리·수업수정 3개 버튼 모두 통째로 숨김. */}
      {canEditClass && (
        <div
          className={cn(
            "absolute left-0 right-0 z-30 bg-white dark:bg-rink-800 border-t border-wline-2 dark:border-rink-700 px-4 py-3 grid gap-2 w-full items-center",
            // [2026-06-09] 오픈클래스는 일정 관리 슬롯이 없어 2열(삭제+수정) — 간격 제거.
            isOpenClass ? "grid-cols-[auto_1fr]" : "grid-cols-[auto_1fr_1.4fr]",
          )}
          style={{ bottom: 'calc(60px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))' }}
          aria-label="수업 관리 액션바"
        >
          <button
            type="button"
            // [수정 2026-05-15] 결제이력(paid Enrollment) 기준 가드 — 사용자 명시:
            //  "1명이라도 결제이력이 있으면 삭제할 수 없고 삭제불가 메시지".
            //  paidEnrollmentCount > 0 → disabled + 안내. 0이면 active.
            disabled={(classData.paidEnrollmentCount ?? 0) > 0}
            onClick={() => {
              if ((classData.paidEnrollmentCount ?? 0) > 0) {
                toast.error(
                  `결제 이력이 있는 수업은 삭제할 수 없습니다 (결제자 ${classData.paidEnrollmentCount}명)`,
                );
                return;
              }
              setShowDeleteConfirm(true);
            }}
            aria-label={(classData.paidEnrollmentCount ?? 0) > 0 ? '결제 이력이 있어 삭제할 수 없습니다' : '수업 삭제'}
            title={(classData.paidEnrollmentCount ?? 0) > 0 ? `결제 이력이 있어 삭제할 수 없습니다 (${classData.paidEnrollmentCount}명)` : '수업 삭제'}
            className={cn(
              'size-11 shrink-0 rounded-xl border flex items-center justify-center transition-colors motion-reduce:transition-none',
              (classData.paidEnrollmentCount ?? 0) > 0
                ? 'border-wline-2 dark:border-rink-700 bg-wline-2 dark:bg-rink-700 text-wtext-3 dark:text-wtext-4 cursor-not-allowed'
                : 'border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-red-700 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 active:brightness-95',
            )}
          >
            <Icon
              name="delete_outline"
              className="text-[18px]"
              aria-hidden="true"
            />
          </button>
          {/* [수정 2026-05-15] 일정 관리/수업 수정하기 — 오픈클래스는 팀 감독/코치가
              권한 없으므로 숨김. ACADEMY_DIRECTOR/ADMIN 만 표시. canEditClass 가
              가드 (팀 수업이면 무조건 표시, 오픈클래스면 academy_director/admin 만). */}
          {/* [2026-06-09] 오픈클래스는 일정 관리 슬롯 자체를 제거 — 2열 grid 로 간격 해소.
              일정 추가/삭제는 수업 수정 화면에서 한다. */}
          {!isOpenClass &&
            (classData.approvalStatus === "APPROVED" && canEditClass ? (
              <button
                type="button"
                onClick={() => navigate(`/classes-manage/${classId}/schedules`)}
                aria-label="수업 일정 관리"
                className="min-w-0 h-11 rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-wtext-1 dark:text-white text-card-body font-extrabold tracking-tight hover:bg-wbg dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none active:brightness-95 truncate"
              >
                일정 관리
              </button>
            ) : (
              <div className="min-w-0" aria-hidden="true" />
            ))}
          {canEditClass && (
            <button
              type="button"
              // [수정 2026-05-11] 수업 수정하기 → 수업 상세(/classes-manage/edit/[id]) 가 아니라
              //  실제 수정 폼(/classes-manage/create?edit={classId}) 으로 직접 이동.
              onClick={() => navigate(editClassPath)}
              aria-label="수업 수정하기"
              className="min-w-0 h-11 rounded-xl bg-it-blue-500 hover:bg-it-blue-600 text-white text-card-body font-extrabold tracking-tight transition-colors motion-reduce:transition-none active:brightness-95 truncate"
            >
              수업 수정하기
            </button>
          )}
        </div>
      )}

      {/* ── 삭제 확인 모달 — 감독/코치 전용 ── */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="class-delete-title"
        >
          <div className="bg-white dark:bg-rink-800 rounded-2xl w-full max-w-sm p-6 shadow-md">
            <div className="w-12 h-12 rounded-w-pill bg-red-100 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-4">
              <Icon
                name="warning"
                className="text-2xl text-red-500"
                aria-hidden="true"
              />
            </div>
            <h3
              id="class-delete-title"
              className="text-card-title font-bold text-wtext-1 dark:text-white text-center mb-2"
            >
              수업 삭제
            </h3>
            <p className="text-card-body text-wtext-3 dark:text-rink-300 text-center mb-6 leading-relaxed">
              {MESSAGES.class.deleteConfirm}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 h-11 rounded-xl border border-wline dark:border-rink-700 text-card-body font-semibold text-wtext-2 dark:text-rink-100 hover:bg-wbg dark:hover:bg-rink-800 transition-colors motion-reduce:transition-none active:brightness-95"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                aria-disabled={isDeleting}
                className={cn(
                  "flex-1 h-11 rounded-xl text-card-body font-semibold text-white transition-colors motion-reduce:transition-none",
                  isDeleting
                    ? "bg-red-300 cursor-not-allowed"
                    : "bg-red-500 hover:bg-red-600 active:brightness-95",
                )}
              >
                {isDeleting ? "삭제 중..." : "삭제하기"}
              </button>
            </div>
          </div>
        </div>
      )}

    </MobileContainer>
  );
}
