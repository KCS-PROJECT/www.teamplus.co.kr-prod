'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useToast } from '@/components/ui/Toast';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import type {
  OverseasTrip,
  TripRegistration,
  TripStatus,
  RegistrationStatus,
  TripStatistics,
} from '@/types/overseas-trip';

// ─── Constants ──────────────────────────────────────

const STATUS_BADGE: Record<TripStatus, { className: string; label: string }> = {
  draft:     { className: 'bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-100', label: MESSAGES.overseasTrip.status.draft },
  open:      { className: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400', label: MESSAGES.overseasTrip.status.open },
  closed:    { className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400', label: MESSAGES.overseasTrip.status.closed },
  ongoing:   { className: 'bg-blue-100 text-ice-500 dark:bg-blue-900/20 dark:text-blue-400', label: MESSAGES.overseasTrip.status.ongoing },
  completed: { className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400', label: MESSAGES.overseasTrip.status.completed },
  cancelled: { className: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400', label: MESSAGES.overseasTrip.status.cancelled },
};

const REG_STATUS_BADGE: Record<RegistrationStatus, { className: string; label: string }> = {
  pending:      { className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400', label: MESSAGES.overseasTrip.registrationStatus.pending },
  confirmed:    { className: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400', label: MESSAGES.overseasTrip.registrationStatus.confirmed },
  deposit_paid: { className: 'bg-blue-100 text-ice-500 dark:bg-blue-900/20 dark:text-blue-400', label: MESSAGES.overseasTrip.registrationStatus.deposit_paid },
  cancelled:    { className: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400', label: MESSAGES.overseasTrip.registrationStatus.cancelled },
  waitlisted:   { className: 'bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-100', label: MESSAGES.overseasTrip.registrationStatus.waitlisted },
};

// ─── Helpers ────────────────────────────────────────

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function formatCurrency(amount: string | number | null | undefined): string {
  const value = Number(amount ?? 0);
  if (!value) return '-';
  return `${new Intl.NumberFormat('ko-KR').format(value)}원`;
}

type ViewTab = 'info' | 'participants';

// ─── Component ──────────────────────────────────────

export default function DirectorOverseasTripDetailPage() {
  // 인증/권한 체크는 (director)/layout.tsx 에서 단 한 번 수행됨 (중복 호출 금지)
  useNativeUI({ showStatusBar: true, showAppBar: false });
  const { toast } = useToast();
  const params = useParams();
  const tripId = params?.id as string;

  const [trip, setTrip] = useState<OverseasTrip | null>(null);
  const [stats, setStats] = useState<TripStatistics | null>(null);
  const [registrations, setRegistrations] = useState<TripRegistration[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [isRegsLoading, setIsRegsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ViewTab>('info');

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

  const loadStats = useCallback(async () => {
    try {
      const res = await api.get<TripStatistics>(`/overseas-trips/${tripId}/statistics`);
      if (res.success && res.data) {
        setStats(res.data);
      }
    } catch {
      // 통계 로드 실패는 치명적이지 않음
    }
  }, [tripId]);

  const loadRegistrations = useCallback(async () => {
    setIsRegsLoading(true);
    try {
      const res = await api.get<TripRegistration[]>(`/overseas-trips/${tripId}/registrations`);
      if (res.success && res.data) {
        setRegistrations(Array.isArray(res.data) ? res.data : []);
      } else {
        setRegistrations([]);
      }
    } catch {
      setRegistrations([]);
    } finally {
      setIsRegsLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    loadTrip();
    loadStats();
  }, [loadTrip, loadStats]);

  useEffect(() => {
    if (activeTab === 'participants') {
      loadRegistrations();
    }
  }, [activeTab, loadRegistrations]);

  const handleStatusChange = async (registrationId: string, status: RegistrationStatus) => {
    try {
      await api.patch(`/overseas-trips/${tripId}/registrations/${registrationId}`, { status });
      toast.success(MESSAGES.save.success);
      loadRegistrations();
      loadStats();
    } catch {
      toast.error(MESSAGES.error.general);
    }
  };

  if (isLoading) return null;

  if (!trip) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title={MESSAGES.overseasTrip.detailTitle} forceNative />
        <div className="flex flex-col items-center justify-center py-20">
          <Icon name="flight" className="mb-3 text-4xl text-wtext-4 dark:text-rink-500" aria-hidden="true" />
          <p className="text-card-body text-wtext-3">원정 정보를 찾을 수 없습니다.</p>
        </div>
      </MobileContainer>
    );
  }

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title={MESSAGES.overseasTrip.detailTitle} forceNative />

      <main className="flex-1 overflow-y-auto hide-scrollbar pb-8" role="main" aria-label="해외 원정 상세">
        {/* 히어로 — 원정 기본 정보 */}
        <section
          aria-label="원정 기본 정보"
          className="bg-white px-4 pb-5 pt-4 dark:bg-rink-800 border-b border-wline-2 dark:border-rink-700"
        >
          {/* 상태 배지 */}
          <div className="mb-3 flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-w-pill px-2.5 py-1 text-card-meta font-bold ${
                STATUS_BADGE[trip.status]?.className ?? ''
              }`}
            >
              <span className="size-1.5 rounded-w-pill bg-current opacity-70" aria-hidden="true" />
              {STATUS_BADGE[trip.status]?.label ?? trip.status}
            </span>
            {trip.ageGroup && (
              <span className="inline-flex items-center gap-0.5 rounded-w-pill bg-wline-2 dark:bg-rink-700 px-2 py-0.5 text-card-meta font-medium text-wtext-2 dark:text-rink-100">
                <Icon name="child_care" className="text-card-meta" aria-hidden="true" />
                {trip.ageGroup}
              </span>
            )}
          </div>

          {/* 타이틀 */}
          <h2 className="text-xl font-extrabold text-wtext-1 dark:text-white leading-tight">
            {trip.title}
          </h2>

          {/* 위치 · 기간 · 팀 */}
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center gap-2 text-card-body text-wtext-2 dark:text-rink-100">
              <Icon name="location_on" className="text-card-emphasis text-ice-500 dark:text-blue-300" aria-hidden="true" />
              <span className="font-semibold">{trip.country}</span>
              <span className="text-wtext-3 dark:text-rink-300">·</span>
              <span>{trip.city}</span>
            </div>
            <div className="flex items-center gap-2 text-card-body text-wtext-2 dark:text-rink-100 tabular-nums">
              <Icon name="calendar_today" className="text-card-emphasis text-ice-500 dark:text-blue-300" aria-hidden="true" />
              <span>{formatDate(trip.startDate)} ~ {formatDate(trip.endDate)}</span>
            </div>
            {trip.team?.name && (
              <div className="flex items-center gap-2 text-card-body text-wtext-2 dark:text-rink-100">
                <Icon name="sports_hockey" className="text-card-emphasis text-ice-500 dark:text-blue-300" aria-hidden="true" />
                <span>{trip.team.name}</span>
              </div>
            )}
          </div>

          {/* 통계 카드 — 4분할 톤 구분 */}
          {stats && (
            <div className="mt-4 grid grid-cols-4 gap-2">
              <div className="rounded-xl bg-wbg p-3 dark:bg-rink-900/50">
                <p className="text-card-meta font-medium text-wtext-3 dark:text-rink-300">신청</p>
                <p className="mt-0.5 text-card-title font-extrabold text-wtext-1 tabular-nums dark:text-white">
                  {stats.statistics.totalRegistrations}
                </p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-900/20">
                <p className="text-card-meta font-medium text-emerald-700 dark:text-emerald-400">확정</p>
                <p className="mt-0.5 text-card-title font-extrabold text-emerald-600 tabular-nums dark:text-emerald-300">
                  {stats.statistics.confirmed + stats.statistics.depositPaid}
                </p>
              </div>
              <div className="rounded-xl bg-blue-50 p-3 dark:bg-blue-900/20">
                <p className="text-card-meta font-medium text-ice-500 dark:text-blue-300">예치금</p>
                <p className="mt-0.5 text-card-title font-extrabold text-ice-500 tabular-nums dark:text-blue-300">
                  {stats.statistics.depositPaid}
                </p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-900/20">
                <p className="text-card-meta font-medium text-amber-700 dark:text-amber-400">잔여</p>
                <p className="mt-0.5 text-card-title font-extrabold text-amber-600 tabular-nums dark:text-amber-400">
                  {stats.statistics.remainingSlots}
                </p>
              </div>
            </div>
          )}
        </section>

        {/* 탭 — pill 스타일 */}
        <section
          className="sticky top-14 z-10 bg-wbg dark:bg-rink-900 px-4 pb-2 pt-4"
          role="tablist"
          aria-label="상세 정보 / 참가자 탭"
        >
          <div className="flex gap-1.5 rounded-xl bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 p-1">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'info'}
              onClick={() => setActiveTab('info')}
              className={`flex-1 min-h-[40px] rounded-lg py-2 text-card-meta font-bold transition-colors motion-reduce:transition-none inline-flex items-center justify-center gap-1 ${
                activeTab === 'info'
                  ? 'bg-ice-500 text-white shadow-sm'
                  : 'text-wtext-2 dark:text-rink-100 hover:bg-wbg dark:hover:bg-rink-700'
              }`}
            >
              <Icon name="info" className="text-card-body" aria-hidden="true" />
              상세 정보
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'participants'}
              onClick={() => setActiveTab('participants')}
              className={`flex-1 min-h-[40px] rounded-lg py-2 text-card-meta font-bold transition-colors motion-reduce:transition-none inline-flex items-center justify-center gap-1 ${
                activeTab === 'participants'
                  ? 'bg-ice-500 text-white shadow-sm'
                  : 'text-wtext-2 dark:text-rink-100 hover:bg-wbg dark:hover:bg-rink-700'
              }`}
            >
              <Icon name="group" className="text-card-body" aria-hidden="true" />
              참가자
              <span
                className={`tabular-nums ${
                  activeTab === 'participants'
                    ? 'text-white/90'
                    : 'text-wtext-3 dark:text-rink-300'
                }`}
              >
                {trip._count?.registrations ?? registrations.length}
              </span>
            </button>
          </div>
        </section>

        {/* 상세 정보 탭 */}
        {activeTab === 'info' && (
          <div className="space-y-3 p-4">
            {/* 일정 및 비용 */}
            <section className="rounded-xl border border-wline-2 bg-white p-5 shadow-sm dark:border-rink-700 dark:bg-rink-800">
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/20">
                  <Icon
                    name="event"
                    className="text-card-emphasis text-ice-500 dark:text-blue-300"
                    aria-hidden="true"
                  />
                </div>
                <h3 className="text-card-body font-bold text-wtext-1 dark:text-white">
                  일정 및 비용
                </h3>
              </div>
              <div className="space-y-3">
                <InfoRow
                  icon="event"
                  label={MESSAGES.overseasTrip.registrationDeadline}
                  value={formatDate(trip.registrationDeadline)}
                />
                <InfoRow
                  icon="group"
                  label={MESSAGES.overseasTrip.participants}
                  value={`${trip._count?.registrations ?? 0} / ${trip.maxParticipants}명`}
                />
                {trip.ageGroup && (
                  <InfoRow
                    icon="child_care"
                    label={MESSAGES.overseasTrip.ageGroup}
                    value={trip.ageGroup}
                  />
                )}
                {trip.estimatedCost && (
                  <InfoRow
                    icon="payments"
                    label={MESSAGES.overseasTrip.estimatedCost}
                    value={formatCurrency(trip.estimatedCost)}
                    valueAlign="right"
                  />
                )}
                {trip.depositAmount && (
                  <InfoRow
                    icon="account_balance_wallet"
                    label={MESSAGES.overseasTrip.depositAmount}
                    value={formatCurrency(trip.depositAmount)}
                    valueAlign="right"
                  />
                )}
                {trip.depositDeadline && (
                  <InfoRow
                    icon="schedule"
                    label={MESSAGES.overseasTrip.depositDeadline}
                    value={formatDate(trip.depositDeadline)}
                  />
                )}
              </div>
            </section>

            {/* 원정 설명 */}
            {trip.description && (
              <section className="rounded-xl border border-wline-2 bg-white p-5 shadow-sm dark:border-rink-700 dark:bg-rink-800">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-wline-2 dark:bg-rink-700">
                    <Icon
                      name="description"
                      className="text-card-emphasis text-wtext-2 dark:text-rink-100"
                      aria-hidden="true"
                    />
                  </div>
                  <h3 className="text-card-body font-bold text-wtext-1 dark:text-white">
                    원정 설명
                  </h3>
                </div>
                <p className="whitespace-pre-wrap text-card-body leading-relaxed text-wtext-2 dark:text-rink-100">
                  {trip.description}
                </p>
              </section>
            )}

            {/* 여행 정보 */}
            {(trip.flightInfo || trip.hotelInfo || trip.transportInfo) && (
              <section className="rounded-xl border border-wline-2 bg-white p-5 shadow-sm dark:border-rink-700 dark:bg-rink-800">
                <div className="mb-4 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                    <Icon
                      name="flight"
                      className="text-card-emphasis text-emerald-600 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                  </div>
                  <h3 className="text-card-body font-bold text-wtext-1 dark:text-white">
                    여행 정보
                  </h3>
                </div>
                <div className="space-y-3">
                  {trip.flightInfo && (
                    <InfoRow
                      icon="flight"
                      label={MESSAGES.overseasTrip.flightInfo}
                      value={trip.flightInfo}
                    />
                  )}
                  {trip.hotelInfo && (
                    <InfoRow
                      icon="hotel"
                      label={MESSAGES.overseasTrip.hotelInfo}
                      value={trip.hotelInfo}
                    />
                  )}
                  {trip.transportInfo && (
                    <InfoRow
                      icon="directions_bus"
                      label={MESSAGES.overseasTrip.transportInfo}
                      value={trip.transportInfo}
                    />
                  )}
                </div>
              </section>
            )}

            {/* 상세 일정 — 타임라인 */}
            {trip.itinerary && (
              <section className="rounded-xl border border-wline-2 bg-white p-5 shadow-sm dark:border-rink-700 dark:bg-rink-800">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/20">
                    <Icon
                      name="timeline"
                      className="text-card-emphasis text-amber-600 dark:text-amber-400"
                      aria-hidden="true"
                    />
                  </div>
                  <h3 className="text-card-body font-bold text-wtext-1 dark:text-white">
                    {MESSAGES.overseasTrip.itinerary}
                  </h3>
                </div>
                <div className="rounded-lg bg-ice-500/5 dark:bg-blue-900/15 p-4">
                  <p className="whitespace-pre-wrap text-card-body leading-relaxed text-wtext-2 dark:text-rink-100">
                    {trip.itinerary}
                  </p>
                </div>
              </section>
            )}

            {/* 연락처 */}
            {(trip.contactPhone || trip.contactEmail) && (
              <section className="rounded-xl border border-wline-2 bg-white p-5 shadow-sm dark:border-rink-700 dark:bg-rink-800">
                <div className="mb-4 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 dark:bg-rose-900/20">
                    <Icon
                      name="contact_support"
                      className="text-card-emphasis text-rose-600 dark:text-rose-400"
                      aria-hidden="true"
                    />
                  </div>
                  <h3 className="text-card-body font-bold text-wtext-1 dark:text-white">
                    연락처
                  </h3>
                </div>
                <div className="space-y-3">
                  {trip.contactPhone && (
                    <InfoRow icon="call" label="전화" value={trip.contactPhone} />
                  )}
                  {trip.contactEmail && (
                    <InfoRow icon="email" label="이메일" value={trip.contactEmail} />
                  )}
                </div>
              </section>
            )}
          </div>
        )}

        {/* 참가자 탭 */}
        {activeTab === 'participants' && (
          <div className="p-4">
            {isRegsLoading ? null : registrations.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-wline bg-white py-14 dark:border-rink-700 dark:bg-rink-800">
                <div className="flex h-14 w-14 items-center justify-center rounded-w-pill bg-wline-2 dark:bg-rink-700">
                  <Icon
                    name="group"
                    className="text-3xl text-wtext-3 dark:text-rink-300"
                    aria-hidden="true"
                  />
                </div>
                <p className="text-card-body font-semibold text-wtext-2 dark:text-rink-100">
                  {MESSAGES.empty('참가자')}
                </p>
                <p className="text-card-meta text-wtext-3 dark:text-rink-300">
                  아직 신청한 참가자가 없습니다
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {registrations.map((reg) => (
                  <article
                    key={reg.id}
                    className="rounded-xl border border-wline-2 bg-white p-4 shadow-sm dark:border-rink-700 dark:bg-rink-800"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-w-pill bg-blue-50 dark:bg-blue-900/20">
                          <Icon
                            name="person"
                            className="text-xl text-ice-500 dark:text-blue-300"
                            aria-hidden="true"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-card-body font-bold text-wtext-1 dark:text-white truncate">
                            {reg.member?.playerName ?? '-'}
                          </p>
                          <p className="text-card-meta text-wtext-3 dark:text-rink-300 truncate">
                            {reg.member?.playerAge ? `${reg.member.playerAge}세` : '-'}
                            {reg.parent?.phone ? ` · ${reg.parent.phone}` : ''}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`inline-flex shrink-0 items-center rounded-w-pill px-2 py-0.5 text-card-meta font-bold ${
                          REG_STATUS_BADGE[reg.status]?.className ?? ''
                        }`}
                      >
                        {REG_STATUS_BADGE[reg.status]?.label ?? reg.status}
                      </span>
                    </div>

                    {/* 상세 정보 뱃지들 */}
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-wline-2 pt-3 dark:border-rink-700">
                      {reg.passportVerified && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-card-meta font-semibold text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
                          <Icon name="verified" className="text-card-meta" aria-hidden="true" />
                          {MESSAGES.overseasTrip.passportVerified}
                        </span>
                      )}
                      {reg.depositPaidAt && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-card-meta font-semibold text-ice-500 dark:bg-blue-900/20 dark:text-blue-300">
                          <Icon name="payments" className="text-card-meta" aria-hidden="true" />
                          {MESSAGES.overseasTrip.registrationStatus.deposit_paid}
                        </span>
                      )}
                      <span className="text-card-meta text-wtext-3 dark:text-rink-300 tabular-nums">
                        신청일 {formatDate(reg.createdAt)}
                      </span>
                    </div>

                    {/* 관리 버튼 (대기 상태일 때) */}
                    {reg.status === 'pending' && (
                      <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleStatusChange(reg.id, 'confirmed')}
                          className="flex-1 min-h-[44px] rounded-lg bg-ice-500 hover:bg-ice-700 py-2.5 text-card-meta font-bold text-white transition-colors motion-reduce:transition-none active:brightness-95 inline-flex items-center justify-center gap-1"
                        >
                          <Icon name="check" className="text-card-body" aria-hidden="true" />
                          확정하기
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusChange(reg.id, 'cancelled')}
                          className="flex-1 min-h-[44px] rounded-lg border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 py-2.5 text-card-meta font-bold text-wtext-2 dark:text-rink-100 transition-colors motion-reduce:transition-none hover:bg-wbg dark:hover:bg-rink-700 active:brightness-95 inline-flex items-center justify-center gap-1"
                        >
                          <Icon name="close" className="text-card-body" aria-hidden="true" />
                          거절하기
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </MobileContainer>
  );
}

// ─── Sub-Components ─────────────────────────────────

function InfoRow({
  icon,
  label,
  value,
  valueAlign = 'left',
}: {
  icon: string;
  label: string;
  value: string;
  valueAlign?: 'left' | 'right';
}) {
  const isAmount = valueAlign === 'right';
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-wline-2 dark:bg-rink-700">
        <Icon
          name={icon}
          className="text-card-body text-wtext-3 dark:text-rink-300"
          aria-hidden="true"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-card-meta font-medium text-wtext-3 dark:text-rink-300">
          {label}
        </p>
      </div>
      <p
        className={`text-card-body font-semibold text-wtext-1 dark:text-white ${
          isAmount ? 'text-right tabular-nums' : ''
        }`}
      >
        {value}
      </p>
    </div>
  );
}
