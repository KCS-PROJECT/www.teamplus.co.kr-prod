'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { api } from '@/services/api-client';
import { useToast } from '@/components/ui/Toast';
import { MESSAGES } from '@/lib/messages';

import { usePageReady } from '@/hooks/usePageReady';
interface MemberDetail {
  id: string;
  name: string;
  memberId: string;
  phone: string;
  joinDate: string;
  role?: 'ADMIN' | 'DIRECTOR' | 'COACH' | 'PARENT' | 'TEEN' | 'CHILD';
  credits: {
    current: number;
    lastChange: number;
    lastChangeDate: string;
  };
  child?: {
    name: string;
    age: number;
  };
  recentClass?: {
    name: string;
    date: string;
    time: string;
  };
  status: 'pending' | 'approved' | 'rejected';
  paymentStatus: 'pending' | 'completed' | 'failed';
}

interface CreditHistory {
  id: string;
  type: 'add' | 'deduct';
  amount: number;
  reason: string;
  date: string;
  actor: string;
}

const ROLE_BADGE_MAP: Record<string, { label: string; className: string }> = {
  ADMIN:    { label: '관리자',    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  DIRECTOR: { label: '감독',      className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  COACH:    { label: '코치',      className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
  PARENT:   { label: '학부모',    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  TEEN:     { label: '청소년',    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  CHILD:    { label: '아동',      className: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' },
};

export default function MemberDetailPage() {
  const params = useParams();
  const { toast } = useToast();
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [creditHistory, setCreditHistory] = useState<CreditHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  const memberId = params?.id as string | undefined;

  const loadMember = useCallback(async () => {
    if (!memberId) return;
    setIsLoading(true);
    try {
      const res = await api.get<{ member: MemberDetail; creditHistory: CreditHistory[] }>(`/admin/users/${memberId}`);
      if (res.data) {
        setMember(res.data.member ?? null);
        setCreditHistory(res.data.creditHistory ?? []);
      }
    } catch {
      setMember(null);
    } finally {
      setIsLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    void loadMember();
  }, [loadMember]);

  const handleApprove = async () => {
    if (!memberId) return;
    try {
      const res = await api.put(`/admin/users/${memberId}/approve`, {});
      if ((res as { success?: boolean })?.success !== false) {
        toast.success(MESSAGES.approval.approved);
        setMember((prev) => (prev ? { ...prev, status: 'approved' } : prev));
      }
    } catch {
      toast.error(MESSAGES.error.general);
    }
  };

  const handleReject = async () => {
    if (!memberId) return;
    try {
      const res = await api.put(`/admin/users/${memberId}/reject`, {});
      if ((res as { success?: boolean })?.success !== false) {
        toast.success(MESSAGES.approval.rejected);
        setMember((prev) => (prev ? { ...prev, status: 'rejected' } : prev));
      }
    } catch {
      toast.error(MESSAGES.error.general);
    }
  };

  if (isLoading) {
    return null;
  }

  if (!member) {
    return (
      <MobileContainer hasBottomNav={false}>
        <PageAppBar title="회원 상세" className="z-50" />
        <main className="flex-1 flex items-center justify-center bg-wbg dark:bg-rink-900">
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-w-pill bg-wline-2 dark:bg-rink-800">
              <Icon name="person_off" className="text-3xl text-wtext-3" aria-hidden="true" />
            </div>
            <p className="text-card-body font-semibold text-wtext-2 dark:text-rink-100">
              회원 정보를 찾을 수 없습니다.
            </p>
          </div>
        </main>
      </MobileContainer>
    );
  }

  const roleBadge = member.role ? ROLE_BADGE_MAP[member.role] : null;
  const lastChangePositive = member.credits.lastChange > 0;

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar title="회원 상세" className="z-50" />

      <main className="flex-1 overflow-y-auto bg-wbg dark:bg-rink-900 pb-32 hide-scrollbar">
        <div className="w-full max-w-md mx-auto flex flex-col gap-4 p-4">
          {/* ─── Profile Hero ─────────────────────────── */}
          <section
            className="relative overflow-hidden rounded-2xl border border-wline-2 dark:border-rink-700 bg-white dark:bg-rink-800 p-6 shadow-sm"
            aria-labelledby="member-name"
          >
            {/* 상단 액센트 bar (솔리드 primary) */}
            <div
              className="absolute inset-x-0 top-0 h-1 bg-ice-500"
              aria-hidden="true"
            />

            <div className="flex flex-col items-center gap-3 pt-1">
              <div className="relative">
                <div className="flex h-24 w-24 items-center justify-center rounded-w-pill border-4 border-white dark:border-rink-800 bg-wline-2 dark:bg-rink-700 shadow-md">
                  <Icon name="person" className="text-5xl text-wtext-3" aria-hidden="true" />
                </div>
                <span
                  className="absolute bottom-1 right-1 h-4 w-4 rounded-w-pill border-2 border-white dark:border-rink-800 bg-green-500"
                  aria-label="온라인 상태"
                />
              </div>

              <div className="text-center">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <h2
                    id="member-name"
                    className="text-xl font-bold tracking-tight text-wtext-1 dark:text-white"
                  >
                    {member.name}
                  </h2>
                  {roleBadge && (
                    <span
                      className={`inline-flex items-center rounded-w-pill px-2.5 py-0.5 text-[11px] font-bold ${roleBadge.className}`}
                    >
                      {roleBadge.label}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 flex items-center justify-center gap-2 text-card-body text-wtext-3 dark:text-rink-300">
                  <span className="tabular-nums">{member.memberId}</span>
                  <span
                    className="h-1 w-1 rounded-w-pill bg-wline dark:bg-rink-500"
                    aria-hidden="true"
                  />
                  <span className="tabular-nums">{member.phone}</span>
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-w-pill border border-blue-100 bg-blue-50 px-3 py-1 text-card-meta font-semibold text-ice-500 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  <Icon name="calendar_today" className="text-[14px]" aria-hidden="true" />
                  <span>가입일 {member.joinDate}</span>
                </div>
              </div>
            </div>
          </section>

          {/* ─── Credit Summary ───────────────────────── */}
          <section className="flex flex-col gap-3" aria-labelledby="credit-section">
            <div className="flex items-center justify-between px-1">
              <h3
                id="credit-section"
                className="text-card-emphasis font-bold text-wtext-1 dark:text-white"
              >
                결제권 관리
              </h3>
              <NavLink
                href={`/members/${params?.id}/credits`}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-card-body font-medium text-ice-500 hover:text-ice-700 transition-colors motion-reduce:transition-none"
              >
                전체 내역
                <Icon name="chevron_right" className="text-[16px]" aria-hidden="true" />
              </NavLink>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-wline-2 dark:border-rink-700 bg-white dark:bg-rink-800 p-5 shadow-sm">
              <div>
                <p className="text-card-meta font-semibold text-wtext-3 dark:text-rink-300">
                  현재 잔여 결제권
                </p>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-4xl font-black text-wtext-1 dark:text-white tabular-nums">
                    {member.credits.current}
                  </span>
                  <span className="text-card-emphasis font-semibold text-wtext-3 dark:text-rink-300">
                    회
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-card-body font-semibold tabular-nums ${
                    lastChangePositive
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                  }`}
                >
                  <Icon
                    name={lastChangePositive ? 'trending_up' : 'trending_down'}
                    className="text-card-body"
                    aria-hidden="true"
                  />
                  <span>
                    {lastChangePositive ? '+' : ''}
                    {member.credits.lastChange}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-wtext-3 dark:text-rink-300 tabular-nums">
                  {member.credits.lastChangeDate}
                </p>
              </div>
            </div>

            <NavLink
              href={`/members/${params?.id}/credits`}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-ice-500 px-4 py-3.5 text-card-body font-bold text-white shadow-md hover:bg-ice-700 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
            >
              <Icon name="edit" className="text-[18px]" aria-hidden="true" />
              결제권 관리
            </NavLink>
          </section>

          {/* ─── Recent Credit History ────────────────── */}
          <section
            className="overflow-hidden rounded-2xl border border-wline-2 dark:border-rink-700 bg-white dark:bg-rink-800 shadow-sm"
            aria-labelledby="credit-history-title"
          >
            <div className="flex items-center justify-between border-b border-wline-2 dark:border-rink-700 bg-wbg dark:bg-rink-800/60 px-5 py-3">
              <h3
                id="credit-history-title"
                className="text-card-body font-bold text-wtext-2 dark:text-rink-100"
              >
                최근 변동 이력
              </h3>
              <span className="text-[11px] font-semibold text-wtext-3 dark:text-rink-300 tabular-nums">
                {creditHistory.length}건
              </span>
            </div>
            {creditHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-5 py-10">
                <div className="flex h-12 w-12 items-center justify-center rounded-w-pill bg-wline-2 dark:bg-rink-700">
                  <Icon name="history" className="text-2xl text-wtext-3" aria-hidden="true" />
                </div>
                <p className="text-card-body text-wtext-3 dark:text-rink-300">
                  최근 결제권 변동 내역이 없습니다.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                {creditHistory.map((history) => {
                  const isAdd = history.type === 'add';
                  return (
                    <li
                      key={history.id}
                      className="flex items-center justify-between px-5 py-4 transition-colors motion-reduce:transition-none hover:bg-wbg dark:hover:bg-rink-800/60"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-w-pill ${
                            isAdd
                              ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                          }`}
                        >
                          <Icon
                            name={isAdd ? 'add' : 'remove'}
                            className="text-card-title"
                            aria-hidden="true"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-card-body font-semibold text-wtext-1 dark:text-white">
                            {history.reason}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-wtext-3 dark:text-rink-300 tabular-nums">
                            {history.date} · {history.actor}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 text-right text-card-body font-bold tabular-nums ${
                          isAdd
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {isAdd ? '+' : '-'}
                        {history.amount}회
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ─── Secondary Info ───────────────────────── */}
          {(member.child || member.recentClass) && (
            <section className="flex flex-col gap-3" aria-label="부가 정보">
              {member.child && (
                <div className="flex items-center gap-4 rounded-2xl border border-wline-2 dark:border-rink-700 bg-white dark:bg-rink-800 p-4 shadow-sm">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-w-pill bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                    <Icon name="child_care" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-wtext-3 dark:text-rink-300">
                      자녀 정보
                    </p>
                    <p className="mt-0.5 text-card-body font-bold text-wtext-1 dark:text-white truncate">
                      {member.child.name}
                      <span className="ml-1 text-wtext-3 dark:text-rink-300 tabular-nums">
                        ({member.child.age}세)
                      </span>
                    </p>
                  </div>
                  <Icon
                    name="chevron_right"
                    className="text-wtext-3"
                    aria-hidden="true"
                  />
                </div>
              )}

              {member.recentClass && (
                <div className="flex items-center gap-4 rounded-2xl border border-wline-2 dark:border-rink-700 bg-white dark:bg-rink-800 p-4 shadow-sm">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-w-pill bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                    <Icon name="sports_hockey" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-wtext-3 dark:text-rink-300">
                      최근 수업
                    </p>
                    <p className="mt-0.5 text-card-body font-bold text-wtext-1 dark:text-white truncate">
                      {member.recentClass.name}
                    </p>
                    <p className="text-[11px] text-wtext-3 dark:text-rink-300 tabular-nums">
                      {member.recentClass.date} {member.recentClass.time}
                    </p>
                  </div>
                  <Icon
                    name="chevron_right"
                    className="text-wtext-3"
                    aria-hidden="true"
                  />
                </div>
              )}
            </section>
          )}
        </div>
      </main>

      {/* ─── Bottom Action Bar (승인 대기 시에만) ───── */}
      {member.status === 'pending' && (
        <div
          className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t border-wline dark:border-rink-700 bg-white dark:bg-rink-800 px-4 pt-4 pb-safe-4 shadow-md"
          role="region"
          aria-label="회원 승인 처리"
        >
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleReject}
              className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 px-4 py-3.5 text-card-body font-bold text-wtext-2 dark:text-rink-100 transition-colors motion-reduce:transition-none hover:bg-wbg dark:hover:bg-rink-700 active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
            >
              반려하기
            </button>
            <button
              type="button"
              onClick={handleApprove}
              className="inline-flex min-h-[48px] flex-[2] items-center justify-center gap-2 rounded-xl bg-ice-500 px-4 py-3.5 text-card-body font-bold text-white shadow-md transition-colors motion-reduce:transition-none hover:bg-ice-700 active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
            >
              <Icon name="check" className="text-card-title" aria-hidden="true" />
              최종 승인
            </button>
          </div>
        </div>
      )}
    </MobileContainer>
  );
}
