"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo, Suspense } from "react";
import nextDynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { NavLink, useNavigation } from "@/components/ui/NavLink";
import { Spinner } from "@/components/ui/Spinner";
import { Icon } from "@/components/ui/Icon";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import {
  PaymentStepIndicator,
  StepHeadline,
} from "@/components/payment/PaymentStepIndicator";
import { PaymentOptionCard } from "@/components/payment/PaymentOptionCard";
// [수정 2026-05-18] 자녀 선택 readonly 통일 — 인라인 ChildSelector 제거, SelectedChildDisplay 사용.
//   자녀 선택은 수업 상세 페이지(/classes/[id]) 에서만 가능. URL childId 누락 시 redirect.
import { SelectedChildDisplay } from "@/components/payment/SelectedChildDisplay";
import { BottomSheetSelector, BottomSheetConfirm } from "@/components/ui";
import type { ConfirmTermItem } from "@/components/ui";
import { api } from "@/services/api-client";
import type { FeeType as PaymentFeeType } from "@/types/payment";
import { usePageReady } from '@/hooks/usePageReady';
import { useChildren } from "@/hooks/useChildren";
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { useNativeUI } from "@/hooks/useNativeUI";
import { MESSAGES } from "@/lib/messages";
import { cn } from "@/lib/utils";
import { getChildEligibilityForClass, isChildAgeEligibleForClass } from "@/lib/child-status";

const GlobalMenu = nextDynamic(
  () =>
    import("@/components/layout/GlobalMenu").then((mod) => ({
      default: mod.GlobalMenu,
    })),
  { ssr: false },
);

interface ClassInfo {
  id: string;
  className: string;
  instructorName: string;
  startTime: string;
  endTime: string;
  levelRequired?: string | null;
  ageMin?: number | null;
  ageMax?: number | null;
  /** 대상 출생연도 개별 목록(SoT). [] 또는 미존재 = 전 연령. */
  targetBirthYears?: number[] | null;
  /** 팀 수업의 팀 ID (백엔드 신 표준 — Class.teamId SoT) */
  teamId?: string | null;
  /** 팀 수업의 팀 ID (구 호환 — 오픈클래스면 null/undefined) */
  clubId?: string | null;
  /** 오픈클래스 식별 — academyId 있으면 회원/가입 개념 없는 수업 단위 등록 (§4.6) */
  academyId?: string | null;
}

// 수업 나이 범위를 사용자에게 보여줄 레이블로 포맷 (null-safe, 한국나이 기준)
function formatAgeRangeLabel(
  ageMin?: number | null,
  ageMax?: number | null,
): string | null {
  if (ageMin == null && ageMax == null) return null;
  if (ageMin != null && ageMax != null) return `${ageMin}~${ageMax}세`;
  if (ageMin != null) return `${ageMin}세 이상`;
  return `${ageMax}세 이하`;
}

interface ClassProduct {
  id: string;
  productName: string;
  description?: string | null;
  price: number;
  sessionsPerMonth: number;
  feeType?: string;
  feePerSession?: number;
  sessionsPerWeek?: number;
  billingTiming?: string;
  // PACKAGE_WEEKS_SPEC §6 신규 응답 필드 — 정기권 단위 정합.
  durationDays?: number | null;
  packageWeeks?: number | null;
  packageTotalSessions?: number | null;
  packageSessionsPerWeek?: number | null;
  // PACKAGE_END_GUARD (2026-05-22) — 백엔드 getClassProducts 계산 필드.
  isActive?: boolean;
  isPurchasable?: boolean;
  classEndDate?: string | null;
  expectedExpiresAt?: string | null;
  disabledReason?: string | null;
}

// 수업 결제 옵션 페이지에서 지원하는 FeeType — 대회(PER_GAME) 는 별도 페이지에서 처리.
// 공용 FeeType 은 @/types/payment 에서 import (PaymentFeeType).
type FeeType = Extract<PaymentFeeType, "MONTHLY_FIXED" | "PER_SESSION">;

interface EnrollmentItem {
  id: string;
  child?: { id: string };
  class?: { id: string };
  requester?: { id: string };
  status: string;
}

const ENROLLED_STATUSES = new Set([
  "pending",
  "pending_approval",
  "approved",
  "paid",
]);

function PaymentOptionsContent() {
  // [appbar-harness-v2] Step 2: 옵션 선택 — Status bar + AppBar 명시.
  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle: '수업 결제',
    showBottomNav: false,
    showBackButton: true,
  });

  const { back } = useNavigation();
  const router = useRouter();
  const { user } = useSessionAuth();
  const searchParams = useSearchParams();
  const classId = searchParams?.get("classId") ?? "";
  const productId = searchParams?.get("productId") ?? "";
  // [수정 2026-05-18] childId 는 자녀 선택 단일 진입점(수업 상세 ChildSelector) 에서 필수 전달.
  //   - 누락 시 수업 상세로 redirect.
  //   - 결제 옵션 페이지에서는 더 이상 자녀 변경 불가 (SelectedChildDisplay 로 readonly 표시).
  const initialChildId = searchParams?.get("childId") ?? "";

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // selectedChild — URL childId 로 고정. 본 페이지에서 변경 안 함 (readonly).
  const [selectedChild] = useState(initialChildId);
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Phase 2 P3/P4 통합 — BottomSheetSelector(옵션 패키지) + BottomSheetConfirm(약관)
  const [isPackageSheetOpen, setIsPackageSheetOpen] = useState(false);
  const [isTermsSheetOpen, setIsTermsSheetOpen] = useState(false);
  const [terms, setTerms] = useState<ConfirmTermItem[]>([
    {
      id: "purchase",
      label: "[필수] 구매 조건 및 이용약관 동의",
      required: true,
      checked: false,
    },
    {
      id: "refund",
      label: "[필수] 환불 규정 동의",
      required: true,
      checked: false,
    },
  ]);

  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [product, setProduct] = useState<ClassProduct | null>(null);
  const [allProducts, setAllProducts] = useState<ClassProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // [2026-06-10] 오픈클래스 복수선택(자녀×회차) 전체 내역 — 수업 상세에서 저장한 세션.
  //   결제는 PG 단건 구조라 1건씩 순차 진행하되, 본 페이지에서 선택한 전체 내역을 목록으로 표시.
  const [paySession, setPaySession] = useState<{
    classId: string;
    all: { childId: string; productId: string }[];
  } | null>(null);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [selectedFeeType, setSelectedFeeType] =
    useState<FeeType>("MONTHLY_FIXED");
  // sessionCount — 증감 UI(현재 비활성: feePerSession=NULL 가드로 숨김) 전용 state.
  // product.price 는 이미 "sessionsPerMonth 회 묶음가"이므로 sessionCount 를 곱하면 과표.
  // 현재 운영 정책("1회권 단일 결제")에서는 1 로 고정 유지하고, 결제 상세 라벨은
  // product.sessionsPerMonth 를 직접 참조한다.
  const [sessionCount, setSessionCount] = useState(1);

  // 자녀 목록 — 바텀시트와 동일한 훅으로 통일 (응답 래핑/필드 매핑 일관 처리)
  const { children } = useChildren();

  // 현재 수업에 이미 수강 중/신청 중인 자녀 ID 집합
  const [enrolledChildIds, setEnrolledChildIds] = useState<Set<string>>(
    new Set(),
  );

  // 수업 대상 연령(targetBirthYears 우선, ageMin/ageMax 폴백)에 맞지 않는 자녀 ID 집합.
  //   공용 isChildAgeEligibleForClass 사용 — 출생연도 비연속 선택까지 정확히 매칭. 수업 상세와 동일.
  const ageIncompatibleChildIds = (() => {
    const ids = new Set<string>();
    for (const c of children) {
      if (
        !isChildAgeEligibleForClass(c, {
          targetBirthYears: classInfo?.targetBirthYears,
          ageMin: classInfo?.ageMin,
          ageMax: classInfo?.ageMax,
        })
      ) {
        ids.add(c.id);
      }
    }
    return ids;
  })();

  // 자녀 등록 자격 — child-status.ts SoT 사용 (오픈클래스/팀 수업 분기 통합)
  //  - 오픈클래스 (academyId): 팀 멤버십 무관 — 등록된 모든 자녀 통과
  //  - 팀 수업 (teamId/clubId): 자녀가 해당 팀에 approved 상태이면 통과
  //  - 미통과 자녀는 사유(pending/rejected/not_member)를 approvalStatusById 에 기록 → 라벨 세분화
  const isOpenClass = !!classInfo?.academyId;
  const eligibleTeamId = classInfo?.teamId ?? classInfo?.clubId ?? null;
  const notApprovedChildIds = new Set<string>();
  const approvalStatusById = new Map<
    string,
    "pending" | "rejected" | "not_member"
  >();
  if (isOpenClass || eligibleTeamId) {
    for (const c of children) {
      const result = getChildEligibilityForClass(c, {
        isOpenClass,
        eligibleTeamId,
      });
      if (result.eligible) continue;
      notApprovedChildIds.add(c.id);
      approvalStatusById.set(c.id, result.reason);
    }
  }

  const ageRangeLabel = formatAgeRangeLabel(
    classInfo?.ageMin,
    classInfo?.ageMax,
  );

  // [2026-06-10] 복수선택 전체 내역 세션 로드 — classId 일치 시에만 목록 표시.
  useEffect(() => {
    if (!classId) return;
    try {
      const raw = sessionStorage.getItem("openclass_pay_session");
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        classId?: string;
        all?: { childId: string; productId: string }[];
      };
      if (
        parsed?.classId === classId &&
        Array.isArray(parsed.all) &&
        parsed.all.length > 1
      ) {
        setPaySession({ classId, all: parsed.all });
      }
    } catch {
      /* 파싱 실패 시 목록 미표시 (단건 흐름으로 폴백) */
    }
  }, [classId]);

  // 수강 중인 자녀 목록 로드
  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    const loadEnrollments = async () => {
      // ⚠️ [2026-05-14] api-client unwrapEnvelope 가 백엔드 envelope({success,data,total}) 를
      //    자동으로 한 번 풀어주므로 res.data 는 곧 EnrollmentItem[] 배열이다.
      //    (이전 res.data?.data 이중 접근은 unwrapEnvelope 도입 후 항상 undefined → 빈 배열 →
      //     중복 결제 방지 잠금 로직이 무력화되던 버그.)
      const res = await api.get<EnrollmentItem[]>("/enrollments");
      if (cancelled) return;
      const list = res.success && Array.isArray(res.data) ? res.data : [];
      const myUserId = user?.id;
      const ids = new Set(
        list
          .filter((e) => {
            if (e.class?.id !== classId) return false;
            if (!ENROLLED_STATUSES.has(e.status)) return false;
            if (!e.child?.id) return false;
            // 본인이 만든 pending 은 결제 재시도 가능하므로 잠금 제외
            if (e.status === "pending" && e.requester?.id === myUserId)
              return false;
            return true;
          })
          .map((e) => e.child!.id),
      );
      setEnrolledChildIds(ids);
    };
    loadEnrollments();
    return () => {
      cancelled = true;
    };
  }, [classId]);

  // [수정 2026-05-18] 자녀 자동 선택 로직 제거 → URL childId 필수 검증으로 교체.
  //   - 자녀 선택은 수업 상세 페이지(/classes/[id]) ChildSelector 에서만 가능.
  //   - childId 누락 또는 부적합 자녀 진입 시 수업 상세로 redirect (URL 직접 조작 방어).
  //   - 자녀 데이터 / Enrollments / 부적합 Set 들이 모두 준비된 후 검증 (race condition 회피).
  useEffect(() => {
    if (!classId) return;
    // childId 누락 → 수업 상세로 redirect
    if (!initialChildId) {
      router.replace(`/classes/${classId}`);
      return;
    }
    // 자녀 목록 로드 전이면 대기
    if (children.length === 0) return;
    // 전달된 childId 가 본인 자녀 목록에 없음 → redirect
    const exists = children.some((c) => c.id === initialChildId);
    if (!exists) {
      router.replace(`/classes/${classId}`);
      return;
    }
    // 부적합 자녀 진입 차단 (이미 수강 중 / 팀 미승인 / 연령 제한)
    //   notApproved/ageIncompatible 은 classInfo 로딩 완료 후에야 정확. classInfo 로딩 전엔 빈 Set.
    if (
      enrolledChildIds.has(initialChildId) ||
      notApprovedChildIds.has(initialChildId) ||
      ageIncompatibleChildIds.has(initialChildId)
    ) {
      router.replace(`/classes/${classId}`);
      return;
    }
    // Set 들은 매 렌더마다 새 참조이므로 JSON stringify 로 안정화
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    classId,
    initialChildId,
    children,
    enrolledChildIds,
    JSON.stringify([...ageIncompatibleChildIds]),
    JSON.stringify([...notApprovedChildIds]),
  ]);

  useEffect(() => {
    if (!classId) return;
    const load = async () => {
      setIsLoading(true);
      try {
        let classData: ClassInfo | null = null;
        let productsData: ClassProduct[] = [];

        // TeamMember 경로: /teams/{teamId}/classes/... (팀 멤버인 경우)
        const listRes = await api.get<Array<{ id: string }>>("/teams/my/list");
        const clubId =
          listRes.success && listRes.data?.[0] ? listRes.data[0].id : null;

        if (clubId) {
          const [classRes, productsRes] = await Promise.all([
            api.get<ClassInfo>(`/teams/${clubId}/classes/${classId}`),
            api.get<ClassProduct[]>(
              `/teams/${clubId}/classes/${classId}/products`,
            ),
          ]);
          if (classRes.success && classRes.data) classData = classRes.data;
          if (productsRes.success && Array.isArray(productsRes.data))
            productsData = productsRes.data;
        }

        // Fallback: 팀 멤버가 아니어도 공개 엔드포인트로 수업·상품 조회
        // (결제 완료 시 TeamMember 자동 생성되므로 사전 가입 불필요)
        if (!classData) {
          const classRes = await api.get<
            ClassInfo & { products?: ClassProduct[] }
          >(`/classes/${classId}`);
          if (classRes.success && classRes.data) {
            classData = classRes.data;
            if (Array.isArray(classRes.data.products)) {
              productsData = classRes.data.products;
            }
          }
        }

        if (classData) setClassInfo(classData);

        if (productsData.length > 0) {
          setAllProducts(productsData);
          // PACKAGE_END_GUARD (2026-05-22): URL productId 우선 → 결제 가능한 패키지 우선 →
          // 첫 항목 폴백. URL 지정 패키지가 비활성이면 사용자에게 노출은 하되 선택은 불가
          // 처리되도록 가능한 첫 항목으로 자동 전환.
          const isUsable = (p: ClassProduct) => p.isPurchasable !== false;
          const fromUrl = productId
            ? productsData.find((p) => p.id === productId)
            : null;
          const fromUrlUsable = fromUrl && isUsable(fromUrl) ? fromUrl : null;
          const firstUsable = productsData.find(isUsable) ?? null;
          const selected =
            fromUrlUsable ?? firstUsable ?? productsData[0] ?? null;
          setProduct(selected);
          if (selected?.feeType) {
            setSelectedFeeType(selected.feeType as FeeType);
          }
        }
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [classId, productId]);

  // feeType 변경 시 해당 상품으로 전환.
  // PACKAGE_END_GUARD: 같은 feeType 내 결제 가능한 패키지(isPurchasable=true) 우선.
  // 모두 비활성이면 첫 매칭 패키지로 폴백(시각적으로 비활성 상태 유지).
  const handleFeeTypeChange = (feeType: FeeType) => {
    setSelectedFeeType(feeType);
    const candidates = allProducts.filter((p) => p.feeType === feeType);
    if (candidates.length === 0) return;
    const usable = candidates.find((p) => p.isPurchasable !== false);
    setProduct(usable ?? candidates[0]);
  };

  // 결제 금액 계산 (feeType에 따라)
  // PER_SESSION 분기는 "원하는 횟수 선결제" 미활성 기능용 선구현. 현재 시드상 feePerSession=NULL 이라 자동 스킵.
  // 정책 상세: docs/Planning/PAYMENT_FEE_POLICY.md
  const calculatePrice = (): number => {
    if (!product) return 0;
    if (selectedFeeType === "PER_SESSION" && product.feePerSession) {
      return product.feePerSession * sessionCount;
    }
    return product.price;
  };

  const discount = 0;
  const calculatedPrice = calculatePrice();
  const finalPrice = calculatedPrice - discount;

  // [2026-06-10] 복수선택 전체 내역 — 자녀/플랜 매핑 + 합계 + 현재 진행 인덱스.
  const payItems = paySession
    ? paySession.all.map((pr) => ({
        ...pr,
        childName: children.find((c) => c.id === pr.childId)?.name ?? "자녀",
        prod: allProducts.find((p) => p.id === pr.productId),
      }))
    : [];
  const payTotalAmount = payItems.reduce(
    (sum, it) => sum + (it.prod?.price ?? 0),
    0,
  );
  const currentPayIndex = paySession
    ? paySession.all.findIndex(
        (pr) => pr.childId === selectedChild && pr.productId === productId,
      )
    : -1;
  const isMultiPay = payItems.length > 1;

  // 사용 가능한 feeType 목록
  const availableFeeTypes: FeeType[] = Array.from(
    new Set(allProducts.map((p) => p.feeType).filter(Boolean) as FeeType[]),
  );
  // [2026-06-09] 결제화면에서는 회차 변경 불가 — 상세에서 정한 회차만 readonly 표시.
  const hasFeeTypeChoice: boolean = false;
  void availableFeeTypes;

  // Phase 2 P3 — 같은 feeType 의 패키지가 2개 이상이면 BottomSheetSelector 노출
  const matchingProducts = useMemo(
    () => allProducts.filter((p) => p.feeType === selectedFeeType),
    [allProducts, selectedFeeType],
  );
  // [2026-06-09] 패키지(회차) 선택 숨김 — 상세에서 정한 회차 고정.
  const hasPackageChoice: boolean = false;
  void matchingProducts;

  // 약관 동의 토글 (BottomSheetConfirm 내부)
  const handleTermToggle = (id: string) => {
    setTerms((prev) =>
      prev.map((t) => (t.id === id ? { ...t, checked: !t.checked } : t)),
    );
  };

  // BottomSheetConfirm "확인" → 모든 필수 약관 체크 시 inline checkbox 도 동기화
  const handleTermsConfirm = () => {
    const allRequiredChecked = terms.every((t) => !t.required || t.checked);
    if (!allRequiredChecked) return;
    setTermsAccepted(true);
    setIsTermsSheetOpen(false);
  };

  return (
    <MobileContainer>
      <PageAppBar title="수업 결제" />

      {/* Stepper */}
      <div className="w-full px-6 py-4">
        <PaymentStepIndicator currentStep={2} />
      </div>

      {/* Main Content — 내부 스크롤 + inline CTA. [&>*]:shrink-0 으로 flex 자식이 자연 높이 이하로 압축되지 않도록 고정. */}
      <main className="flex-1 flex flex-col gap-6 px-5 pt-2 overflow-y-auto [&>*]:shrink-0">
        {/* Step Headline */}
        <StepHeadline currentStep={2} />

        {/* Class Summary Card */}
        {isLoading ? null : (
          <section className="group relative overflow-hidden rounded-2xl bg-white dark:bg-rink-800 p-1 shadow-sm transition-all motion-reduce:transition-none hover:shadow-md border border-wline-2 dark:border-rink-700">
            <div className="flex gap-4 p-3 items-center">
              {/* Image */}
              <div className="relative w-24 h-24 shrink-0 rounded-xl overflow-hidden bg-wline-2 dark:bg-rink-700 flex items-center justify-center">
                <Icon
                  name="sports_hockey"
                  className="text-4xl text-wtext-3"
                />
              </div>
              {/* Text Info */}
              <div className="flex flex-col gap-1 flex-1">
                {classInfo?.levelRequired && (
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded-w-pill bg-blue-50 dark:bg-blue-900/30 text-ice-500 text-[10px] font-bold uppercase tracking-wider">
                      {classInfo.levelRequired}
                    </span>
                  </div>
                )}
                <h3 className="text-card-emphasis font-bold leading-tight line-clamp-2 text-wtext-1 dark:text-white">
                  {classInfo?.className ?? "-"}
                </h3>
                <p className="text-wtext-3 dark:text-rink-300 text-card-meta mt-1">
                  {product
                    ? `${product.productName} (월 ${product.sessionsPerMonth}회)`
                    : "-"}
                </p>
                <p className="text-wtext-1 dark:text-white text-card-body font-bold mt-2">
                  {(product?.price ?? 0).toLocaleString()}원
                </p>
              </div>
            </div>
          </section>
        )}

        {/* [2026-06-10] 선택한 전체 수강 내역 — 자녀×회차 복수선택 시 전체 목록 표시.
            결제는 PG 단건 구조로 1건씩 순차 진행하되, 선택한 내역 전부를 한눈에 보여줘
            "단일만 나온다"는 혼선을 해소. 현재 결제 대상은 강조 + "결제중" 뱃지. */}
        {!isLoading && isMultiPay && (
          <section
            className="rounded-2xl bg-white dark:bg-rink-800 shadow-sm p-5 border border-wline-2 dark:border-rink-700"
            aria-label="선택한 전체 수강 내역"
          >
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-card-emphasis font-bold text-wtext-1 dark:text-white">
                선택한 수강 내역
              </h3>
              <span className="text-card-meta font-medium text-wtext-3 dark:text-rink-300">
                전체 {payItems.length}건
                {currentPayIndex >= 0
                  ? ` · ${currentPayIndex + 1}/${payItems.length} 결제`
                  : ""}
              </span>
            </div>
            <ul className="flex flex-col gap-2">
              {payItems.map((it, idx) => {
                const isCurrent = idx === currentPayIndex;
                return (
                  <li
                    key={`${it.childId}-${it.productId}`}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-w-lg px-3.5 py-3 border transition-colors",
                      isCurrent
                        ? "border-ice-500 bg-ice-50/60 dark:bg-rink-700"
                        : "border-wline-2 dark:border-rink-700 bg-wbg dark:bg-rink-800 opacity-80",
                    )}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-card-body font-bold text-wtext-1 dark:text-white truncate">
                        {it.childName}
                      </span>
                      <span className="text-card-meta text-wtext-3 dark:text-rink-300 truncate">
                        {it.prod?.productName ?? "-"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-card-body font-bold text-wtext-1 dark:text-white tabular-nums">
                        {(it.prod?.price ?? 0).toLocaleString()}원
                      </span>
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-w-pill text-[10px] font-bold whitespace-nowrap",
                          isCurrent
                            ? "bg-ice-500 text-white"
                            : "bg-wline-2 dark:bg-rink-700 text-wtext-3 dark:text-rink-300",
                        )}
                      >
                        {isCurrent ? "결제중" : "대기"}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="relative my-4">
              <div className="w-full border-t border-wline-2 dark:border-rink-700 border-dashed" />
            </div>
            <div className="flex items-center justify-between px-1">
              <span className="text-card-body font-medium text-wtext-3 dark:text-rink-300">
                전체 합계 ({payItems.length}건)
              </span>
              <span className="text-card-emphasis font-bold text-wtext-1 dark:text-white tabular-nums">
                {payTotalAmount.toLocaleString()}원
              </span>
            </div>
            <p className="mt-2 px-1 text-[12px] leading-relaxed text-wtext-3 dark:text-rink-300">
              결제는 한 건씩 순차로 진행됩니다. 이번 결제 완료 후 다음 건을 이어
              결제할 수 있어요.
            </p>
          </section>
        )}

        {/* Fee Type Selection — PaymentOptionCard (A-5 feeType 분기 UI) */}
        {!isLoading && hasFeeTypeChoice && (
          <section>
            <h3 className="text-card-emphasis font-bold text-wtext-1 dark:text-white mb-3 px-1">
              결제 방식 선택
            </h3>
            <div className="grid grid-cols-1 gap-3">
              {availableFeeTypes.map((feeType) => {
                // PACKAGE_END_GUARD: 같은 feeType 내 결제 가능한 패키지 우선 매칭.
                //   모두 비활성이면 첫 매칭 폴백 + 카드를 disabled 상태로 노출.
                const sameFeeType = allProducts.filter((p) => p.feeType === feeType);
                const matched =
                  sameFeeType.find((p) => p.isPurchasable !== false) ??
                  sameFeeType[0];
                const allUnusable =
                  sameFeeType.length > 0 &&
                  sameFeeType.every((p) => p.isPurchasable === false);
                const isCardDisabled = allUnusable;
                const disabledBadge = isCardDisabled
                  ? matched?.disabledReason ?? MESSAGES.classProduct.unavailableEndDateExceed
                  : null;
                // PACKAGE_WEEKS_SPEC §6 — 신규 응답 필드 우선, 구 필드 폴백.
                const weeklyCount =
                  matched?.packageSessionsPerWeek ?? matched?.sessionsPerWeek ?? 1;
                const weeks =
                  matched?.packageWeeks ??
                  (matched?.durationDays ? Math.max(1, Math.round(matched.durationDays / 7)) : 4);
                const totalSessions =
                  matched?.packageTotalSessions ?? (weeks * weeklyCount);
                const pricePerUnit =
                  feeType === "PER_SESSION"
                    ? Number(matched?.feePerSession ?? 0) || matched?.price || 0
                    : feeType === "MONTHLY_FIXED"
                      ? Number(matched?.feePerSession ?? 0) ||
                        (totalSessions > 0
                          ? Math.round((matched?.price ?? 0) / totalSessions)
                          : 0)
                      : (matched?.price ?? 0);
                return (
                  <PaymentOptionCard
                    key={feeType}
                    feeType={feeType}
                    pricePerUnit={pricePerUnit}
                    weeklyCount={
                      feeType === "MONTHLY_FIXED" ? weeklyCount : undefined
                    }
                    weeks={feeType === "MONTHLY_FIXED" ? weeks : undefined}
                    totalSessions={
                      feeType === "PER_SESSION" ? sessionCount : undefined
                    }
                    monthlyFixedAmount={
                      feeType === "MONTHLY_FIXED" ? matched?.price : undefined
                    }
                    // DB 우선 표시 — class_products.productName / description 을 카드 제목·요약으로 사용.
                    // messages.ts 의 기본 카피는 해당 필드가 비었을 때만 폴백으로 노출된다.
                    productName={matched?.productName}
                    productDescription={matched?.description}
                    selected={selectedFeeType === feeType}
                    onSelect={() => handleFeeTypeChange(feeType)}
                    disabled={isCardDisabled}
                    disabledBadge={disabledBadge}
                  />
                );
              })}
            </div>
            {/* Phase 2 P3 — 같은 feeType 패키지가 2개 이상일 때만 노출 */}
            {hasPackageChoice && (
              <button
                type="button"
                onClick={() => setIsPackageSheetOpen(true)}
                className="mt-3 flex w-full items-center justify-between rounded-xl border border-wline-2 bg-white px-4 py-3 text-left transition-colors motion-reduce:transition-none hover:border-ice-500/40 active:brightness-95 dark:border-rink-700 dark:bg-rink-800"
                aria-haspopup="dialog"
                aria-expanded={isPackageSheetOpen}
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-w-pill bg-ice-500/10 text-ice-500">
                    <Icon
                      name="tune"
                      className="text-card-emphasis"
                      aria-hidden="true"
                    />
                  </span>
                  <div className="flex flex-col">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-wtext-3 dark:text-rink-300">
                      선택된 패키지
                    </span>
                    <span className="text-card-body font-bold text-wtext-1 dark:text-white">
                      {product?.productName ?? "패키지 선택"}
                    </span>
                  </div>
                </div>
                <span className="text-card-meta font-semibold text-ice-500">변경</span>
              </button>
            )}
          </section>
        )}

        {/*
          Per-Session Count Selector — 현재 "1회권 고정 결제" 정책상 비활성(feePerSession=NULL 이라 자동 숨김).
          삭제 X: 향후 "원하는 횟수 선결제" 채택 시 활성화. 정책 상세: docs/Planning/PAYMENT_FEE_POLICY.md
        */}
        {!isLoading &&
          selectedFeeType === "PER_SESSION" &&
          product?.feePerSession && (
            <section className="rounded-2xl bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 p-5">
              <h3 className="text-card-body font-bold text-wtext-1 dark:text-white mb-4">
                수업 횟수 선택
              </h3>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() =>
                      setSessionCount((prev) => Math.max(1, prev - 1))
                    }
                    disabled={sessionCount <= 1}
                    aria-label="수업 횟수 감소"
                    className="flex items-center justify-center w-10 h-10 rounded-w-pill border-2 border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100 hover:border-ice-500 hover:text-ice-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all motion-reduce:transition-none"
                  >
                    <Icon
                      name="remove"
                      className="text-card-title font-bold"
                      aria-hidden="true"
                    />
                  </button>
                  <span className="text-2xl font-bold text-wtext-1 dark:text-white w-12 text-center">
                    {sessionCount}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSessionCount((prev) => Math.min(20, prev + 1))
                    }
                    disabled={sessionCount >= 20}
                    aria-label="수업 횟수 증가"
                    className="flex items-center justify-center w-10 h-10 rounded-w-pill bg-ice-500 text-white hover:bg-ice-500/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all motion-reduce:transition-none"
                  >
                    <Icon name="add" className="text-card-title font-bold" />
                  </button>
                </div>
                <div className="text-right">
                  <p className="text-card-meta text-wtext-3 dark:text-rink-300">
                    {sessionCount}회 × {product.feePerSession.toLocaleString()}
                    원
                  </p>
                  <p className="text-card-title font-bold text-ice-500 mt-0.5">
                    {(product.feePerSession * sessionCount).toLocaleString()}원
                  </p>
                </div>
              </div>
            </section>
          )}

        {/* Student Selection — [수정 2026-05-18] readonly 표시 (자녀 변경은 수업 상세 페이지에서만). */}
        {isLoading ? null : (
          <section>
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-card-emphasis font-bold text-wtext-1 dark:text-white">
                수강생
              </h3>
              {ageRangeLabel && (
                <span className="text-card-meta font-medium text-wtext-3 dark:text-rink-300">
                  수강 연령 · {ageRangeLabel}
                </span>
              )}
            </div>
            <SelectedChildDisplay
              child={children.find((c) => c.id === selectedChild)}
            />
          </section>
        )}

        {/* Payment Breakdown — 결제 금액 변경 시 스크린리더 안내 */}
        <section
          className="rounded-2xl bg-white dark:bg-rink-800 shadow-sm p-6 border border-wline-2 dark:border-rink-700 mt-2"
          aria-labelledby="payment-breakdown-title"
          role="region"
        >
          <h3
            id="payment-breakdown-title"
            className="text-card-body font-bold text-wtext-3 uppercase tracking-wider mb-4"
          >
            결제 상세
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-card-body">
              <span className="text-wtext-3 dark:text-rink-300">
                {selectedFeeType === "MONTHLY_FIXED"
                  ? "정기권 수업료"
                  : `${product?.sessionsPerMonth ?? 1}회`}
              </span>
              <span className="font-medium text-wtext-1 dark:text-white">
                {calculatedPrice.toLocaleString()}원
              </span>
            </div>
            <div className="flex justify-between items-center text-card-body">
              <span className="text-wtext-3 dark:text-rink-300 flex items-center gap-1">
                할인 금액
                <Icon name="info" className="text-[14px] text-wtext-4" />
              </span>
              {/* discount > 0 일 때만 차감 부호 노출 — 0원 시 "-0원" 어색 표시 제거
                  (2026-05-11 사용자 피드백). 다른 페이지(cart, shop-checkout,
                  MatchPaymentSummary) 의 패턴과 일관성 확보. */}
              <span className="font-medium text-ice-500 tabular-nums">
                {discount > 0 && '-'}{discount.toLocaleString()}원
              </span>
            </div>
          </div>
          {/* Divider */}
          <div className="relative my-5">
            <div className="w-full border-t border-wline-2 dark:border-rink-700 border-dashed"></div>
          </div>
          <div
            className="flex justify-between items-end"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="text-card-emphasis font-bold text-wtext-1 dark:text-white pb-1">
              최종 결제 금액
            </span>
            <span
              className="text-2xl font-bold text-ice-500 tracking-tight"
              aria-label={`${finalPrice.toLocaleString()}원`}
            >
              {finalPrice.toLocaleString()}원
            </span>
          </div>
        </section>

        {/* 수업권 이용 안내 박스 (2026-05-22 정책 톤).
            결제 직전 학부모에게 "결제일부터 N일까지 사용 가능 · 본 기간 종료 후 미사용 회차 30일 추가 사용 가능" 명시.
            선택된 패키지의 durationDays + 30 으로 동적 표시. PER_SESSION 1회권은 본 기간 30일이라 정책 안내 일관 적용. */}
        {product?.durationDays && product.durationDays > 0 && (
          <section
            className="mx-1 mt-2 rounded-w-lg border border-wline-2 dark:border-rink-700 bg-ice-50/40 dark:bg-rink-800 px-4 py-3"
            aria-label={MESSAGES.classProduct.paymentInfoTitle}
          >
            <p className="text-card-meta font-bold text-wtext-2 dark:text-rink-100 mb-1.5">
              ℹ {MESSAGES.classProduct.paymentInfoTitle}
            </p>
            <ul className="space-y-1 text-card-meta text-wtext-3 dark:text-rink-300 leading-relaxed">
              <li>
                ·{' '}
                {MESSAGES.classProduct.paymentInfoUsableDays(
                  product.durationDays + 30,
                )}
              </li>
              <li>· {MESSAGES.classProduct.paymentInfoExtraDays(30)}</li>
              {/* [2026-06-09 심사 3.1.1] 결제권=오프라인 대면 수업 결제 수단 명시 */}
              <li>· {MESSAGES.payment2.offlineCreditNotice}</li>
            </ul>
          </section>
        )}

        {/* Terms & CTA — inline (스크롤 마지막 섹션) */}
        {/* Phase 2 P4 통합 — 인라인 체크박스는 유지(상태 가시성), "약관 자세히 보기" 로 BottomSheetConfirm */}
        <section className="flex flex-col gap-4 pt-2">
          <div className="flex items-start gap-3 px-1">
            <div className="flex items-center h-5">
              <input
                type="checkbox"
                id="terms"
                checked={termsAccepted}
                onChange={(e) => {
                  const next = e.target.checked;
                  setTermsAccepted(next);
                  // 인라인 체크 시 sheet 의 필수 약관도 동기화 (사용자 경험 일관성)
                  setTerms((prev) =>
                    prev.map((t) => (t.required ? { ...t, checked: next } : t)),
                  );
                }}
                className="size-5 rounded border-wline text-ice-500 focus:ring-ice-500 dark:border-rink-700 dark:bg-rink-700 cursor-pointer"
              />
            </div>
            <div className="text-card-body flex-1">
              <label
                className="font-medium text-wtext-1 dark:text-white cursor-pointer"
                htmlFor="terms"
              >
                {MESSAGES.payment2.termsRequired}{" "}
                <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-wtext-3 dark:text-rink-300 text-card-meta">
                  {MESSAGES.payment2.refundPolicy}
                </p>
                <button
                  type="button"
                  onClick={() => setIsTermsSheetOpen(true)}
                  className="text-card-meta font-semibold text-ice-500 underline-offset-2 hover:underline"
                  aria-haspopup="dialog"
                >
                  자세히 보기
                </button>
              </div>
            </div>
          </div>
          {/* PACKAGE_END_GUARD (2026-05-22 v2): 선택된 product 가 비활성/종료일 초과/수업 종료면 다음 단계 차단.
              모든 패키지가 비활성일 때 default 선택이 비활성 상태로 남는 케이스 대응.
              disabledReason 백엔드 분기: "이 수업은 종료되었습니다" / "수업 종료일을 초과하는 패키지입니다" / "비활성 패키지". */}
          {product && product.isPurchasable === false && (
            <p
              role="alert"
              className="mb-2 text-card-meta text-error-600 dark:text-error-400"
            >
              {product.disabledReason ?? MESSAGES.classProduct.unavailableEndDateExceed}
              {' · '}
              {MESSAGES.classProduct.selectAnotherPackage}
            </p>
          )}
          {/* 선택 자녀가 대상 연령(출생연도)에 맞지 않으면 결제 진행 차단 + 안내. */}
          {selectedChild && ageIncompatibleChildIds.has(selectedChild) && (
            <p
              role="alert"
              className="mb-2 text-card-meta text-error-600 dark:text-error-400"
            >
              {MESSAGES.enrollment.ageBlockedNotice}
            </p>
          )}
          {(() => {
            const isAgeBlocked =
              !!selectedChild && ageIncompatibleChildIds.has(selectedChild);
            const canProceed =
              termsAccepted &&
              !!selectedChild &&
              product?.isPurchasable !== false &&
              !isAgeBlocked;
            return (
          <NavLink
            href={`/payment/checkout?classId=${classId}&productId=${product?.id ?? productId}&childId=${selectedChild}&amount=${finalPrice}&feeType=${selectedFeeType}${selectedFeeType === "PER_SESSION" ? `&sessionCount=${sessionCount}` : ""}`}
            className={`w-full flex items-center justify-center gap-2 rounded-xl py-4 font-bold text-card-title shadow-md transition-all motion-reduce:transition-none active:brightness-95 ${
              canProceed
                ? "bg-ice-500 hover:bg-ice-500/90 text-white"
                : "bg-wline dark:bg-rink-700 text-wtext-3 cursor-not-allowed shadow-none"
            }`}
            aria-disabled={!canProceed}
            onClick={(e) => {
              if (product?.isPurchasable === false) {
                e.preventDefault();
                return;
              }
              if (!selectedChild) {
                e.preventDefault();
                return;
              }
              if (isAgeBlocked) {
                e.preventDefault();
                return;
              }
              if (!termsAccepted) {
                e.preventDefault();
                setIsTermsSheetOpen(true);
              }
            }}
          >
            <span>다음 단계로</span>
            <Icon name="arrow_forward" className="text-xl" />
          </NavLink>
            );
          })()}
        </section>
      </main>

      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />

      {/* Phase 2 P3 — 패키지 선택 BottomSheetSelector (같은 feeType 의 product 다중 선택)
          PACKAGE_END_GUARD (2026-05-22): isPurchasable=false 패키지는 disabled=true 로 표시
          + sub 라벨에 disabledReason 노출 + onSelect 가드에서 차단. */}
      <BottomSheetSelector<string>
        isOpen={isPackageSheetOpen}
        title="패키지를 선택해주세요."
        items={matchingProducts.map((p) => {
          const isPurchasable = p.isPurchasable !== false;
          const baseSub = `${p.price.toLocaleString()}원 · 월 ${p.sessionsPerMonth}회`;
          const sub = isPurchasable
            ? baseSub
            : `${baseSub} · ${p.disabledReason ?? MESSAGES.classProduct.unavailableEndDateExceed}`;
          return {
            id: p.id,
            name: p.productName,
            sub,
            selected: p.id === product?.id,
            disabled: !isPurchasable,
          };
        })}
        onSelect={(id) => {
          const next = matchingProducts.find((p) => p.id === id);
          // PACKAGE_END_GUARD: 비활성 패키지 선택 차단 (BottomSheetSelector 가 클릭을 막아도
          // 키보드/외부 트리거 대비 이중 가드)
          if (!next || next.isPurchasable === false) {
            return;
          }
          setProduct(next);
          setIsPackageSheetOpen(false);
        }}
        onClose={() => setIsPackageSheetOpen(false)}
      />

      {/* Phase 2 P4 — 약관 동의 BottomSheetConfirm */}
      <BottomSheetConfirm
        isOpen={isTermsSheetOpen}
        title="약관에 동의해주세요."
        terms={terms}
        onTermToggle={handleTermToggle}
        onConfirm={handleTermsConfirm}
        onCancel={() => setIsTermsSheetOpen(false)}
        confirmLabel="동의하고 계속"
      />
    </MobileContainer>
  );
}

function LoadingFallback() {
  return (
    <MobileContainer hasBottomNav={false}>
      <div className="flex items-center justify-center h-screen">
        <Spinner size="lg" />
      </div>
    </MobileContainer>
  );
}

export default function PaymentOptionsPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PaymentOptionsContent />
    </Suspense>
  );
}
