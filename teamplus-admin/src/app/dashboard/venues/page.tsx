'use client';

/**
 * 대관 관리 페이지 - TEAMPLUS Admin
 *
 * === Design 7 Principles 적용 ===
 * 1. 화면 분석: 구장 목록, 예약 현황, 승인/거절
 * 2. 휴먼 디자인: 테이블 기반 목록, 상태 배지
 * 3. AI 스타일 금지: gradient, blur 미사용
 * 4. 페르소나 융합: frontend + architect
 * 5. 명령어 필수: frontend-design 페르소나 적용
 * 6. 결과 출력: 7원칙 적용 완료
 * 7. Tone & Manner: 한글 존댓말, 액션 동사
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader, StatsGrid } from '@/components/ui/page-header';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/services/api-client';
import {
  MapPin, Search, Calendar, Users, Clock,
  CheckCircle, XCircle, Eye, Building2, ArrowLeft,
} from 'lucide-react';

type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

interface Venue {
  id: string;
  name: string;
  address: string;
  city: string | null;
  phone: string | null;
  capacity: number | null;
  rinkCount: number | null;
  operatingHours: string | null;
  description: string | null;
  imageUrl: string | null;
}

interface VenueListResponse {
  venues: Venue[];
  total: number;
  page: number;
  limit: number;
}

interface Booking {
  id: string;
  venueId: string;
  userId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  purpose: string | null;
  participants: number | null;
  status: BookingStatus;
  memo: string | null;
  rejectReason: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  user?: {
    id: string;
    email: string;
    name?: string;
  };
  club?: {
    id: string;
    clubName: string;
  } | null;
  venue?: {
    id: string;
    name: string;
  };
}

interface BookingListResponse {
  bookings: Booking[];
  total: number;
  page: number;
  limit: number;
}

const bookingStatusLabels: Record<BookingStatus, string> = {
  pending: '대기중',
  confirmed: '승인',
  cancelled: '취소',
  completed: '완료',
};

const bookingStatusColors: Record<BookingStatus, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  confirmed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
};

const purposeLabels: Record<string, string> = {
  training: '훈련',
  match: '경기',
  lesson: '수업',
  event: '행사',
  rental: '대관',
  pt: '개인 훈련',
};

function formatDate(dateStr: string | null | undefined) {
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

export default function VenuesPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Booking view
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingTotal, setBookingTotal] = useState(0);
  const [isLoadingBookings, setIsLoadingBookings] = useState(false);
  const [bookingStatusFilter, setBookingStatusFilter] = useState<'all' | BookingStatus>('all');
  const [bookingDateFilter, setBookingDateFilter] = useState('');

  // Reject modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectBooking, setRejectBooking] = useState<Booking | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Detail modal
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null);

  const fetchVenues = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await api.get<VenueListResponse>('/venues', {
        params: { limit: 100, search: searchTerm || undefined },
      });
      setVenues(data.venues || []);
    } catch (error) {
      console.error('구장 목록 조회 실패:', error);
      setVenues([]);
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    fetchVenues();
  }, [fetchVenues]);

  const fetchBookings = useCallback(async (venueId: string) => {
    try {
      setIsLoadingBookings(true);
      const params: Record<string, string | undefined> = {
        limit: '50',
      };
      if (bookingStatusFilter !== 'all') params.status = bookingStatusFilter;
      if (bookingDateFilter) params.date = bookingDateFilter;

      const data = await api.get<BookingListResponse>(`/venues/${venueId}/bookings`, { params });
      setBookings(data.bookings || []);
      setBookingTotal(data.total || 0);
    } catch (error) {
      console.error('예약 목록 조회 실패:', error);
      setBookings([]);
      setBookingTotal(0);
    } finally {
      setIsLoadingBookings(false);
    }
  }, [bookingStatusFilter, bookingDateFilter]);

  useEffect(() => {
    if (selectedVenue) {
      fetchBookings(selectedVenue.id);
    }
  }, [selectedVenue, fetchBookings]);

  const handleApprove = async (booking: Booking) => {
    if (!confirm(`"${booking.title}" 예약을 승인하시겠습니까?`)) return;
    try {
      setIsProcessing(true);
      await api.patch(`/venues/bookings/${booking.id}/approve`);
      if (selectedVenue) await fetchBookings(selectedVenue.id);
    } catch (error) {
      console.error('예약 승인 실패:', error);
      alert('예약 승인에 실패했습니다. 시간대 충돌이 있을 수 있습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  const openRejectModal = (booking: Booking) => {
    setRejectBooking(booking);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const handleReject = async () => {
    if (!rejectBooking || !rejectReason.trim()) {
      alert('거절 사유를 입력해주세요.');
      return;
    }
    try {
      setIsProcessing(true);
      await api.patch(`/venues/bookings/${rejectBooking.id}/reject`, {
        reason: rejectReason,
      });
      setShowRejectModal(false);
      setRejectBooking(null);
      setRejectReason('');
      if (selectedVenue) await fetchBookings(selectedVenue.id);
    } catch (error) {
      console.error('예약 거절 실패:', error);
      alert('예약 거절에 실패했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  const openDetailModal = (booking: Booking) => {
    setDetailBooking(booking);
    setShowDetailModal(true);
  };

  // Stats
  const venueStats = {
    totalVenues: venues.length,
  };

  if (isLoading) {
    return <LoadingSpinner message="구장 정보를 불러오는 중..." />;
  }

  // Booking list view for selected venue
  if (selectedVenue) {
    const pendingCount = bookings.filter(b => b.status === 'pending').length;
    const confirmedCount = bookings.filter(b => b.status === 'confirmed').length;

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { setSelectedVenue(null); setBookings([]); }}
            className="h-10 w-10 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {selectedVenue.name} - 예약 관리
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {selectedVenue.address}
            </p>
          </div>
        </div>

        <StatsGrid
          stats={[
            { label: '전체 예약', value: bookingTotal, icon: Calendar },
            { label: '승인 대기', value: pendingCount, icon: Clock },
            { label: '승인 완료', value: confirmedCount, icon: CheckCircle },
          ]}
        />

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <select
            value={bookingStatusFilter}
            onChange={(e) => setBookingStatusFilter(e.target.value as 'all' | BookingStatus)}
            className="h-10 px-3 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
          >
            <option value="all">전체 상태</option>
            <option value="pending">대기중</option>
            <option value="confirmed">승인</option>
            <option value="cancelled">취소</option>
            <option value="completed">완료</option>
          </select>
          <Input
            type="date"
            value={bookingDateFilter}
            onChange={(e) => setBookingDateFilter(e.target.value)}
            className="h-10 w-auto sm:w-48 bg-white dark:bg-slate-800"
            placeholder="날짜 필터"
          />
          {bookingDateFilter && (
            <Button variant="ghost" size="sm" onClick={() => setBookingDateFilter('')}>
              날짜 초기화
            </Button>
          )}
        </div>

        {/* Bookings Table */}
        {isLoadingBookings ? (
          <LoadingSpinner message="예약 정보를 불러오는 중..." />
        ) : (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                  <TableHead className="font-semibold">예약 제목</TableHead>
                  <TableHead className="font-semibold">날짜</TableHead>
                  <TableHead className="font-semibold">시간</TableHead>
                  <TableHead className="font-semibold">목적</TableHead>
                  <TableHead className="font-semibold">인원</TableHead>
                  <TableHead className="font-semibold">상태</TableHead>
                  <TableHead className="font-semibold text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-slate-500">
                      <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      예약 내역이 없습니다
                    </TableCell>
                  </TableRow>
                ) : (
                  bookings.map((booking) => (
                    <TableRow key={booking.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <TableCell className="font-medium text-slate-900 dark:text-white">
                        {booking.title}
                        {booking.user?.email && (
                          <p className="text-xs text-slate-400 mt-0.5">{booking.user.email}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-400">
                        {formatDate(booking.date)}
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-400">
                        {booking.startTime} ~ {booking.endTime}
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-400">
                        {booking.purpose ? (purposeLabels[booking.purpose] || booking.purpose) : '-'}
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-400">
                        {booking.participants || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge className={bookingStatusColors[booking.status]}>
                          {bookingStatusLabels[booking.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openDetailModal(booking)}
                            className="min-h-[44px] min-w-[44px] h-11 w-11 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-600 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 motion-reduce:transition-none transition-colors"
                            title="상세 보기"
                            aria-label="상세 보기"
                          >
                            <Eye className="w-4 h-4" aria-hidden="true" />
                          </button>
                          {booking.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleApprove(booking)}
                                disabled={isProcessing}
                                className="min-h-[44px] min-w-[44px] h-11 w-11 flex items-center justify-center hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg text-slate-500 hover:text-green-600 dark:text-slate-400 dark:hover:text-green-400 motion-reduce:transition-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="승인"
                                aria-label="예약 승인"
                              >
                                <CheckCircle className="w-4 h-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openRejectModal(booking)}
                                disabled={isProcessing}
                                className="min-h-[44px] min-w-[44px] h-11 w-11 flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 motion-reduce:transition-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="거절"
                                aria-label="예약 거절"
                              >
                                <XCircle className="w-4 h-4" aria-hidden="true" />
                              </button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Reject Modal */}
        <Modal isOpen={showRejectModal} onClose={() => setShowRejectModal(false)} size="md">
          <ModalHeader title="예약 거절" description={`"${rejectBooking?.title}" 예약을 거절합니다`} icon={XCircle} />
          <ModalBody>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                거절 사유 <span className="text-red-500">*</span>
              </label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="거절 사유를 입력하세요"
                rows={3}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowRejectModal(false)} disabled={isProcessing}>
              취소
            </Button>
            <Button
              onClick={handleReject}
              disabled={isProcessing || !rejectReason.trim()}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isProcessing ? '처리 중...' : '거절하기'}
            </Button>
          </ModalFooter>
        </Modal>

        {/* Detail Modal */}
        <Modal isOpen={showDetailModal} onClose={() => setShowDetailModal(false)} size="md">
          <ModalHeader title="예약 상세" icon={Calendar} />
          <ModalBody>
            {detailBooking && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">예약 제목</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{detailBooking.title}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">상태</p>
                    <Badge className={bookingStatusColors[detailBooking.status]}>
                      {bookingStatusLabels[detailBooking.status]}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">날짜</p>
                    <p className="text-sm text-slate-900 dark:text-white">{formatDate(detailBooking.date)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">시간</p>
                    <p className="text-sm text-slate-900 dark:text-white">{detailBooking.startTime} ~ {detailBooking.endTime}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">목적</p>
                    <p className="text-sm text-slate-900 dark:text-white">
                      {detailBooking.purpose ? (purposeLabels[detailBooking.purpose] || detailBooking.purpose) : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">참가 인원</p>
                    <p className="text-sm text-slate-900 dark:text-white">{detailBooking.participants || '-'}명</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">신청자</p>
                    <p className="text-sm text-slate-900 dark:text-white">{detailBooking.user?.email || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">신청일</p>
                    <p className="text-sm text-slate-900 dark:text-white">{formatDate(detailBooking.createdAt)}</p>
                  </div>
                </div>
                {detailBooking.memo && (
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">메모</p>
                    <p className="text-sm text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-700 p-3 rounded-lg">
                      {detailBooking.memo}
                    </p>
                  </div>
                )}
                {detailBooking.rejectReason && (
                  <div>
                    <p className="text-xs text-red-500 mb-1">거절 사유</p>
                    <p className="text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                      {detailBooking.rejectReason}
                    </p>
                  </div>
                )}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowDetailModal(false)}>
              닫기
            </Button>
          </ModalFooter>
        </Modal>
      </div>
    );
  }

  // Venue list view
  const filteredVenues = venues.filter(v =>
    v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (v.city || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="대관 관리"
        description="구장 및 대관 예약을 관리합니다"
      />

      <StatsGrid
        stats={[
          { label: '등록 구장', value: venueStats.totalVenues, icon: Building2 },
        ]}
      />

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 sm:max-w-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="구장명, 주소 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-11 bg-white dark:bg-slate-800"
            />
          </div>
        </div>
      </div>

      {/* Venue Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredVenues.map((venue) => (
          <button
            key={venue.id}
            type="button"
            onClick={() => setSelectedVenue(venue)}
            className="group bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 text-left hover:border-primary/50 dark:hover:border-primary/50 motion-reduce:transition-none transition-colors cursor-pointer"
            aria-label={`${venue.name} 예약 관리로 이동`}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2.5 bg-blue-50 dark:bg-blue-900/30 rounded-lg shrink-0">
                <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-slate-900 dark:text-white truncate group-hover:text-primary dark:group-hover:text-blue-400 motion-reduce:transition-none transition-colors">
                  {venue.name}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {venue.address}
                </p>
              </div>
            </div>

            <dl className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              {venue.city && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                  <dt className="sr-only">지역</dt>
                  <dd>{venue.city}</dd>
                </div>
              )}
              {venue.capacity && (
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                  <dt className="sr-only">수용 인원</dt>
                  <dd className="tabular-nums">수용 {venue.capacity.toLocaleString()}명</dd>
                </div>
              )}
              {venue.rinkCount && (
                <div className="flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                  <dt className="sr-only">링크 수</dt>
                  <dd className="tabular-nums">링크 {venue.rinkCount}면</dd>
                </div>
              )}
              {venue.operatingHours && (
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                  <dt className="sr-only">운영 시간</dt>
                  <dd className="tabular-nums truncate">{venue.operatingHours}</dd>
                </div>
              )}
            </dl>

            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-sm font-semibold text-primary dark:text-blue-400">
              <span className="inline-flex items-center gap-2">
                <Calendar className="w-4 h-4" aria-hidden="true" />
                예약 현황 보기
              </span>
              <span aria-hidden="true" className="text-base">→</span>
            </div>
          </button>
        ))}

        {filteredVenues.length === 0 && (
          <div className="col-span-full text-center py-16 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <Building2 className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" aria-hidden="true" />
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
              등록된 구장이 없습니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
