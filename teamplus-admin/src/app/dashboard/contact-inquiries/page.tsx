'use client';

/**
 * 도입 상담 신청 관리 페이지 - TEAMPLUS Admin
 *
 * === Design 7 Principles 적용 ===
 * 1. 화면 분석: 랜딩(home) 폼으로 접수된 도입 문의를 운영자가 처리(상태/메모) + soft delete
 * 2. 휴먼 디자인: 상단 상태 카운트 → 필터바 → 테이블 → 페이지네이션 → 상세 모달 (기존 dashboard 패턴 재사용)
 * 3. AI 스타일 금지: gradient, blur, 컬러 그림자 미사용 — 솔리드 컬러만
 * 4. 페르소나 융합: frontend(접근성/상태처리) + architect(TanStack Query 캐시)
 * 5. Tone & Manner: 존댓말, 한국어 액션 동사("저장하기/삭제하기/확인/취소")
 *
 * 데이터: TanStack Query (루트 QueryProvider 글로벌 사용) — useQuery(목록+stats) + useMutation(update/delete).
 * 서비스/타입: contact-inquiry.service.ts (SPEC §3 응답과 1:1).
 */

import { useState, useEffect, useId } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  contactInquiryService,
  type ContactInquiry,
  type ContactInquiryStatus,
} from '@/services/contact-inquiry.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { MiniStatsCard } from '@/components/ui/mini-stats-card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ConfirmModal,
} from '@/components/ui/modal';
import {
  Inbox,
  Sparkles,
  Clock,
  CheckCircle2,
  Archive,
  Search,
  RefreshCw,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Building2,
  User,
  Mail,
  Phone,
  CalendarClock,
  MessageSquareText,
  AlertTriangle,
} from 'lucide-react';

// ==================== 상수/메타 ====================

const PAGE_SIZE = 20;

type StatusFilter = 'all' | ContactInquiryStatus;

const STATUS_META: Record<
  ContactInquiryStatus,
  { label: string; badge: string }
> = {
  NEW: {
    label: '신규',
    badge:
      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-700',
  },
  IN_PROGRESS: {
    label: '처리중',
    badge:
      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-700',
  },
  DONE: {
    label: '완료',
    badge:
      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700',
  },
  ARCHIVED: {
    label: '보관',
    badge:
      'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600',
  },
};

const STATUS_OPTIONS: ContactInquiryStatus[] = [
  'NEW',
  'IN_PROGRESS',
  'DONE',
  'ARCHIVED',
];

const FILTER_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'NEW', label: '신규' },
  { value: 'IN_PROGRESS', label: '처리중' },
  { value: 'DONE', label: '완료' },
  { value: 'ARCHIVED', label: '보관' },
];

const PLAN_LABEL: Record<string, string> = {
  starter: '스타터',
  business: '비즈니스',
  enterprise: '엔터프라이즈',
  undecided: '미정',
};

const planLabel = (plan: string | null): string =>
  plan ? (PLAN_LABEL[plan] ?? plan) : '-';

const formatDateTime = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const QUERY_KEY = ['contact-inquiries'] as const;

// ==================== 페이지 ====================

export default function ContactInquiriesPage() {
  const queryClient = useQueryClient();
  const searchInputId = useId();
  const statusSelectId = useId();
  const adminMemoId = useId();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // 상세/수정 모달
  const [detail, setDetail] = useState<ContactInquiry | null>(null);
  const [editStatus, setEditStatus] = useState<ContactInquiryStatus>('NEW');
  const [editMemo, setEditMemo] = useState('');

  // 삭제 확인
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 액션 배너 (성공/실패)
  const [actionMsg, setActionMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const flash = (type: 'success' | 'error', text: string) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg(null), 3000);
  };

  // 검색어 디바운스 (400ms) → search 반영 시 1페이지로
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // 필터/검색 변경 시 첫 페이지로
  useEffect(() => {
    setPage(1);
  }, [statusFilter, search]);

  // ---------- 조회 ----------
  const statsQuery = useQuery({
    queryKey: [...QUERY_KEY, 'stats'],
    queryFn: () => contactInquiryService.getStats(),
    staleTime: 30_000,
  });

  const listParams = {
    page,
    pageSize: PAGE_SIZE,
    status: statusFilter === 'all' ? undefined : statusFilter,
    search: search || undefined,
  };

  const listQuery = useQuery({
    queryKey: [...QUERY_KEY, 'list', listParams],
    queryFn: () => contactInquiryService.list(listParams),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const stats = statsQuery.data;

  // ---------- 변경 ----------
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { status?: ContactInquiryStatus; adminMemo?: string };
    }) => contactInquiryService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setDetail(null);
      flash('success', '상담 신청 정보가 저장되었습니다.');
    },
    onError: (error: unknown) => {
      flash(
        'error',
        error instanceof Error
          ? error.message
          : '저장 중 오류가 발생했습니다.',
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => contactInquiryService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setDeletingId(null);
      setDetail(null);
      flash('success', '상담 신청이 삭제되었습니다.');
    },
    onError: (error: unknown) => {
      setDeletingId(null);
      flash(
        'error',
        error instanceof Error
          ? error.message
          : '삭제 중 오류가 발생했습니다.',
      );
    },
  });

  // ---------- 핸들러 ----------
  const openDetail = (inquiry: ContactInquiry) => {
    setDetail(inquiry);
    setEditStatus(inquiry.status);
    setEditMemo(inquiry.adminMemo ?? '');
  };

  const handleSave = () => {
    if (!detail) return;
    updateMutation.mutate({
      id: detail.id,
      data: { status: editStatus, adminMemo: editMemo.trim() },
    });
  };

  const isFirstLoading = listQuery.isLoading && !listQuery.data;

  // ==================== 렌더 ====================
  return (
    <div className="space-y-6">
      {/* 액션 배너 */}
      {actionMsg && (
        <div
          role="status"
          aria-live="polite"
          className={`p-3 rounded-lg text-sm ${
            actionMsg.type === 'success'
              ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
              : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
          }`}
        >
          {actionMsg.text}
        </div>
      )}

      <PageHeader
        title="도입 상담 신청"
        subtitle={`전체 ${(stats?.total ?? total).toLocaleString()}건의 상담 신청`}
      />

      {/* 상태별 카운트 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <MiniStatsCard
          title="전체"
          value={stats?.total ?? 0}
          icon={<Inbox className="w-5 h-5" />}
          variant="neutral"
        />
        <MiniStatsCard
          title="신규"
          value={stats?.NEW ?? 0}
          icon={<Sparkles className="w-5 h-5" />}
          variant="info"
        />
        <MiniStatsCard
          title="처리중"
          value={stats?.IN_PROGRESS ?? 0}
          icon={<Clock className="w-5 h-5" />}
          variant="warning"
        />
        <MiniStatsCard
          title="완료"
          value={stats?.DONE ?? 0}
          icon={<CheckCircle2 className="w-5 h-5" />}
          variant="success"
        />
        <MiniStatsCard
          title="보관"
          value={stats?.ARCHIVED ?? 0}
          icon={<Archive className="w-5 h-5" />}
          variant="neutral"
        />
      </div>

      {/* 필터바 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex-1 relative w-full sm:max-w-md">
          <label htmlFor={searchInputId} className="sr-only">
            상담 신청 검색
          </label>
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400"
            aria-hidden="true"
          />
          <Input
            id={searchInputId}
            placeholder="조직명, 담당자, 이메일, 연락처로 검색해주세요"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="상담 신청 검색 (조직명, 담당자, 이메일, 연락처)"
            className="pl-10 h-11 bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600"
          />
        </div>
        <div
          className="flex gap-1 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg flex-wrap"
          role="tablist"
          aria-label="상담 신청 상태 필터"
        >
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={statusFilter === tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`min-h-[36px] px-3 py-1.5 text-sm font-medium rounded-md transition-colors motion-reduce:transition-none ${
                statusFilter === tab.value
                  ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 본문: 로딩 / 에러 / 빈 / 테이블 */}
      {isFirstLoading ? (
        <LoadingSpinner message="상담 신청을 불러오는 중..." />
      ) : listQuery.isError ? (
        <Card className="p-12 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 dark:text-red-500 mx-auto mb-3" />
          <p className="text-slate-600 dark:text-slate-300 mb-4">
            상담 신청 목록을 불러오지 못했습니다.
          </p>
          <Button
            type="button"
            onClick={() => listQuery.refetch()}
            variant="outline"
            className="gap-2 h-11 border-slate-200 dark:border-slate-600"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            다시 시도
          </Button>
        </Card>
      ) : items.length === 0 ? (
        <Card className="p-12 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center">
          <Inbox className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400">
            {search || statusFilter !== 'all'
              ? '검색 결과가 없습니다.'
              : '접수된 상담 신청이 없습니다.'}
          </p>
        </Card>
      ) : (
        <Card className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-slate-500 dark:text-slate-400">
                  <th scope="col" className="px-4 py-3 font-medium">담당자</th>
                  <th scope="col" className="px-4 py-3 font-medium">조직</th>
                  <th scope="col" className="px-4 py-3 font-medium hidden md:table-cell">플랜</th>
                  <th scope="col" className="px-4 py-3 font-medium hidden md:table-cell">규모</th>
                  <th scope="col" className="px-4 py-3 font-medium hidden lg:table-cell">연락처</th>
                  <th scope="col" className="px-4 py-3 font-medium">상태</th>
                  <th scope="col" className="px-4 py-3 font-medium hidden sm:table-cell">접수일</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">관리</th>
                </tr>
              </thead>
              <tbody>
                {items.map((inquiry) => (
                  <tr
                    key={inquiry.id}
                    className="border-b border-slate-100 dark:border-slate-700/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors motion-reduce:transition-none cursor-pointer"
                    onClick={() => openDetail(inquiry)}
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDetail(inquiry);
                        }}
                        className="font-medium text-slate-900 dark:text-white hover:text-primary transition-colors motion-reduce:transition-none text-left"
                      >
                        {inquiry.managerName}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      {inquiry.organizationName}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 hidden md:table-cell">
                      {planLabel(inquiry.interestedPlan)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 hidden md:table-cell">
                      {inquiry.clubSize ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 hidden lg:table-cell tabular-nums">
                      {inquiry.phone}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium ${STATUS_META[inquiry.status].badge}`}
                      >
                        {STATUS_META[inquiry.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 hidden sm:table-cell whitespace-nowrap">
                      {formatDateTime(inquiry.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingId(inquiry.id);
                          }}
                          className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors motion-reduce:transition-none"
                          title="삭제"
                          aria-label={`${inquiry.managerName} 상담 신청 삭제`}
                        >
                          <Trash2
                            className="w-4 h-4 text-red-600 dark:text-red-400"
                            aria-hidden="true"
                          />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-slate-200 dark:border-slate-700">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              총 {total.toLocaleString()}건 중 {(total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1).toLocaleString()}-
              {Math.min(page * PAGE_SIZE, total).toLocaleString()}건
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || listQuery.isFetching}
                aria-label="이전 페이지"
                className={`min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg transition-colors motion-reduce:transition-none ${
                  page <= 1
                    ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>
              <span className="min-w-[80px] text-center text-sm text-slate-600 dark:text-slate-400 tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || listQuery.isFetching}
                aria-label="다음 페이지"
                className={`min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg transition-colors motion-reduce:transition-none ${
                  page >= totalPages
                    ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* 상세/수정 모달 */}
      <Modal
        isOpen={!!detail}
        onClose={() => setDetail(null)}
        size="lg"
        showCloseButton
      >
        {detail && (
          <>
            <ModalHeader
              title="상담 신청 상세"
              description={`${detail.organizationName} · ${detail.managerName}`}
            />
            <ModalBody scrollable maxHeight="60vh">
              <div className="space-y-5">
                {/* 신청 정보 */}
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                  <InfoRow icon={Building2} label="조직/단체명" value={detail.organizationName} />
                  <InfoRow icon={User} label="담당자" value={detail.managerName} />
                  <InfoRow icon={Mail} label="이메일" value={detail.email} />
                  <InfoRow icon={Phone} label="연락처" value={detail.phone} />
                  <InfoRow icon={Sparkles} label="관심 플랜" value={planLabel(detail.interestedPlan)} />
                  <InfoRow icon={Inbox} label="클럽 규모" value={detail.clubSize ?? '-'} />
                  <InfoRow icon={CalendarClock} label="접수일" value={formatDateTime(detail.createdAt)} />
                  <InfoRow
                    icon={CheckCircle2}
                    label="개인정보 동의"
                    value={detail.privacyAgreed ? '동의함' : '미동의'}
                  />
                </dl>

                {/* 문의 내용 */}
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    <MessageSquareText className="w-4 h-4 text-slate-400" aria-hidden="true" />
                    문의 내용
                  </p>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-slate-600">
                    <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 min-h-[1.5rem]">
                      {detail.message?.trim() || '문의 내용이 없습니다.'}
                    </p>
                  </div>
                </div>

                <div className="border-t border-slate-200 dark:border-slate-700" />

                {/* 상태 변경 */}
                <div>
                  <label
                    htmlFor={statusSelectId}
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    처리 상태
                  </label>
                  <select
                    id={statusSelectId}
                    value={editStatus}
                    onChange={(e) =>
                      setEditStatus(e.target.value as ContactInquiryStatus)
                    }
                    className="w-full h-11 px-3 border border-slate-200 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_META[s].label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 관리자 메모 */}
                <div>
                  <label
                    htmlFor={adminMemoId}
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    관리자 메모
                  </label>
                  <textarea
                    id={adminMemoId}
                    value={editMemo}
                    onChange={(e) => setEditMemo(e.target.value)}
                    placeholder="처리 내용/메모를 입력해주세요 (최대 2,000자)"
                    rows={4}
                    maxLength={2000}
                    className="w-full px-3 py-2 min-h-[100px] border border-slate-200 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm resize-y leading-relaxed"
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 text-right tabular-nums">
                    {editMemo.trim().length} / 2,000자
                  </p>
                </div>
              </div>
            </ModalBody>
            <ModalFooter className="justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeletingId(detail.id)}
                disabled={updateMutation.isPending}
                className="h-11 gap-1.5 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                삭제하기
              </Button>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDetail(null)}
                  disabled={updateMutation.isPending}
                  className="h-11 border-slate-200 dark:border-slate-600"
                >
                  취소
                </Button>
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="h-11 bg-primary hover:bg-primary-dark text-white"
                >
                  {updateMutation.isPending ? '저장 중...' : '저장하기'}
                </Button>
              </div>
            </ModalFooter>
          </>
        )}
      </Modal>

      {/* 삭제 확인 */}
      <ConfirmModal
        isOpen={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={() => deletingId && deleteMutation.mutate(deletingId)}
        title="상담 신청을 삭제하시겠습니까?"
        description="삭제하면 목록에서 제외됩니다. 이 작업은 되돌릴 수 없습니다."
        variant="danger"
        confirmText="삭제하기"
        cancelText="취소"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

// ==================== 보조 컴포넌트 ====================

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon
        className="w-4 h-4 mt-0.5 text-slate-400 dark:text-slate-500 shrink-0"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
        <dd className="text-sm text-slate-900 dark:text-white break-words">
          {value}
        </dd>
      </div>
    </div>
  );
}
