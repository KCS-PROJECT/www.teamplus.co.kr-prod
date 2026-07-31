'use client';

/**
 * UGC 신고 관리 페이지 - TEAMPLUS Admin
 *
 * === 목적 (법적 요건) ===
 * 정보통신망법 §44조의2(정보의 삭제요청·임시조치) 및 앱마켓 UGC 심사(Apple 1.2 / Google Play UGC)는
 * "신고 접수 → 조치 → 기록"의 완결 루프를 요구한다. 접수(POST users/me/reports)와 관리자 API는
 * 이미 존재했으나 이를 열람·처리할 운영자 화면이 없어 신설한다.
 *
 * === 경로 선택 근거 ===
 * `/dashboard/reports` 는 이미 "리포트(운영 통계)" 화면으로 DashboardLayout 업무관리 그룹에 등록되어
 * 있어 의미가 충돌한다. 따라서 신고 관리는 `/dashboard/moderation/reports` 로 신설하고
 * 일반관리 그룹에 "신고관리" 메뉴를 추가했다.
 *
 * === Design 7 Principles 적용 ===
 * 1. 화면 분석: 미처리 신고 방치 여부를 즉시 인지 → 상세 확인 → 사유를 남기고 처리
 * 2. 휴먼 디자인: 미처리 경고 배너 → 상태 카운트 → 필터바 → 테이블 → 페이지네이션 → 상세/처리 모달
 *    (도입상담관리 `/dashboard/contact-inquiries` 패턴을 그대로 모사)
 * 3. AI 스타일 금지: gradient / backdrop-blur / 컬러 그림자 미사용 — 솔리드 컬러만
 * 4. Tone & Manner: 존댓말, 한국어 액션 라벨("저장하기/확인/취소")
 *
 * === 백엔드 API 제약으로 구현하지 않은 것 (추측으로 채우지 않음) ===
 * - 대상 유형(targetType) 필터 · 기간(from/to) 필터: `GET admin/reports` 가 status/category 만 지원.
 *   서버 페이지네이션 상태에서 클라이언트 필터를 섞으면 현재 페이지만 걸러진 잘못된 결과가 되므로 제외.
 * - "검토중(reviewing)" 전이: `PATCH admin/reports/:id` 가 resolved|rejected 만 받는다. 표시만 지원.
 * - "처리자" 컬럼: UserReport 모델에 resolvedBy 컬럼이 없다. 처리일시(resolvedAt)로 대체.
 */

import { useState, useEffect, useId, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  userReportService,
  type UserReportListItem,
  type UserReportPerson,
  type ReportCategory,
  type ReportStatus,
  type ReportResolveStatus,
} from '@/services/user-report.service';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { MiniStatsCard } from '@/components/ui/mini-stats-card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from '@/components/ui/modal';
import {
  ShieldAlert,
  Inbox,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  User,
  Mail,
  CalendarClock,
  MessageSquareText,
  FileText,
  Flag,
} from 'lucide-react';

// ==================== 상수/메타 ====================

const PAGE_SIZE = 20;

type StatusFilter = 'all' | ReportStatus;
type CategoryFilter = 'all' | ReportCategory;

/** 상태 메타 — pending 은 방치 인지를 위해 가장 강한 대비(빨강)로 노출 */
const STATUS_META: Record<ReportStatus, { label: string; badge: string }> = {
  pending: {
    label: '미처리',
    badge:
      'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-700',
  },
  reviewing: {
    label: '검토중',
    badge:
      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-700',
  },
  resolved: {
    label: '처리완료',
    badge:
      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700',
  },
  rejected: {
    label: '반려',
    badge:
      'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600',
  },
};

const UNKNOWN_BADGE =
  'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600';

/** 대상 유형 라벨 — schema.prisma UserReport.targetType 주석 5종 */
const TARGET_TYPE_LABEL: Record<string, string> = {
  user: '사용자',
  chat_message: '채팅 메시지',
  pickup_match: '픽업 매치',
  review: '리뷰',
  notice: '공지',
};

/** 신고 사유 라벨 — schema.prisma UserReport.category 주석 5종 */
const CATEGORY_LABEL: Record<string, string> = {
  spam: '스팸/광고',
  harassment: '괴롭힘/욕설',
  inappropriate: '부적절한 콘텐츠',
  fake_profile: '사칭/허위 프로필',
  other: '기타',
};

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'pending', label: '미처리' },
  { value: 'reviewing', label: '검토중' },
  { value: 'resolved', label: '처리완료' },
  { value: 'rejected', label: '반려' },
];

const CATEGORY_OPTIONS: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: '전체 사유' },
  { value: 'spam', label: '스팸/광고' },
  { value: 'harassment', label: '괴롭힘/욕설' },
  { value: 'inappropriate', label: '부적절한 콘텐츠' },
  { value: 'fake_profile', label: '사칭/허위 프로필' },
  { value: 'other', label: '기타' },
];

/** 처리 결과 옵션 — 백엔드 PATCH 가 받는 값만 노출 */
const RESOLVE_OPTIONS: { value: ReportResolveStatus; label: string }[] = [
  { value: 'resolved', label: '처리완료 (신고 인정 · 조치함)' },
  { value: 'rejected', label: '반려 (신고 사유 미해당)' },
];

/** 처리 사유 최소 길이 — 분쟁 대응 기록으로서 최소한의 서술을 강제 */
const ADMIN_NOTE_MIN = 5;
const ADMIN_NOTE_MAX = 2000;

const QUERY_KEY = ['admin-user-reports'] as const;

// ==================== 유틸 ====================

const statusMeta = (status: string) =>
  STATUS_META[status as ReportStatus] ?? { label: status, badge: UNKNOWN_BADGE };

const targetTypeLabel = (targetType: string) =>
  TARGET_TYPE_LABEL[targetType] ?? targetType;

const categoryLabel = (category: string) =>
  CATEGORY_LABEL[category] ?? category;

const personName = (person: UserReportPerson): string => {
  const name = `${person.lastName ?? ''}${person.firstName ?? ''}`.trim();
  return name || '-';
};

const formatDateTime = (iso: string | null): string => {
  if (!iso) return '-';
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

/** 처리 완료된 신고인지 (재처리 불가 — 백엔드가 400 으로 거부) */
const isClosed = (status: string) =>
  status === 'resolved' || status === 'rejected';

// ==================== 페이지 ====================

export default function ModerationReportsPage() {
  const queryClient = useQueryClient();
  const categorySelectId = useId();
  const resolveStatusId = useId();
  const adminNoteId = useId();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [page, setPage] = useState(1);

  /** 상세 모달 대상 id (목록 행에서 선택) */
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /** 처리 폼 */
  const [resolveStatus, setResolveStatus] =
    useState<ReportResolveStatus>('resolved');
  const [adminNote, setAdminNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);

  const [actionMsg, setActionMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const flash = (type: 'success' | 'error', text: string) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg(null), 3000);
  };

  // 필터 변경 시 첫 페이지로
  useEffect(() => {
    setPage(1);
  }, [statusFilter, categoryFilter]);

  // ---------- 조회 ----------
  const statsQuery = useQuery({
    queryKey: [...QUERY_KEY, 'stats'],
    queryFn: () => userReportService.getStats(),
    staleTime: 30_000,
  });

  const listParams = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      status: statusFilter === 'all' ? undefined : statusFilter,
      category: categoryFilter === 'all' ? undefined : categoryFilter,
    }),
    [page, statusFilter, categoryFilter],
  );

  const listQuery = useQuery({
    queryKey: [...QUERY_KEY, 'list', listParams],
    queryFn: () => userReportService.list(listParams),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  const detailQuery = useQuery({
    queryKey: [...QUERY_KEY, 'detail', selectedId],
    queryFn: () => userReportService.get(selectedId as string),
    enabled: !!selectedId,
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, listQuery.data?.totalPages ?? 1);
  const stats = statsQuery.data;
  const detail = detailQuery.data;

  // 상세 로드 시 처리 폼 초기화 (이미 처리된 건은 기존 사유를 그대로 보여줌)
  useEffect(() => {
    if (!detail) return;
    setResolveStatus(
      detail.status === 'rejected' ? 'rejected' : 'resolved',
    );
    setAdminNote(detail.adminNote ?? '');
    setNoteError(null);
  }, [detail]);

  // ---------- 처리 ----------
  const resolveMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { status: ReportResolveStatus; adminNote: string };
    }) => userReportService.resolve(id, data),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setSelectedId(null);
      flash(
        'success',
        variables.data.status === 'resolved'
          ? '신고를 처리완료로 저장했습니다.'
          : '신고를 반려로 저장했습니다.',
      );
    },
    onError: (error: unknown) => {
      flash(
        'error',
        error instanceof Error ? error.message : '처리 중 오류가 발생했습니다.',
      );
    },
  });

  const handleResolve = () => {
    if (!detail) return;
    const note = adminNote.trim();
    // 처리 사유 필수 — 거절/처리 모두 기록이 없으면 분쟁 대응이 불가하다.
    if (note.length < ADMIN_NOTE_MIN) {
      setNoteError(`처리 사유를 ${ADMIN_NOTE_MIN}자 이상 입력해주세요.`);
      return;
    }
    setNoteError(null);
    resolveMutation.mutate({
      id: detail.id,
      data: { status: resolveStatus, adminNote: note },
    });
  };

  const closeDetail = () => {
    setSelectedId(null);
    setNoteError(null);
  };

  const isFirstLoading = listQuery.isLoading && !listQuery.data;
  const pendingCount = stats?.pending ?? 0;
  const openCount = pendingCount + (stats?.reviewing ?? 0);

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
        title="신고관리"
        subtitle="사용자가 접수한 신고를 확인하고 처리 사유와 함께 조치합니다"
      />

      {/* 미처리 경고 — 운영자가 방치 여부를 즉시 인지 */}
      {pendingCount > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-3 p-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20"
        >
          <ShieldAlert
            className="w-5 h-5 mt-0.5 text-red-600 dark:text-red-400 shrink-0"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              미처리 신고 {pendingCount.toLocaleString()}건이 대기 중입니다.
            </p>
            <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">
              신고는 접수 후 지체 없이 확인·조치해야 합니다. 처리 사유를 남기면 분쟁 발생 시 근거로 사용됩니다.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setStatusFilter('pending')}
            className="ml-auto h-9 shrink-0 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40"
          >
            미처리만 보기
          </Button>
        </div>
      )}

      {/* 상태별 카운트 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <MiniStatsCard
          title="전체 신고"
          value={stats?.total ?? 0}
          icon={<Inbox className="w-5 h-5" />}
          variant="neutral"
        />
        <MiniStatsCard
          title="미처리"
          value={pendingCount}
          description={openCount > 0 ? `미완료 ${openCount.toLocaleString()}건` : undefined}
          icon={<ShieldAlert className="w-5 h-5" />}
          variant="primary"
        />
        <MiniStatsCard
          title="검토중"
          value={stats?.reviewing ?? 0}
          icon={<Clock className="w-5 h-5" />}
          variant="warning"
        />
        <MiniStatsCard
          title="처리완료"
          value={stats?.resolved ?? 0}
          icon={<CheckCircle2 className="w-5 h-5" />}
          variant="success"
        />
        <MiniStatsCard
          title="반려"
          value={stats?.rejected ?? 0}
          icon={<XCircle className="w-5 h-5" />}
          variant="neutral"
        />
      </div>

      {/* 필터바 — 백엔드 GET admin/reports 가 지원하는 status/category 만 제공 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="w-full sm:w-auto">
          <label htmlFor={categorySelectId} className="sr-only">
            신고 사유 필터
          </label>
          <select
            id={categorySelectId}
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(e.target.value as CategoryFilter)
            }
            className="w-full sm:w-56 h-11 px-3 border border-slate-200 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div
          className="flex gap-1 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg flex-wrap"
          role="tablist"
          aria-label="신고 상태 필터"
        >
          {STATUS_TABS.map((tab) => (
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
        <LoadingSpinner message="신고 목록을 불러오는 중..." />
      ) : listQuery.isError ? (
        <Card className="p-12 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 dark:text-red-500 mx-auto mb-3" />
          <p className="text-slate-600 dark:text-slate-300 mb-4">
            신고 목록을 불러오지 못했습니다.
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
          <Flag className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400">
            {statusFilter !== 'all' || categoryFilter !== 'all'
              ? '조건에 맞는 신고가 없습니다.'
              : '접수된 신고가 없습니다.'}
          </p>
        </Card>
      ) : (
        <Card className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-slate-500 dark:text-slate-400">
                  <th scope="col" className="px-4 py-3 font-medium">신고 일시</th>
                  <th scope="col" className="px-4 py-3 font-medium">신고자</th>
                  <th scope="col" className="px-4 py-3 font-medium hidden sm:table-cell">피신고자</th>
                  <th scope="col" className="px-4 py-3 font-medium hidden md:table-cell">대상 유형</th>
                  <th scope="col" className="px-4 py-3 font-medium">신고 사유</th>
                  <th scope="col" className="px-4 py-3 font-medium">상태</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">관리</th>
                </tr>
              </thead>
              <tbody>
                {items.map((report: UserReportListItem) => {
                  const meta = statusMeta(report.status);
                  const pending = report.status === 'pending';
                  return (
                    <tr
                      key={report.id}
                      className={`border-b border-slate-100 dark:border-slate-700/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors motion-reduce:transition-none cursor-pointer ${
                        pending ? 'bg-red-50/40 dark:bg-red-900/10' : ''
                      }`}
                      onClick={() => setSelectedId(report.id)}
                    >
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatDateTime(report.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(report.id);
                          }}
                          className="font-medium text-slate-900 dark:text-white hover:text-primary transition-colors motion-reduce:transition-none text-left"
                        >
                          {report.reporter?.name || '-'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300 hidden sm:table-cell">
                        {report.reported?.name || '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 hidden md:table-cell">
                        {targetTypeLabel(report.targetType)}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                        {categoryLabel(report.category)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium ${meta.badge}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(report.id);
                          }}
                          className="min-h-[36px] px-3 inline-flex items-center justify-center rounded-lg text-sm font-medium text-primary hover:bg-primary/5 dark:hover:bg-primary/20 transition-colors motion-reduce:transition-none"
                        >
                          {isClosed(report.status) ? '내역 보기' : '처리하기'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-slate-200 dark:border-slate-700">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              총 {total.toLocaleString()}건 중{' '}
              {(total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1).toLocaleString()}-
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

      {/* 상세 + 처리 모달 */}
      <Modal isOpen={!!selectedId} onClose={closeDetail} size="lg" showCloseButton>
        <>
          <ModalHeader
            title="신고 상세"
            description={
              detail
                ? `${targetTypeLabel(detail.targetType)} · ${categoryLabel(detail.category)}`
                : '신고 정보를 불러오는 중입니다'
            }
          />
          <ModalBody scrollable maxHeight="60vh">
            {detailQuery.isLoading ? (
              <LoadingSpinner message="신고 상세를 불러오는 중..." />
            ) : detailQuery.isError || !detail ? (
              <div className="py-10 text-center">
                <AlertTriangle className="w-10 h-10 text-red-400 dark:text-red-500 mx-auto mb-3" />
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  신고 상세를 불러오지 못했습니다.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => detailQuery.refetch()}
                  className="gap-2 h-11 border-slate-200 dark:border-slate-600"
                >
                  <RefreshCw className="w-4 h-4" aria-hidden="true" />
                  다시 시도
                </Button>
              </div>
            ) : (
              <div className="space-y-5">
                {/* 상태 요약 */}
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium ${statusMeta(detail.status).badge}`}
                  >
                    {statusMeta(detail.status).label}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    신고 접수 {formatDateTime(detail.createdAt)}
                  </span>
                  {detail.resolvedAt && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      · 처리 {formatDateTime(detail.resolvedAt)}
                    </span>
                  )}
                </div>

                {/* 신고자 / 피신고자 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <PersonCard
                    title="신고자"
                    person={detail.reporter}
                    tone="neutral"
                  />
                  <PersonCard
                    title="피신고자"
                    person={detail.reported}
                    tone="danger"
                  />
                </div>

                {/* 대상 콘텐츠 정보 */}
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                  <InfoRow
                    icon={FileText}
                    label="대상 유형"
                    value={targetTypeLabel(detail.targetType)}
                  />
                  <InfoRow
                    icon={Flag}
                    label="신고 사유"
                    value={categoryLabel(detail.category)}
                  />
                  <InfoRow
                    icon={MessageSquareText}
                    label="대상 콘텐츠 ID"
                    value={detail.targetId ?? '해당 없음 (사용자 신고)'}
                  />
                  <InfoRow
                    icon={CalendarClock}
                    label="최근 변경"
                    value={formatDateTime(detail.updatedAt)}
                  />
                </dl>

                {/* 신고 내용 전문 */}
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    <MessageSquareText
                      className="w-4 h-4 text-slate-400"
                      aria-hidden="true"
                    />
                    신고 내용
                  </p>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-slate-600">
                    <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 min-h-[1.5rem]">
                      {detail.description?.trim() || '신고자가 입력한 상세 내용이 없습니다.'}
                    </p>
                  </div>
                </div>

                <div className="border-t border-slate-200 dark:border-slate-700" />

                {/* 처리 영역 */}
                {isClosed(detail.status) ? (
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      처리 사유
                    </p>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-slate-600">
                      <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 min-h-[1.5rem]">
                        {detail.adminNote?.trim() || '기록된 처리 사유가 없습니다.'}
                      </p>
                    </div>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      이미 처리된 신고는 상태를 다시 변경할 수 없습니다.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label
                        htmlFor={resolveStatusId}
                        className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                      >
                        처리 결과
                      </label>
                      <select
                        id={resolveStatusId}
                        value={resolveStatus}
                        onChange={(e) =>
                          setResolveStatus(e.target.value as ReportResolveStatus)
                        }
                        className="w-full h-11 px-3 border border-slate-200 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                      >
                        {RESOLVE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor={adminNoteId}
                        className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                      >
                        처리 사유{' '}
                        <span className="text-red-600 dark:text-red-400" aria-hidden="true">
                          *
                        </span>
                        <span className="sr-only">필수</span>
                      </label>
                      <textarea
                        id={adminNoteId}
                        value={adminNote}
                        onChange={(e) => {
                          setAdminNote(e.target.value);
                          if (noteError) setNoteError(null);
                        }}
                        required
                        aria-required="true"
                        aria-invalid={!!noteError}
                        aria-describedby={noteError ? `${adminNoteId}-error` : undefined}
                        placeholder="어떤 사실을 확인했고 어떤 조치를 했는지 구체적으로 입력해주세요. (예: 채팅 메시지 삭제 및 작성자 7일 이용정지)"
                        rows={4}
                        maxLength={ADMIN_NOTE_MAX}
                        className={`w-full px-3 py-2 min-h-[100px] border rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm resize-y leading-relaxed ${
                          noteError
                            ? 'border-red-400 dark:border-red-600'
                            : 'border-slate-200 dark:border-slate-600'
                        }`}
                      />
                      <div className="mt-1 flex items-start justify-between gap-3">
                        <p
                          id={`${adminNoteId}-error`}
                          role={noteError ? 'alert' : undefined}
                          className={`text-xs ${
                            noteError
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {noteError ??
                            '처리 사유는 분쟁 발생 시 근거 자료가 되므로 반드시 입력해야 합니다.'}
                        </p>
                        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                          {adminNote.trim().length} / {ADMIN_NOTE_MAX.toLocaleString()}자
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeDetail}
              disabled={resolveMutation.isPending}
              className="h-11 border-slate-200 dark:border-slate-600"
            >
              {detail && isClosed(detail.status) ? '확인' : '취소'}
            </Button>
            {detail && !isClosed(detail.status) && (
              <Button
                type="button"
                onClick={handleResolve}
                disabled={resolveMutation.isPending}
                className="h-11 bg-primary hover:bg-primary-dark text-white"
              >
                {resolveMutation.isPending ? '저장 중...' : '저장하기'}
              </Button>
            )}
          </ModalFooter>
        </>
      </Modal>
    </div>
  );
}

// ==================== 보조 컴포넌트 ====================

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileText;
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

function PersonCard({
  title,
  person,
  tone,
}: {
  title: string;
  person: UserReportPerson;
  tone: 'neutral' | 'danger';
}) {
  const border =
    tone === 'danger'
      ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
      : 'border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/40';

  return (
    <div className={`p-3 rounded-lg border ${border}`}>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
        {title}
      </p>
      <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white break-words">
        <User className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
        {personName(person)}
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 break-all">
        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
        {person.email || '-'}
      </p>
      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 break-all">
        ID {person.id}
      </p>
    </div>
  );
}
