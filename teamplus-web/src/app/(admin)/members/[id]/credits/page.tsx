'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { useParams } from 'next/navigation';
import { useNavigation } from '@/components/ui/NavLink';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/services/api-client';
import { useToast } from '@/components/ui/Toast';
import { MESSAGES } from '@/lib/messages';
import { useNativeUI } from '@/hooks/useNativeUI';

import { usePageReady } from '@/hooks/usePageReady';
interface MemberInfo {
  id: string;
  name: string;
  role: string;
  childName: string;
  childAge: number;
  phone: string;
  className: string;
  classSchedule: string;
  paymentAmount: string;
  paymentDate: string;
  paymentStatus: 'completed' | 'pending' | 'failed';
  image: string;
}

interface HistoryItem {
  id: string;
  stage: string;
  isCurrent: boolean;
  timestamp: string;
  actor: string;
  note?: string;
}

const PAYMENT_STATUS_MAP: Record<
  MemberInfo['paymentStatus'],
  { label: string; className: string; icon: string }
> = {
  completed: {
    label: '결제 완료',
    className:
      'border-blue-200 bg-blue-50 text-ice-500 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    icon: 'check_circle',
  },
  pending: {
    label: '결제 대기',
    className:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    icon: 'schedule',
  },
  failed: {
    label: '결제 실패',
    className:
      'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300',
    icon: 'error',
  },
};

export default function MemberCreditsPage() {
  const params = useParams();
  const { back } = useNavigation();
  const { toast } = useToast();
  const memberId = params?.id as string | undefined;
  const memoId = useId();
  const [memo, setMemo] = useState('');
  const [memberInfo, setMemberInfo] = useState<MemberInfo | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  // appbar-harness-v3 (admin-agent · 2026-05-12) — 분류 C 통일:
  //   이전 inline sticky 헤더(← / 타이틀 / ⋮)를 제거하고 PageAppBar(variant='detail',
  //   forceNative=true) 로 통일. 네이티브 AppBar 는 숨기되 PageAppBar 가 WebView/Web
  //   모두에서 일관된 60px 헤더(SoT)를 렌더한다. status bar 영역은 반드시 노출.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
  });
  const [isSavingMemo, setIsSavingMemo] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'approve' | 'reject' | null>(null);

  const loadMemberInfo = useCallback(async () => {
    if (!memberId) return;
    setIsLoading(true);
    try {
      const res = await api.get<{ member: MemberInfo; history: HistoryItem[] }>(`/admin/users/${memberId}`);
      if (res.data) {
        setMemberInfo(res.data.member ?? null);
        setHistory(res.data.history ?? []);
      }
    } catch {
      setMemberInfo(null);
    } finally {
      setIsLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    void loadMemberInfo();
  }, [loadMemberInfo]);

  const handleSaveMemo = async () => {
    if (!memberId) return;
    setIsSavingMemo(true);
    try {
      const response = await api.patch(`/credits/${memberId}/memo`, { memo });
      if (response.success) {
        toast.success(MESSAGES.save.success);
      } else {
        toast.error(response.error?.message ?? MESSAGES.save.error);
      }
    } catch {
      toast.error(MESSAGES.save.error);
    } finally {
      setIsSavingMemo(false);
    }
  };

  const confirmApprove = async () => {
    if (!memberId) return;
    try {
      const response = await api.post(`/credits/${memberId}/approve`);
      if (response.success) {
        toast.success(MESSAGES.approval.approved);
        back();
      } else {
        toast.error(response.error?.message ?? MESSAGES.error.general);
      }
    } catch {
      toast.error(MESSAGES.error.general);
    } finally {
      setConfirmAction(null);
    }
  };

  const confirmReject = async () => {
    if (!memberId) return;
    try {
      const response = await api.post(`/credits/${memberId}/reject`);
      if (response.success) {
        toast.success(MESSAGES.approval.rejected);
        back();
      } else {
        toast.error(response.error?.message ?? MESSAGES.error.general);
      }
    } catch {
      toast.error(MESSAGES.error.general);
    } finally {
      setConfirmAction(null);
    }
  };

  if (!memberId) {
    return (
      <MobileContainer hasBottomNav={false}>
        <main className="flex-1 flex items-center justify-center">
          <p className="text-card-body text-wtext-3 dark:text-rink-300">
            회원 정보를 찾을 수 없습니다.
          </p>
        </main>
      </MobileContainer>
    );
  }

  if (isLoading) {
    return null;
  }

  if (!memberInfo) {
    return (
      <MobileContainer hasBottomNav={false}>
        <main className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-w-pill bg-wline-2 dark:bg-rink-800">
            <Icon name="person_off" className="text-3xl text-wtext-3" aria-hidden="true" />
          </div>
          <p className="text-card-body font-semibold text-wtext-2 dark:text-rink-100">
            회원 정보를 찾을 수 없습니다.
          </p>
        </main>
      </MobileContainer>
    );
  }

  const statusBadge = PAYMENT_STATUS_MAP[memberInfo.paymentStatus];

  return (
    <MobileContainer hasBottomNav={false}>
      {/* appbar-harness-v4 (admin-agent · 2026-05-12) — 분류 C→A 변환:
          v3 의 rightActions[more_vert] (coming-soon placeholder) 가 시계/종/메뉴
          3 액션을 대체하던 문제를 v4 통일성 요구사항에 맞춰 제거.
          PageAppBar variant='detail' SoT — 우측 3 액션(시계/종/메뉴) 자동 노출.
          forceNative=true 로 WebView 에서도 웹 헤더 렌더 보장. 상세 작업 메뉴(more_vert)
          기능은 향후 본문 액션 시트 또는 extraActions 로 별도 구현 예정. */}
      <PageAppBar
        variant="detail"
        title="수업 신청 상세"
        forceNative
        onBack={back}
      />

      <main className="flex-1 overflow-y-auto bg-wbg dark:bg-rink-900 pb-28 hide-scrollbar">
        <div className="w-full max-w-md mx-auto flex flex-col gap-4 p-4">
          {/* ─── Member Info Card ─────────────────────── */}
          <section
            className="rounded-2xl border border-wline-2 dark:border-rink-700 bg-white dark:bg-rink-800 p-5 shadow-sm"
            aria-labelledby="applicant-info"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 gap-3">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-w-pill border border-wline dark:border-rink-700 bg-wline-2 dark:bg-rink-700">
                  {memberInfo.image ? (
                    <div
                      className="h-full w-full bg-cover bg-center"
                      style={{ backgroundImage: `url(${memberInfo.image})` }}
                      aria-hidden="true"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Icon name="person" className="text-2xl text-wtext-3" aria-hidden="true" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h2
                    id="applicant-info"
                    className="flex flex-wrap items-center gap-2 text-card-title font-bold text-wtext-1 dark:text-white"
                  >
                    <span className="truncate">{memberInfo.name}</span>
                    <span className="rounded-w-pill bg-wline-2 dark:bg-rink-700 px-2 py-0.5 text-[11px] font-semibold text-wtext-2 dark:text-rink-100">
                      {memberInfo.role}
                    </span>
                  </h2>
                  <div className="mt-1 flex items-center gap-1 text-card-body text-wtext-3 dark:text-rink-300">
                    <Icon name="child_care" className="text-[16px]" aria-hidden="true" />
                    <span className="truncate">
                      자녀: {memberInfo.childName}
                      <span className="tabular-nums"> ({memberInfo.childAge}세)</span>
                    </span>
                  </div>
                </div>
              </div>
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1 text-card-meta font-bold ${statusBadge.className}`}
              >
                <Icon name={statusBadge.icon} className="text-[14px]" aria-hidden="true" />
                {statusBadge.label}
              </span>
            </div>

            <div className="my-4 border-t border-wline-2 dark:border-rink-700" />

            <dl className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-card-body text-wtext-3 dark:text-rink-300">연락처</dt>
                <dd>
                  <a
                    href={`tel:${memberInfo.phone}`}
                    className="inline-flex min-h-[32px] items-center gap-1 rounded-md text-card-body font-medium text-wtext-1 dark:text-white hover:text-ice-500 transition-colors motion-reduce:transition-none tabular-nums"
                  >
                    {memberInfo.phone}
                    <Icon name="call" className="text-[14px] text-wtext-3" aria-hidden="true" />
                  </a>
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-card-body text-wtext-3 dark:text-rink-300 shrink-0 pt-0.5">
                  신청 수업
                </dt>
                <dd className="text-right">
                  <p className="text-card-body font-bold text-wtext-1 dark:text-white">
                    {memberInfo.className}
                  </p>
                  <p className="text-[11px] text-wtext-3 dark:text-rink-300 tabular-nums">
                    {memberInfo.classSchedule}
                  </p>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-card-body text-wtext-3 dark:text-rink-300">결제 금액</dt>
                <dd className="text-right text-card-body font-bold text-ice-500 dark:text-blue-300 tabular-nums">
                  {memberInfo.paymentAmount}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-card-body text-wtext-3 dark:text-rink-300">신청 일시</dt>
                <dd className="text-right text-card-body text-wtext-2 dark:text-rink-100 tabular-nums">
                  {memberInfo.paymentDate}
                </dd>
              </div>
            </dl>
          </section>

          {/* ─── Admin Memo ───────────────────────────── */}
          <section
            className="overflow-hidden rounded-2xl border border-wline-2 dark:border-rink-700 bg-white dark:bg-rink-800 shadow-sm"
            aria-labelledby="admin-memo-title"
          >
            <div className="flex items-center justify-between border-b border-wline-2 dark:border-rink-700 bg-wbg dark:bg-rink-800/60 px-4 py-3">
              <h3
                id="admin-memo-title"
                className="flex items-center gap-2 text-card-body font-bold text-wtext-1 dark:text-white"
              >
                <Icon name="edit_note" className="text-card-title text-ice-500" aria-hidden="true" />
                관리자 메모
              </h3>
              <span className="text-[11px] text-wtext-3 dark:text-rink-300">
                마지막 수정 오늘 09:42
              </span>
            </div>
            <div className="p-4">
              <label htmlFor={memoId} className="sr-only">
                관리자 메모
              </label>
              <textarea
                id={memoId}
                className="w-full min-h-[120px] resize-none rounded-lg border border-wline dark:border-rink-700 bg-wbg dark:bg-rink-700 p-3 text-card-body text-wtext-1 dark:text-white placeholder-wtext-3 dark:placeholder-wtext-3 focus:border-ice-500 focus:outline-none focus:ring-2 focus:ring-ice-500/30"
                placeholder="상담 내용이나 특이사항을 입력해주세요."
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
              <button
                type="button"
                onClick={handleSaveMemo}
                disabled={isSavingMemo}
                className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-ice-500 px-4 py-3 text-card-body font-bold text-white shadow-sm transition-colors motion-reduce:transition-none hover:bg-ice-700 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
              >
                <Icon name="save" className="text-card-title" aria-hidden="true" />
                {isSavingMemo ? MESSAGES.common.saving : '메모 저장하기'}
              </button>
            </div>
          </section>

          {/* ─── Processing History ───────────────────── */}
          <section
            className="rounded-2xl border border-wline-2 dark:border-rink-700 bg-white dark:bg-rink-800 p-5 shadow-sm"
            aria-labelledby="history-title"
          >
            <h3
              id="history-title"
              className="mb-5 flex items-center gap-2 text-card-body font-bold text-wtext-1 dark:text-white"
            >
              <Icon name="history" className="text-card-title text-wtext-3" aria-hidden="true" />
              처리 이력
              <span className="ml-auto text-[11px] font-semibold text-wtext-3 dark:text-rink-300 tabular-nums">
                {history.length}단계
              </span>
            </h3>

            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-6">
                <p className="text-card-body text-wtext-3 dark:text-rink-300">
                  처리 이력이 없습니다.
                </p>
              </div>
            ) : (
              <ol className="relative pl-2">
                <div
                  className="absolute left-[7px] top-2 bottom-2 w-[2px] bg-wline-2 dark:bg-rink-700"
                  aria-hidden="true"
                />
                <div className="flex flex-col gap-5">
                  {history.map((item) => (
                    <li
                      key={item.id}
                      className={`relative pl-6 ${!item.isCurrent ? 'opacity-70' : ''}`}
                    >
                      {item.isCurrent ? (
                        <div
                          className="absolute left-0 top-1.5 z-10 h-4 w-4 rounded-w-pill border-2 border-ice-500 bg-white dark:bg-rink-800"
                          aria-hidden="true"
                        >
                          <div className="absolute inset-0 m-auto h-1.5 w-1.5 rounded-w-pill bg-ice-500" />
                        </div>
                      ) : (
                        <div
                          className="absolute left-0 top-1.5 z-10 h-4 w-4 rounded-w-pill bg-wline dark:bg-rink-500"
                          aria-hidden="true"
                        />
                      )}
                      <div className="flex flex-col">
                        {item.isCurrent && (
                          <span className="mb-0.5 text-[11px] font-bold text-ice-500">
                            현재 단계
                          </span>
                        )}
                        <span
                          className={`text-card-body font-bold ${
                            item.isCurrent
                              ? 'text-wtext-1 dark:text-white'
                              : 'text-wtext-2 dark:text-rink-100'
                          }`}
                        >
                          {item.stage}
                        </span>
                        <span className="mt-0.5 text-[11px] text-wtext-3 dark:text-rink-300 tabular-nums">
                          {item.timestamp} · {item.actor}
                        </span>
                        {item.note && (
                          <div className="mt-2 rounded-md border border-wline-2 dark:border-rink-700 bg-wbg dark:bg-rink-700 p-2 text-[12px] text-wtext-2 dark:text-rink-100">
                            {item.note}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </div>
              </ol>
            )}
          </section>
        </div>
      </main>

      {/* ─── Bottom Action Bar ────────────────────────── */}
      <div
        className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t border-wline dark:border-rink-700 bg-white dark:bg-rink-800 px-4 pt-4 pb-safe-4 shadow-md"
        role="region"
        aria-label="신청 처리"
      >
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setConfirmAction('reject')}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 px-4 py-3.5 text-card-body font-bold text-wtext-2 dark:text-rink-100 transition-colors motion-reduce:transition-none hover:bg-wbg dark:hover:bg-rink-700 active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
          >
            반려하기
          </button>
          <button
            type="button"
            onClick={() => setConfirmAction('approve')}
            className="inline-flex min-h-[48px] flex-[2] items-center justify-center gap-2 rounded-xl bg-ice-500 px-4 py-3.5 text-card-body font-bold text-white shadow-md transition-colors motion-reduce:transition-none hover:bg-ice-700 active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
          >
            <Icon name="check" className="text-card-title" aria-hidden="true" />
            최종 승인하기
          </button>
        </div>
      </div>

      {/* ─── Confirm Dialog ───────────────────────────── */}
      {confirmAction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-rink-900/50 px-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
        >
          <div className="w-full max-w-xs rounded-2xl bg-white dark:bg-rink-800 p-5 shadow-md">
            <div className="flex flex-col items-center gap-3 text-center">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-w-pill ${
                  confirmAction === 'approve'
                    ? 'bg-ice-500/10 text-ice-500'
                    : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                }`}
              >
                <Icon
                  name={confirmAction === 'approve' ? 'check_circle' : 'block'}
                  className="text-2xl"
                  aria-hidden="true"
                />
              </div>
              <h3
                id="confirm-title"
                className="text-card-emphasis font-bold text-wtext-1 dark:text-white"
              >
                {confirmAction === 'approve' ? '신청을 승인하시겠습니까?' : '신청을 반려하시겠습니까?'}
              </h3>
              <p className="text-card-body text-wtext-3 dark:text-rink-300">
                {confirmAction === 'approve'
                  ? '승인 시 회원에게 알림이 발송됩니다.'
                  : '반려 시 회원에게 알림이 발송됩니다.'}
              </p>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 px-4 py-2.5 text-card-body font-bold text-wtext-2 dark:text-rink-100 transition-colors motion-reduce:transition-none hover:bg-wbg dark:hover:bg-rink-700 active:brightness-95"
              >
                {MESSAGES.common.cancel}
              </button>
              <button
                type="button"
                onClick={confirmAction === 'approve' ? confirmApprove : confirmReject}
                className={`inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg px-4 py-2.5 text-card-body font-bold text-white transition-colors motion-reduce:transition-none active:brightness-95 ${
                  confirmAction === 'approve'
                    ? 'bg-ice-500 hover:bg-ice-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </MobileContainer>
  );
}
