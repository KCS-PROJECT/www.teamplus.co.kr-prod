'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/ui/page-header';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Modal, ModalHeader, ModalBody, ModalFooter, ConfirmModal } from '@/components/ui/modal';
import { api } from '@/services/api-client';
import {
  TRIP_STATUSES,
  TRIP_STATUS_COLORS,
  TRIP_STATUS_DEFAULT,
  TRIP_STATUS_LABELS,
  type TripStatus,
} from '@/lib/tournament-status';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Plane,
  ArrowLeft,
  Users,
  ChevronRight,
  MapPin,
  CheckCircle,
  FileText,
  Wallet,
} from 'lucide-react';

type RegistrationStatus = 'pending' | 'confirmed' | 'deposit_paid' | 'cancelled' | 'waitlisted';

interface PublicClub {
  id: string;
  clubName: string;
  location?: string | null;
}

interface PublicClubResponse {
  clubs: PublicClub[];
}

interface OverseasTrip {
  id: string;
  clubId: string;
  title: string;
  country: string;
  city: string;
  description: string | null;
  startDate: string;
  endDate: string;
  registrationDeadline: string;
  maxParticipants: number;
  ageGroup: string | null;
  estimatedCost: number | string | null;
  depositAmount: number | string | null;
  depositDeadline: string | null;
  flightInfo: string | null;
  hotelInfo: string | null;
  transportInfo: string | null;
  itinerary: string | null;
  status: TripStatus;
  contactPhone: string | null;
  contactEmail: string | null;
  club?: {
    id: string;
    clubName: string;
  };
  _count?: {
    registrations: number;
  };
}

interface TripRegistration {
  id: string;
  tripId: string;
  status: RegistrationStatus;
  depositAmount: string | null;
  depositPaidAt: string | null;
  passportVerified: boolean;
  createdAt: string;
  member: {
    id: string;
    playerName: string;
    playerAge: number;
  };
  parent?: {
    id: string;
    email: string | null;
    phone: string | null;
  } | null;
  child?: {
    id: string;
    email: string | null;
    phone: string | null;
  } | null;
}

interface TripFormState {
  clubId: string;
  title: string;
  country: string;
  city: string;
  description: string;
  startDate: string;
  endDate: string;
  registrationDeadline: string;
  maxParticipants: number;
  ageGroup: string;
  estimatedCost: number;
  depositAmount: number;
  depositDeadline: string;
  flightInfo: string;
  hotelInfo: string;
  transportInfo: string;
  itinerary: string;
  status: TripStatus;
  contactPhone: string;
  contactEmail: string;
}

const registrationStatusLabels: Record<RegistrationStatus, string> = {
  pending: '대기',
  confirmed: '확정',
  deposit_paid: '예치금 완료',
  cancelled: '취소',
  waitlisted: '대기목록',
};

const registrationStatusColors: Record<RegistrationStatus, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  confirmed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  deposit_paid: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  waitlisted: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
};

const emptyTripForm: TripFormState = {
  clubId: '',
  title: '',
  country: '',
  city: '',
  description: '',
  startDate: '',
  endDate: '',
  registrationDeadline: '',
  maxParticipants: 20,
  ageGroup: '',
  estimatedCost: 0,
  depositAmount: 0,
  depositDeadline: '',
  flightInfo: '',
  hotelInfo: '',
  transportInfo: '',
  itinerary: '',
  status: TRIP_STATUS_DEFAULT,
  contactPhone: '',
  contactEmail: '',
};

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) {
    return '-';
  }

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

function formatCurrency(amount: number | string | null | undefined) {
  const value = Number(amount ?? 0);

  if (!value) {
    return '-';
  }

  return `${new Intl.NumberFormat('ko-KR').format(value)}원`;
}

function toDateInputValue(value: string | null | undefined) {
  return value ? value.split('T')[0] : '';
}

function buildTripPayload(form: TripFormState) {
  return {
    clubId: form.clubId,
    title: form.title.trim(),
    country: form.country.trim(),
    city: form.city.trim(),
    description: form.description.trim() || undefined,
    startDate: form.startDate,
    endDate: form.endDate,
    registrationDeadline: form.registrationDeadline,
    maxParticipants: Number(form.maxParticipants),
    ageGroup: form.ageGroup.trim() || undefined,
    estimatedCost: form.estimatedCost > 0 ? String(form.estimatedCost) : undefined,
    depositAmount: form.depositAmount > 0 ? String(form.depositAmount) : undefined,
    depositDeadline: form.depositDeadline || undefined,
    flightInfo: form.flightInfo.trim() || undefined,
    hotelInfo: form.hotelInfo.trim() || undefined,
    transportInfo: form.transportInfo.trim() || undefined,
    itinerary: form.itinerary.trim() || undefined,
    status: form.status,
    contactPhone: form.contactPhone.trim() || undefined,
    contactEmail: form.contactEmail.trim() || undefined,
  };
}

export default function OverseasTripsPage() {
  const [view, setView] = useState<'trips' | 'registrations'>('trips');
  const [selectedTrip, setSelectedTrip] = useState<OverseasTrip | null>(null);

  const [trips, setTrips] = useState<OverseasTrip[]>([]);
  const [clubs, setClubs] = useState<PublicClub[]>([]);
  const [tripSearch, setTripSearch] = useState('');
  const [isTripLoading, setIsTripLoading] = useState(true);

  const [registrations, setRegistrations] = useState<TripRegistration[]>([]);
  const [isRegLoading, setIsRegLoading] = useState(false);

  const [isTripModalOpen, setIsTripModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<OverseasTrip | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [tripForm, setTripForm] = useState<TripFormState>(emptyTripForm);
  const [isSaving, setIsSaving] = useState(false);

  const loadClubs = useCallback(async () => {
    try {
      const response = await api.get<PublicClubResponse>('/teams/public?limit=200');
      setClubs(response.clubs ?? []);
    } catch (error) {
      console.error('[해외원정] 클럽 목록 로드 실패:', error);
      setClubs([]);
    }
  }, []);

  const loadTrips = useCallback(async () => {
    setIsTripLoading(true);

    try {
      const response = await api.get<OverseasTrip[]>('/overseas-trips');
      setTrips(Array.isArray(response) ? response : []);
    } catch (error) {
      console.error('[해외원정] 목록 로드 실패:', error);
      setTrips([]);
    } finally {
      setIsTripLoading(false);
    }
  }, []);

  const loadRegistrations = useCallback(async (tripId: string) => {
    setIsRegLoading(true);

    try {
      const response = await api.get<TripRegistration[]>(`/overseas-trips/${tripId}/registrations`);
      setRegistrations(Array.isArray(response) ? response : []);
    } catch (error) {
      console.error('[해외원정] 참가자 로드 실패:', error);
      setRegistrations([]);
    } finally {
      setIsRegLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClubs();
    loadTrips();
  }, [loadClubs, loadTrips]);

  const openTripModal = (trip?: OverseasTrip) => {
    if (trip) {
      setEditingTrip(trip);
      setTripForm({
        clubId: trip.clubId,
        title: trip.title,
        country: trip.country,
        city: trip.city,
        description: trip.description ?? '',
        startDate: toDateInputValue(trip.startDate),
        endDate: toDateInputValue(trip.endDate),
        registrationDeadline: toDateInputValue(trip.registrationDeadline),
        maxParticipants: trip.maxParticipants,
        ageGroup: trip.ageGroup ?? '',
        estimatedCost: Number(trip.estimatedCost ?? 0),
        depositAmount: Number(trip.depositAmount ?? 0),
        depositDeadline: toDateInputValue(trip.depositDeadline),
        flightInfo: trip.flightInfo ?? '',
        hotelInfo: trip.hotelInfo ?? '',
        transportInfo: trip.transportInfo ?? '',
        itinerary: trip.itinerary ?? '',
        status: trip.status,
        contactPhone: trip.contactPhone ?? '',
        contactEmail: trip.contactEmail ?? '',
      });
    } else {
      setEditingTrip(null);
      setTripForm(emptyTripForm);
    }

    setIsTripModalOpen(true);
  };

  const saveTrip = async () => {
    if (
      !tripForm.clubId ||
      !tripForm.title.trim() ||
      !tripForm.country.trim() ||
      !tripForm.city.trim() ||
      !tripForm.startDate ||
      !tripForm.endDate ||
      !tripForm.registrationDeadline
    ) {
      window.alert('필수 항목을 모두 입력해주세요.');
      return;
    }

    setIsSaving(true);

    try {
      const payload = buildTripPayload(tripForm);

      if (editingTrip) {
        await api.put(`/overseas-trips/${editingTrip.id}`, payload);
      } else {
        await api.post('/overseas-trips', payload);
      }

      setIsTripModalOpen(false);
      setEditingTrip(null);
      setTripForm(emptyTripForm);
      await loadTrips();
    } catch (error) {
      console.error('[해외원정] 저장 실패:', error);
      window.alert('저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      await api.delete(`/overseas-trips/${deleteTarget.id}`);
      await loadTrips();
    } catch (error) {
      console.error('[해외원정] 삭제 실패:', error);
      window.alert('삭제에 실패했습니다.');
    } finally {
      setIsDeleteModalOpen(false);
      setDeleteTarget(null);
    }
  };

  const selectTrip = (trip: OverseasTrip) => {
    setSelectedTrip(trip);
    setView('registrations');
    loadRegistrations(trip.id);
  };

  const goBackToTrips = () => {
    setView('trips');
    setSelectedTrip(null);
    setRegistrations([]);
  };

  const updateRegistrationStatus = async (registrationId: string, status: RegistrationStatus) => {
    if (!selectedTrip) {
      return;
    }

    try {
      await api.put(`/overseas-trips/${selectedTrip.id}/registrations/${registrationId}`, { status });
      await loadRegistrations(selectedTrip.id);
      await loadTrips();
    } catch (error) {
      console.error('[해외원정] 상태 변경 실패:', error);
      window.alert('상태 변경에 실패했습니다.');
    }
  };

  const processDeposit = async (registrationId: string) => {
    if (!selectedTrip || Number(selectedTrip.depositAmount ?? 0) <= 0) {
      return;
    }

    try {
      await api.post(`/overseas-trips/${selectedTrip.id}/registrations/${registrationId}/deposit`, {
        amount: String(selectedTrip.depositAmount),
      });
      await loadRegistrations(selectedTrip.id);
      await loadTrips();
    } catch (error) {
      console.error('[해외원정] 예치금 처리 실패:', error);
      window.alert('예치금 처리에 실패했습니다.');
    }
  };

  const filteredTrips = trips.filter((trip) => {
    if (!tripSearch) {
      return true;
    }

    const keyword = tripSearch.toLowerCase();
    return (
      trip.title.toLowerCase().includes(keyword) ||
      trip.country.toLowerCase().includes(keyword) ||
      trip.city.toLowerCase().includes(keyword) ||
      trip.club?.clubName?.toLowerCase().includes(keyword)
    );
  });

  const depositPaidCount = registrations.filter((registration) => Boolean(registration.depositPaidAt)).length;
  const approvedCount = registrations.filter((registration) =>
    registration.status === 'confirmed' || registration.status === 'deposit_paid'
  ).length;
  const passportVerifiedCount = registrations.filter((registration) => registration.passportVerified).length;

  return (
    <div className="space-y-6">
      <PageHeader title="해외원정 관리" description="해외 원정 일정과 참가자 상태를 관리합니다." />

      {view === 'trips' && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <Plane className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">원정 목록</h2>
              <Badge variant="secondary" className="text-xs">
                {filteredTrips.length}건
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="제목, 국가, 도시, 클럽 검색"
                  value={tripSearch}
                  onChange={(event) => setTripSearch(event.target.value)}
                  className="w-72 pl-9"
                />
              </div>
              <Button type="button" onClick={() => openTripModal()}>
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                원정 추가
              </Button>
            </div>
          </div>

          {isTripLoading ? (
            <div className="flex justify-center py-16">
              <LoadingSpinner />
            </div>
          ) : filteredTrips.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Plane className="mx-auto mb-3 h-12 w-12 opacity-30" />
              <p>등록된 해외원정이 없습니다.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              <div className="grid grid-cols-[1.7fr_1.1fr_1.1fr_110px_110px_90px_110px] gap-3 bg-slate-50 px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-slate-500 dark:bg-slate-800">
                <span>원정</span>
                <span>클럽</span>
                <span>일정</span>
                <span className="text-center">인원</span>
                <span className="text-center">예치금</span>
                <span className="text-center">상태</span>
                <span className="text-center">관리</span>
              </div>

              {filteredTrips.map((trip) => (
                <div
                  key={trip.id}
                  className="grid cursor-pointer grid-cols-[1.7fr_1.1fr_1.1fr_110px_110px_90px_110px] items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  onClick={() => selectTrip(trip)}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-slate-900 dark:text-white">{trip.title}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {trip.country} {trip.city}
                      </span>
                    </div>
                  </div>
                  <span className="truncate text-sm text-slate-600 dark:text-slate-400">{trip.club?.clubName ?? '-'}</span>
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    {formatDate(trip.startDate)} ~ {formatDate(trip.endDate)}
                  </span>
                  <span className="text-center text-sm text-slate-600 dark:text-slate-400">
                    {trip._count?.registrations ?? 0}/{trip.maxParticipants}명
                  </span>
                  <span className="text-right tabular-nums font-semibold text-sm text-slate-700 dark:text-slate-200 pr-2">
                    {formatCurrency(trip.depositAmount)}
                  </span>
                  <span className="text-center">
                    <Badge className={`text-xs ${TRIP_STATUS_COLORS[trip.status]}`}>{TRIP_STATUS_LABELS[trip.status]}</Badge>
                  </span>
                  <div className="flex items-center justify-center gap-1" onClick={(event) => event.stopPropagation()}>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => openTripModal(trip)} title="수정" aria-label="원정 수정">
                      <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => {
                        setDeleteTarget({ id: trip.id, name: trip.title });
                        setIsDeleteModalOpen(true);
                      }}
                      title="삭제"
                      aria-label="원정 삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {view === 'registrations' && selectedTrip && (
        <>
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-3">
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => goBackToTrips()} aria-label="원정 목록으로 돌아가기">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Plane className="h-5 w-5 text-blue-600" />
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{selectedTrip.title}</h2>
                <p className="text-sm text-slate-500">
                  {selectedTrip.club?.clubName ?? '-'} · {selectedTrip.country} {selectedTrip.city} · {formatDate(selectedTrip.startDate)} ~{' '}
                  {formatDate(selectedTrip.endDate)}
                </p>
              </div>
              <Badge className={`ml-auto text-xs ${TRIP_STATUS_COLORS[selectedTrip.status]}`}>{TRIP_STATUS_LABELS[selectedTrip.status]}</Badge>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-600" />
                  <p className="text-xs text-slate-500">참가인원</p>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                  {registrations.length}/{selectedTrip.maxParticipants}명
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <p className="text-xs text-slate-500">확정완료</p>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{approvedCount}명</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-amber-600" />
                  <p className="text-xs text-slate-500">예치금 납부</p>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{depositPaidCount}명</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-purple-600" />
                  <p className="text-xs text-slate-500">여권 확인</p>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{passportVerifiedCount}명</p>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">참가자 목록</h2>
                <Badge variant="secondary" className="text-xs">
                  {registrations.length}명
                </Badge>
              </div>
              <div className="text-sm text-slate-500">
                예치금{' '}
                <span className="tabular-nums font-semibold text-slate-700 dark:text-slate-200">
                  {formatCurrency(selectedTrip.depositAmount)}
                </span>{' '}
                · 모집 마감 {formatDate(selectedTrip.registrationDeadline)}
              </div>
            </div>

            {isRegLoading ? (
              <div className="flex justify-center py-16">
                <LoadingSpinner />
              </div>
            ) : registrations.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <Users className="mx-auto mb-3 h-12 w-12 opacity-30" />
                <p>등록된 참가자가 없습니다.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                <div className="grid grid-cols-[1.2fr_1.2fr_110px_110px_80px_100px_240px] gap-3 bg-slate-50 px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-slate-500 dark:bg-slate-800">
                  <span>선수명</span>
                  <span>연락처</span>
                  <span className="text-center">상태</span>
                  <span className="text-center">예치금</span>
                  <span className="text-center">여권</span>
                  <span className="text-center">신청일</span>
                  <span>관리</span>
                </div>

                {registrations.map((registration) => (
                  <div
                    key={registration.id}
                    className="grid grid-cols-[1.2fr_1.2fr_110px_110px_80px_100px_240px] items-center gap-3 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{registration.member.playerName}</p>
                      <p className="text-xs text-slate-500">{registration.member.playerAge}세</p>
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      <p>{registration.parent?.email || registration.child?.email || '-'}</p>
                      <p className="text-xs">{registration.parent?.phone || registration.child?.phone || '-'}</p>
                    </div>
                    <span className="text-center">
                      <Badge className={`text-xs ${registrationStatusColors[registration.status]}`}>
                        {registrationStatusLabels[registration.status]}
                      </Badge>
                    </span>
                    <span className="text-right tabular-nums font-semibold text-sm text-slate-700 dark:text-slate-200 pr-2">
                      {registration.depositPaidAt ? formatCurrency(registration.depositAmount) : '미납'}
                    </span>
                    <span className="text-center text-sm text-slate-600 dark:text-slate-400">
                      {registration.passportVerified ? '완료' : '미확인'}
                    </span>
                    <span className="text-center text-xs text-slate-500">{formatDate(registration.createdAt)}</span>
                    <div className="flex flex-wrap gap-2">
                      {registration.status !== 'confirmed' && registration.status !== 'deposit_paid' && (
                        <Button type="button" variant="outline" size="sm" onClick={() => updateRegistrationStatus(registration.id, 'confirmed')}>
                          확정
                        </Button>
                      )}
                      {registration.status !== 'waitlisted' && (
                        <Button type="button" variant="outline" size="sm" onClick={() => updateRegistrationStatus(registration.id, 'waitlisted')}>
                          대기
                        </Button>
                      )}
                      {registration.status !== 'cancelled' && (
                        <Button type="button" variant="outline" size="sm" onClick={() => updateRegistrationStatus(registration.id, 'cancelled')}>
                          취소
                        </Button>
                      )}
                      {!registration.depositPaidAt && Number(selectedTrip.depositAmount ?? 0) > 0 && registration.status !== 'cancelled' && (
                        <Button type="button" size="sm" onClick={() => processDeposit(registration.id)}>
                          예치금 완료
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      <Modal isOpen={isTripModalOpen} onClose={() => setIsTripModalOpen(false)} size="xl">
        <ModalHeader title={editingTrip ? '해외원정 수정' : '해외원정 추가'} />
        <ModalBody scrollable>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                운영 클럽 <span className="text-red-500">*</span>
              </label>
              <select
                value={tripForm.clubId}
                onChange={(event) => setTripForm((prev) => ({ ...prev, clubId: event.target.value }))}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="">클럽을 선택하세요</option>
                {clubs.map((club) => (
                  <option key={club.id} value={club.id}>
                    {club.clubName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                원정명 <span className="text-red-500">*</span>
              </label>
              <Input value={tripForm.title} onChange={(event) => setTripForm((prev) => ({ ...prev, title: event.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">연령대</label>
              <Input value={tripForm.ageGroup} onChange={(event) => setTripForm((prev) => ({ ...prev, ageGroup: event.target.value }))} placeholder="예: U12 / 중등부" />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                국가 <span className="text-red-500">*</span>
              </label>
              <Input value={tripForm.country} onChange={(event) => setTripForm((prev) => ({ ...prev, country: event.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                도시 <span className="text-red-500">*</span>
              </label>
              <Input value={tripForm.city} onChange={(event) => setTripForm((prev) => ({ ...prev, city: event.target.value }))} />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                시작일 <span className="text-red-500">*</span>
              </label>
              <Input type="date" value={tripForm.startDate} onChange={(event) => setTripForm((prev) => ({ ...prev, startDate: event.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                종료일 <span className="text-red-500">*</span>
              </label>
              <Input type="date" value={tripForm.endDate} onChange={(event) => setTripForm((prev) => ({ ...prev, endDate: event.target.value }))} />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                모집 마감일 <span className="text-red-500">*</span>
              </label>
              <Input
                type="date"
                value={tripForm.registrationDeadline}
                onChange={(event) => setTripForm((prev) => ({ ...prev, registrationDeadline: event.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">원정 상태</label>
              <select
                value={tripForm.status}
                onChange={(event) => setTripForm((prev) => ({ ...prev, status: event.target.value as TripStatus }))}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                {TRIP_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {TRIP_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">최대 참가 인원</label>
              <Input
                type="number"
                min={1}
                value={tripForm.maxParticipants}
                onChange={(event) => setTripForm((prev) => ({ ...prev, maxParticipants: Number(event.target.value) || 1 }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">예상 총비용</label>
              <Input
                type="number"
                min={0}
                value={tripForm.estimatedCost}
                onChange={(event) => setTripForm((prev) => ({ ...prev, estimatedCost: Number(event.target.value) || 0 }))}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">예치금</label>
              <Input
                type="number"
                min={0}
                value={tripForm.depositAmount}
                onChange={(event) => setTripForm((prev) => ({ ...prev, depositAmount: Number(event.target.value) || 0 }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">예치금 마감일</label>
              <Input
                type="date"
                value={tripForm.depositDeadline}
                onChange={(event) => setTripForm((prev) => ({ ...prev, depositDeadline: event.target.value }))}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">항공 정보</label>
              <Input value={tripForm.flightInfo} onChange={(event) => setTripForm((prev) => ({ ...prev, flightInfo: event.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">숙소 정보</label>
              <Input value={tripForm.hotelInfo} onChange={(event) => setTripForm((prev) => ({ ...prev, hotelInfo: event.target.value }))} />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">교통 정보</label>
              <Input value={tripForm.transportInfo} onChange={(event) => setTripForm((prev) => ({ ...prev, transportInfo: event.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">연락처</label>
              <Input value={tripForm.contactPhone} onChange={(event) => setTripForm((prev) => ({ ...prev, contactPhone: event.target.value }))} />
            </div>

            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">문의 이메일</label>
              <Input value={tripForm.contactEmail} onChange={(event) => setTripForm((prev) => ({ ...prev, contactEmail: event.target.value }))} />
            </div>

            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">원정 설명</label>
              <Textarea
                value={tripForm.description}
                onChange={(event) => setTripForm((prev) => ({ ...prev, description: event.target.value }))}
                rows={4}
              />
            </div>

            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">세부 일정</label>
              <Textarea
                value={tripForm.itinerary}
                onChange={(event) => setTripForm((prev) => ({ ...prev, itinerary: event.target.value }))}
                rows={4}
              />
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="outline" onClick={() => setIsTripModalOpen(false)}>
            취소
          </Button>
          <Button type="button" onClick={() => saveTrip()} disabled={isSaving}>
            {isSaving ? '저장 중...' : editingTrip ? '수정하기' : '등록하기'}
          </Button>
        </ModalFooter>
      </Modal>

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeleteTarget(null);
        }}
        onConfirm={handleDelete}
        title="해외원정을 삭제하시겠습니까?"
        description={deleteTarget ? `${deleteTarget.name} 원정과 참가자 정보가 함께 삭제됩니다.` : ''}
        confirmText="삭제하기"
        cancelText="취소"
        variant="danger"
      />
    </div>
  );
}
