"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { useToast } from "@/components/ui/Toast";
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from "@/hooks/useNativeUI";
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { api } from "@/services/api-client";
import { MESSAGES } from "@/lib/messages";
import type {
  OverseasTrip,
  TripStatus,
  MyTripItem,
  RegistrationStatus,
} from "@/types/overseas-trip";

// ─── Constants ──────────────────────────────────────

const STATUS_BADGE: Record<TripStatus, { className: string; label: string }> = {
  draft: {
    className:
      "bg-it-line text-it-ink-500 dark:bg-rink-700 dark:text-wtext-4",
    label: MESSAGES.overseasTrip.status.draft,
  },
  open: {
    className:
      "bg-mint-100 text-mint-500 dark:bg-mint-500/15 dark:text-mint-500",
    label: MESSAGES.overseasTrip.status.open,
  },
  closed: {
    className:
      "bg-sun-100 text-sun-500 dark:bg-sun-500/15 dark:text-sun-500",
    label: MESSAGES.overseasTrip.status.closed,
  },
  ongoing: {
    className:
      "bg-it-blue-50 text-it-blue-500 dark:bg-it-blue-500/15 dark:text-it-blue-500",
    label: MESSAGES.overseasTrip.status.ongoing,
  },
  completed: {
    className:
      "bg-it-line text-it-ink-800 dark:bg-rink-700 dark:text-wtext-4",
    label: MESSAGES.overseasTrip.status.completed,
  },
  cancelled: {
    className: "bg-it-red-500/10 text-it-red-500 dark:bg-it-red-500/15 dark:text-it-red-500",
    label: MESSAGES.overseasTrip.status.cancelled,
  },
};

// ─── Helpers ────────────────────────────────────────

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatCurrency(amount: string | number | null | undefined): string {
  const value = Number(amount ?? 0);
  if (!value) return "-";
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function isDeadlinePassed(deadline: string): boolean {
  return new Date() > new Date(deadline);
}

// ─── Component ──────────────────────────────────────

export default function ParentOverseasTripDetailPage() {
  // [appbar-harness-v3 / 2026-05-13] 이중 헤더 방지 — Web `<PageAppBar />` 단독 렌더.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
  });
  const { toast } = useToast();
  const { user } = useSessionAuth();
  const params = useParams();
  const tripId = params?.id as string;

  const [trip, setTrip] = useState<OverseasTrip | null>(null);
  const [myRegistration, setMyRegistration] = useState<
    MyTripItem["registration"] | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // 참가 신청 폼 상태
  const [showRegForm, setShowRegForm] = useState(false);
  const [emergencyContact, setEmergencyContact] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [specialRequirements, setSpecialRequirements] = useState("");
  // C-18 미성년자 보호자 동반 동의 (해외원정) — 청소년보호법
  // 만 14세 미만 자녀의 해외원정 시 보호자 동반 의무를 명시적으로 동의받음
  const [guardianAccompanyConsent, setGuardianAccompanyConsent] = useState(false);
  // 여권 6개월 이상 유효 확인 (C-16)
  const [passportValidConsent, setPassportValidConsent] = useState(false);
  // 여행자 보험 가입 확인 (C-17)
  const [travelInsuranceConsent, setTravelInsuranceConsent] = useState(false);

  const loadTrip = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<OverseasTrip>(`/overseas-trips/${tripId}`);
      if (res.success && res.data) {
        setTrip(res.data);
      }
    } catch {
      toast.error(MESSAGES.error.general);
    } finally {
      setIsLoading(false);
    }
  }, [tripId, toast]);

  // 내 신청 상태 확인
  const checkMyRegistration = useCallback(async () => {
    try {
      const res = await api.get<MyTripItem[]>("/overseas-trips/my");
      if (res.success && res.data && Array.isArray(res.data)) {
        const myItem = res.data.find((item) => item.trip.id === tripId);
        if (myItem) {
          setMyRegistration(myItem.registration);
        }
      }
    } catch {
      // 내 신청 확인 실패는 치명적이지 않음
    }
  }, [tripId]);

  useEffect(() => {
    loadTrip();
    checkMyRegistration();
  }, [loadTrip, checkMyRegistration]);

  const handleRegister = async () => {
    if (!trip || !user) return;

    // C-18 보호자 동반 + 여권 + 보험 필수 동의 검증
    if (!guardianAccompanyConsent || !passportValidConsent || !travelInsuranceConsent) {
      toast.error(MESSAGES.parent.overseasConsent);
      return;
    }

    setIsRegistering(true);
    try {
      // 해당 팀의 내 TeamMember 조회 (canonical team.id, alias 제거 완료 Phase C-D)
      if (!trip.team?.id) {
        toast.error(MESSAGES.error.general);
        setIsRegistering(false);
        return;
      }
      const memberRes = await api.get<Array<{ id: string }>>(
        `/teams/${trip.team.id}/members?userId=${user.id}`,
      );
      const members =
        memberRes.success && memberRes.data && Array.isArray(memberRes.data)
          ? memberRes.data
          : [];

      if (!members.length) {
        toast.error(MESSAGES.error.general);
        setIsRegistering(false);
        return;
      }

      const memberId = members[0].id;

      const regRes = await api.post(`/overseas-trips/${tripId}/registrations`, {
        memberId,
        parentId: user.id,
        emergencyContact: emergencyContact.trim() || undefined,
        emergencyPhone: emergencyPhone.trim() || undefined,
        specialRequirements: specialRequirements.trim() || undefined,
      });

      if (regRes.success) {
        toast.success(MESSAGES.overseasTrip.registered);
        setShowRegForm(false);
        loadTrip();
        checkMyRegistration();
      } else {
        toast.error(
          regRes.error?.message ?? MESSAGES.overseasTrip.registerFailed,
        );
      }
    } catch {
      toast.error(MESSAGES.overseasTrip.registerFailed);
    } finally {
      setIsRegistering(false);
    }
  };

  const handleCancel = async () => {
    if (!myRegistration) return;
    setIsCancelling(true);
    try {
      const res = await api.post(
        `/overseas-trips/${tripId}/registrations/${myRegistration.id}/cancel`,
        {
          cancelReason: "학부모 직접 취소",
        },
      );
      if (res.success) {
        toast.success(MESSAGES.overseasTrip.cancelled);
        setShowCancelConfirm(false);
        setMyRegistration(null);
        loadTrip();
        checkMyRegistration();
      } else {
        toast.error(MESSAGES.overseasTrip.cancelFailed);
      }
    } catch {
      toast.error(MESSAGES.overseasTrip.cancelFailed);
    } finally {
      setIsCancelling(false);
    }
  };

  if (isLoading) {
    return null;
  }

  if (!trip) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title={MESSAGES.overseasTrip.detailTitle} />
        <div className="flex-1 flex flex-col items-center justify-center py-20 bg-it-canvas dark:bg-puck">
          <Icon
            name="flight"
            className="mb-3 text-4xl text-it-ink-400 dark:text-wtext-4"
          />
          <p className="text-card-body text-it-ink-500 dark:text-wtext-4">
            원정 정보를 찾을 수 없습니다.
          </p>
        </div>
      </MobileContainer>
    );
  }

  const canRegister =
    trip.status === "open" &&
    !isDeadlinePassed(trip.registrationDeadline) &&
    !myRegistration;

  const isRegistered = myRegistration && myRegistration.status !== "cancelled";

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title={MESSAGES.overseasTrip.detailTitle} />

      {/* 원정 히어로 — navy 밴드 (full-bleed) */}
      <section
        aria-label="원정 기본 정보"
        className="bg-it-blue-800 dark:bg-it-blue-950 px-5 pb-5 pt-5"
      >
        {/* 썸네일 영역 */}
        <div
          className="mb-4 flex items-center justify-center h-32 rounded-w-md bg-white/10 border border-white/10"
          aria-hidden="true"
        >
          <Icon name="flight_takeoff" className="text-6xl text-white/90" />
        </div>

        <div className="flex items-start gap-2">
          <h2 className="flex-1 text-card-title font-extrabold text-white leading-snug tracking-[-0.02em]">
            {trip.title}
          </h2>
          <span
            className={`inline-flex shrink-0 items-center rounded-w-pill px-2.5 py-1 text-card-meta font-semibold ${
              STATUS_BADGE[trip.status]?.className ?? ""
            }`}
          >
            {STATUS_BADGE[trip.status]?.label ?? trip.status}
          </span>
        </div>

        <div className="mt-3 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-card-body text-white/85">
            <Icon
              name="location_on"
              className="text-card-emphasis text-white/60"
              aria-hidden="true"
            />
            <span>
              {trip.country} {trip.city}
            </span>
          </div>
          <div className="flex items-center gap-2 text-card-body text-white/85 tabular-nums">
            <Icon
              name="calendar_today"
              className="text-card-emphasis text-white/60"
              aria-hidden="true"
            />
            <span>
              {formatDate(trip.startDate)} ~ {formatDate(trip.endDate)}
            </span>
          </div>
          {trip.team?.name && (
            <div className="flex items-center gap-2 text-card-body text-white/85">
              <Icon
                name="sports_hockey"
                className="text-card-emphasis text-white/60"
                aria-hidden="true"
              />
              <span>{trip.team.name}</span>
            </div>
          )}
        </div>

        {/* 내 신청 상태 배너 — navy 위 반투명 패널 */}
        {isRegistered && (
          <div
            className="mt-4 flex items-center justify-between rounded-w-md bg-white/10 border border-white/15 p-3"
            role="status"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center size-9 rounded-w-pill bg-white/15 shrink-0">
                <Icon
                  name="check_circle"
                  className="text-card-title text-white"
                  aria-hidden="true"
                />
              </div>
              <div className="min-w-0">
                <p className="text-card-body font-semibold text-white">
                  참가 신청 완료
                </p>
                <p className="text-card-meta text-white/70">
                  상태:{" "}
                  {
                    MESSAGES.overseasTrip.registrationStatus[
                      myRegistration!.status as RegistrationStatus
                    ]
                  }
                </p>
              </div>
            </div>
            {myRegistration!.status !== "cancelled" && (
              <button
                type="button"
                onClick={() => setShowCancelConfirm(true)}
                aria-label="원정 참가 신청 취소하기"
                className="shrink-0 rounded-w-md px-4 py-2 text-card-body font-semibold text-white hover:bg-white/10 transition-colors motion-reduce:transition-none min-h-[48px] min-w-[48px]"
              >
                취소하기
              </button>
            )}
          </div>
        )}
      </section>

      {/* 상세 정보 — 회색 캔버스 + flat 흰 섹션들 */}
      <div className="flex-1 bg-it-canvas dark:bg-puck flex flex-col gap-2 pb-28">
        {/* 모집 정보 — flat 흰 섹션 */}
        <section
          aria-labelledby="trip-recruit-heading"
          className="bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-5"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center justify-center size-7 rounded-w-md bg-it-blue-50 dark:bg-it-blue-500/15">
              <Icon
                name="how_to_reg"
                className="text-card-body text-it-blue-500"
                aria-hidden="true"
              />
            </div>
            <h3
              id="trip-recruit-heading"
              className="text-card-title font-bold text-it-ink-800 dark:text-white"
            >
              모집 정보
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <InfoCard
              icon="group"
              label={MESSAGES.overseasTrip.participants}
              value={`${trip._count?.registrations ?? 0} / ${trip.maxParticipants}명`}
            />
            <InfoCard
              icon="event"
              label={MESSAGES.overseasTrip.registrationDeadline}
              value={formatDate(trip.registrationDeadline)}
              highlight={!isDeadlinePassed(trip.registrationDeadline)}
            />
            {trip.estimatedCost && (
              <InfoCard
                icon="payments"
                label={MESSAGES.overseasTrip.estimatedCost}
                value={formatCurrency(trip.estimatedCost)}
              />
            )}
            {trip.depositAmount && (
              <InfoCard
                icon="account_balance_wallet"
                label={MESSAGES.overseasTrip.depositAmount}
                value={formatCurrency(trip.depositAmount)}
              />
            )}
            {trip.ageGroup && (
              <InfoCard
                icon="child_care"
                label={MESSAGES.overseasTrip.ageGroup}
                value={trip.ageGroup}
              />
            )}
            {trip.depositDeadline && (
              <InfoCard
                icon="schedule"
                label={MESSAGES.overseasTrip.depositDeadline}
                value={formatDate(trip.depositDeadline)}
              />
            )}
          </div>
        </section>

        {/* 원정 설명 */}
        {trip.description && (
          <section
            aria-labelledby="trip-desc-heading"
            className="bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-5"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center justify-center size-7 rounded-w-md bg-emerald-50 dark:bg-emerald-900/20">
                <Icon
                  name="info"
                  className="text-card-body text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
              </div>
              <h3
                id="trip-desc-heading"
                className="text-card-title font-bold text-it-ink-800 dark:text-white"
              >
                원정 안내
              </h3>
            </div>
            <p className="whitespace-pre-wrap text-card-body leading-relaxed text-it-ink-700 dark:text-wtext-4">
              {trip.description}
            </p>
          </section>
        )}

        {/* 여행 정보 */}
        {(trip.flightInfo || trip.hotelInfo || trip.transportInfo) && (
          <section
            aria-labelledby="trip-travel-heading"
            className="bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center justify-center size-7 rounded-w-md bg-amber-50 dark:bg-amber-900/20">
                <Icon
                  name="luggage"
                  className="text-card-body text-amber-600 dark:text-amber-400"
                  aria-hidden="true"
                />
              </div>
              <h3
                id="trip-travel-heading"
                className="text-card-title font-bold text-it-ink-800 dark:text-white"
              >
                여행 정보
              </h3>
            </div>
            <div className="flex flex-col gap-4">
              {trip.flightInfo && (
                <InfoBlock
                  icon="flight"
                  label={MESSAGES.overseasTrip.flightInfo}
                  value={trip.flightInfo}
                />
              )}
              {trip.hotelInfo && (
                <InfoBlock
                  icon="hotel"
                  label={MESSAGES.overseasTrip.hotelInfo}
                  value={trip.hotelInfo}
                />
              )}
              {trip.transportInfo && (
                <InfoBlock
                  icon="directions_bus"
                  label={MESSAGES.overseasTrip.transportInfo}
                  value={trip.transportInfo}
                />
              )}
            </div>
          </section>
        )}

        {/* 상세 일정 — 타임라인 느낌 */}
        {trip.itinerary && (
          <section
            aria-labelledby="trip-itinerary-heading"
            className="bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-5"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center justify-center size-7 rounded-w-md bg-indigo-50 dark:bg-indigo-900/20">
                <Icon
                  name="timeline"
                  className="text-card-body text-indigo-600 dark:text-indigo-400"
                  aria-hidden="true"
                />
              </div>
              <h3
                id="trip-itinerary-heading"
                className="text-card-title font-bold text-it-ink-800 dark:text-white"
              >
                {MESSAGES.overseasTrip.itinerary}
              </h3>
            </div>
            <div className="rounded-w-md bg-it-fill dark:bg-rink-900 p-4">
              <p className="whitespace-pre-wrap text-card-body leading-relaxed text-it-ink-700 dark:text-wtext-4">
                {trip.itinerary}
              </p>
            </div>
          </section>
        )}

        {/* 연락처 */}
        {(trip.contactPhone || trip.contactEmail) && (
          <section
            aria-labelledby="trip-contact-heading"
            className="bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-5"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center justify-center size-7 rounded-w-md bg-rose-50 dark:bg-rose-900/20">
                <Icon
                  name="support_agent"
                  className="text-card-body text-rose-500 dark:text-rose-400"
                  aria-hidden="true"
                />
              </div>
              <h3
                id="trip-contact-heading"
                className="text-card-title font-bold text-it-ink-800 dark:text-white"
              >
                문의처
              </h3>
            </div>
            <div className="flex flex-col gap-2">
              {trip.contactPhone && (
                <a
                  href={`tel:${trip.contactPhone}`}
                  aria-label={`전화 걸기 ${trip.contactPhone}`}
                  className="flex items-center gap-2 min-h-[48px] px-3 rounded-w-md bg-it-fill dark:bg-rink-900/50 text-card-body font-semibold text-it-blue-500 hover:bg-it-line dark:hover:bg-rink-900 transition-colors motion-reduce:transition-none tabular-nums"
                >
                  <Icon name="call" className="text-card-emphasis" aria-hidden="true" />
                  <span>{trip.contactPhone}</span>
                </a>
              )}
              {trip.contactEmail && (
                <a
                  href={`mailto:${trip.contactEmail}`}
                  aria-label={`이메일 보내기 ${trip.contactEmail}`}
                  className="flex items-center gap-2 min-h-[48px] px-3 rounded-w-md bg-it-fill dark:bg-rink-900/50 text-card-body font-semibold text-it-blue-500 hover:bg-it-line dark:hover:bg-rink-900 transition-colors motion-reduce:transition-none"
                >
                  <Icon name="email" className="text-card-emphasis" aria-hidden="true" />
                  <span className="truncate">{trip.contactEmail}</span>
                </a>
              )}
            </div>
          </section>
        )}
      </div>

      {/* 참가 신청 폼 */}
      {showRegForm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reg-form-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          onClick={() => setShowRegForm(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-it-surface dark:bg-rink-800 px-5 pb-8 pt-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h3
                id="reg-form-title"
                className="text-card-title font-bold text-it-ink-800 dark:text-white"
              >
                {MESSAGES.overseasTrip.registrationTitle}
              </h3>
              <button
                type="button"
                onClick={() => setShowRegForm(false)}
                className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-w-pill text-it-ink-500 hover:bg-it-fill dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40"
                aria-label="원정 참가 신청 폼 닫기"
              >
                <Icon name="close" className="text-xl" aria-hidden="true" />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-card-body font-semibold text-it-ink-700 dark:text-wtext-4">
                  {MESSAGES.overseasTrip.emergencyContact}
                </label>
                <input
                  type="text"
                  value={emergencyContact}
                  onChange={(e) => setEmergencyContact(e.target.value)}
                  placeholder="비상 연락처 이름"
                  className="w-full h-12 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-700 px-3.5 text-card-body text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-wtext-4 focus:outline-none focus:ring-2 focus:ring-it-blue-500/30 focus:border-it-blue-500 transition-colors motion-reduce:transition-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-card-body font-semibold text-it-ink-700 dark:text-wtext-4">
                  비상 연락 번호
                </label>
                <input
                  type="tel"
                  value={emergencyPhone}
                  onChange={(e) => setEmergencyPhone(e.target.value)}
                  placeholder="010-0000-0000"
                  className="w-full h-12 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-700 px-3.5 text-card-body text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-wtext-4 focus:outline-none focus:ring-2 focus:ring-it-blue-500/30 focus:border-it-blue-500 transition-colors motion-reduce:transition-none tabular-nums"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-card-body font-semibold text-it-ink-700 dark:text-wtext-4">
                  {MESSAGES.overseasTrip.specialRequirements}
                </label>
                <textarea
                  value={specialRequirements}
                  onChange={(e) => setSpecialRequirements(e.target.value)}
                  placeholder="알레르기, 복용 약물 등 특이사항"
                  rows={3}
                  className="w-full resize-none rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-700 px-3.5 py-2.5 text-card-body text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-wtext-4 focus:outline-none focus:ring-2 focus:ring-it-blue-500/30 focus:border-it-blue-500 transition-colors motion-reduce:transition-none"
                />
              </div>

              {/*
                해외원정 필수 안전 동의 (C-16/C-17/C-18)
                ─────────────────────────────────────────
                C-16 여권 6개월 이상 유효 / C-17 여행자 보험 가입 / C-18 보호자 동반
                청소년보호법 · 여권법 · 외교부 권고 사항
              */}
              <section className="rounded-w-md border border-it-red-500/40 bg-it-red-500/[0.06] dark:bg-it-red-500/10 p-3.5 space-y-2.5">
                <h4 className="text-card-body font-bold text-it-ink-800 dark:text-white flex items-center gap-1.5">
                  <Icon name="warning_amber" className="text-it-red-500 text-card-emphasis" />
                  해외원정 필수 동의 사항
                </h4>

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={passportValidConsent}
                    onChange={(e) => setPassportValidConsent(e.target.checked)}
                    disabled={isRegistering}
                    className="mt-0.5 size-4 accent-it-blue-500 shrink-0 cursor-pointer"
                  />
                  <span className="text-card-meta text-it-ink-700 dark:text-wtext-4 leading-relaxed">
                    <span className="text-it-red-500 font-bold">[필수]</span> 자녀의 여권이 출국일 기준 <strong>6개월 이상 유효</strong>함을 확인했습니다.
                  </span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={travelInsuranceConsent}
                    onChange={(e) => setTravelInsuranceConsent(e.target.checked)}
                    disabled={isRegistering}
                    className="mt-0.5 size-4 accent-it-blue-500 shrink-0 cursor-pointer"
                  />
                  <span className="text-card-meta text-it-ink-700 dark:text-wtext-4 leading-relaxed">
                    <span className="text-it-red-500 font-bold">[필수]</span> 자녀의 <strong>여행자 보험 가입</strong>에 동의하며, 보험 가입증명서를 출발 7일 전까지 제출하겠습니다.
                  </span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={guardianAccompanyConsent}
                    onChange={(e) => setGuardianAccompanyConsent(e.target.checked)}
                    disabled={isRegistering}
                    className="mt-0.5 size-4 accent-it-blue-500 shrink-0 cursor-pointer"
                  />
                  <span className="text-card-meta text-it-ink-700 dark:text-wtext-4 leading-relaxed">
                    <span className="text-it-red-500 font-bold">[필수]</span> 만 14세 미만 자녀의 경우 <strong>법정대리인(보호자) 동반</strong> 또는 클럽 지정 인솔자 동반에 동의합니다. (청소년보호법)
                  </span>
                </label>
              </section>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRegForm(false)}
                  disabled={isRegistering}
                  className="h-12 px-5 min-w-[96px] rounded-w-md bg-it-fill dark:bg-rink-700 text-it-ink-700 dark:text-wtext-4 font-semibold text-card-body hover:bg-it-line dark:hover:bg-rink-500 transition-colors motion-reduce:transition-none active:brightness-95 disabled:opacity-60"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleRegister}
                  disabled={
                    isRegistering ||
                    !guardianAccompanyConsent ||
                    !passportValidConsent ||
                    !travelInsuranceConsent
                  }
                  className="flex-1 h-12 rounded-w-md bg-it-blue-500 hover:bg-it-blue-600 text-white font-bold text-card-emphasis shadow-sm transition-colors motion-reduce:transition-none active:brightness-95 disabled:bg-it-line disabled:text-it-ink-400 dark:disabled:bg-rink-500 disabled:shadow-none"
                >
                  {isRegistering ? MESSAGES.common.processing : "참가 신청하기"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 취소 확인 모달 */}
      {showCancelConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setShowCancelConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-w-lg bg-it-surface dark:bg-rink-800 p-6 shadow-sh-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center justify-center size-9 rounded-w-pill bg-it-red-500/10 dark:bg-it-red-500/15">
                <Icon
                  name="error"
                  className="text-card-title text-it-red-500"
                  aria-hidden="true"
                />
              </div>
              <h3
                id="cancel-confirm-title"
                className="text-card-emphasis font-bold text-it-ink-800 dark:text-white"
              >
                참가 취소
              </h3>
            </div>
            <p className="text-card-body text-it-ink-700 dark:text-wtext-4 leading-relaxed">
              {MESSAGES.overseasTrip.cancelConfirm}
            </p>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => setShowCancelConfirm(false)}
                className="flex-1 h-11 rounded-w-md bg-it-fill dark:bg-rink-700 text-it-ink-700 dark:text-wtext-4 font-semibold text-card-body hover:bg-it-line dark:hover:bg-rink-500 transition-colors motion-reduce:transition-none active:brightness-95"
              >
                아니요
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={isCancelling}
                className="flex-1 h-11 rounded-w-md bg-it-red-500 hover:bg-it-red-500/90 text-white font-semibold text-card-body transition-colors motion-reduce:transition-none active:brightness-95 disabled:bg-it-line dark:disabled:bg-rink-500"
              >
                {isCancelling ? MESSAGES.common.processing : "취소하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 하단 참가 신청 버튼 */}
      {canRegister && (
        <div className="fixed bottom-0 left-0 right-0 z-30 flex justify-center bg-it-surface dark:bg-rink-900 border-t border-it-line dark:border-rink-800 px-4 pb-6 pt-3">
          <button
            type="button"
            onClick={() => setShowRegForm(true)}
            className="w-full max-w-md min-h-[52px] rounded-w-md bg-it-blue-500 hover:bg-it-blue-600 text-white font-bold text-card-emphasis shadow-sm transition-colors motion-reduce:transition-none active:brightness-95"
          >
            참가 신청하기
          </button>
        </div>
      )}

      {/* 마감 안내 */}
      {trip.status === "open" &&
        isDeadlinePassed(trip.registrationDeadline) &&
        !isRegistered && (
          <div className="fixed bottom-0 left-0 right-0 z-30 flex justify-center bg-it-surface dark:bg-rink-900 border-t border-it-line dark:border-rink-800 px-4 pb-6 pt-3">
            <div className="w-full max-w-md min-h-[52px] flex items-center justify-center rounded-w-md bg-it-fill dark:bg-rink-800 text-card-body font-semibold text-it-ink-500 dark:text-wtext-4">
              {MESSAGES.overseasTrip.deadlinePassed}
            </div>
          </div>
        )}
    </MobileContainer>
  );
}

// ─── Sub-Components ─────────────────────────────────

function InfoCard({
  icon,
  label,
  value,
  highlight,
}: {
  icon: string;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-w-md bg-it-fill dark:bg-rink-900/50 p-3 border border-it-line dark:border-rink-700">
      <div className="flex items-center gap-1.5">
        <Icon
          name={icon}
          className="text-card-body text-it-ink-400 dark:text-wtext-4"
          aria-hidden="true"
        />
        <p className="text-card-meta text-it-ink-500 dark:text-wtext-4">{label}</p>
      </div>
      <p
        className={`mt-1 text-card-body font-bold tabular-nums ${
          highlight ? "text-it-blue-500" : "text-it-ink-800 dark:text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function InfoBlock({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex items-center justify-center size-8 rounded-w-md bg-it-fill dark:bg-rink-700 shrink-0 mt-0.5">
        <Icon
          name={icon}
          className="text-card-emphasis text-it-ink-500 dark:text-wtext-4"
          aria-hidden="true"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-card-meta font-semibold text-it-ink-500 dark:text-wtext-4">
          {label}
        </p>
        <p className="mt-0.5 whitespace-pre-wrap text-card-body text-it-ink-800 dark:text-white leading-relaxed">
          {value}
        </p>
      </div>
    </div>
  );
}
