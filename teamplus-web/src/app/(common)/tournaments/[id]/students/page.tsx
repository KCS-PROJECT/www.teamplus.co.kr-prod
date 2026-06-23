'use client';

/**
 * /tournaments/[id]/students — 대회 선수정보·결제현황 페이지 (코치/감독/관리자)
 *
 * 정규수업 선수정보(/classes/[id]/students)와 동일 목적의 대회 버전.
 *   · 상단: 결제 요약(총 참가·완납·미납·총 수금)
 *   · 목록: 참가 선수 — 이름·출생연도·결제상태(완납/미납)·금액
 *
 * 데이터: GET /tournaments/:id/registrations (감독/코치/관리자 권한 — 백엔드 @Roles).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useSessionAuth } from '@/hooks/useSessionAuth';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import {
  canManageMatch,
  getTournament,
  listTournamentRegistrations,
  type TournamentRegistrationRow,
} from '@/services/tournament.service';

interface StudentRow {
  id: string;
  name: string;
  birthYear: number | null;
  isPaid: boolean;
  amount: number;
}

export default function TournamentStudentsPage() {
  const { user } = useSessionAuth();
  const params = useParams();
  const id = (params?.id ?? '') as string;
  const isManager = canManageMatch(user?.userType);

  const [tournamentName, setTournamentName] = useState('');
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  usePageReady(!isLoading);
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
    showBackButton: true,
  });

  const load = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    const [tRes, rRes] = await Promise.all([
      getTournament(id),
      listTournamentRegistrations(id),
    ]);
    if (tRes.success && tRes.data) setTournamentName(tRes.data.name);
    if (rRes.success && rRes.data) {
      const mapped: StudentRow[] = rRes.data.registrations.map(
        (r: TournamentRegistrationRow) => {
          const person = r.child ?? r.user;
          const name =
            `${person?.lastName ?? ''}${person?.firstName ?? ''}`.trim() ||
            '참가자';
          const bd = r.child?.childProfile?.birthDate ?? null;
          const birthYear = bd ? new Date(bd).getFullYear() : null;
          const amount = Number(r.payment?.amount ?? r.calculatedFee ?? 0) || 0;
          return {
            id: r.id,
            name,
            birthYear,
            isPaid: r.paymentStatus === 'PAID',
            amount,
          };
        },
      );
      // 출생연도 오름차순(나이 많은 순), 미상은 뒤로.
      mapped.sort(
        (a, b) =>
          (a.birthYear ?? Number.POSITIVE_INFINITY) -
          (b.birthYear ?? Number.POSITIVE_INFINITY),
      );
      setRows(mapped);
    } else {
      setError(rRes.error?.message ?? MESSAGES.error.general);
    }
    setIsLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const total = rows.length;
    const paid = rows.filter((r) => r.isPaid).length;
    const collected = rows
      .filter((r) => r.isPaid)
      .reduce((sum, r) => sum + r.amount, 0);
    return { total, paid, unpaid: total - paid, collected };
  }, [rows]);

  if (isLoading) return null;

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="대회 선수 정보" />

      <main className="flex flex-col gap-4 px-4 py-4">
        {tournamentName && (
          <p className="flex items-center gap-1.5 text-card-body font-bold text-wtext-1 dark:text-white">
            <Icon name="emoji_events" className="text-[18px] text-red-500" aria-hidden="true" filled />
            {tournamentName}
          </p>
        )}

        {!isManager ? (
          <div className="rounded-xl border border-wline-2 bg-wbg px-4 py-6 text-center text-w-small text-wtext-3 dark:border-rink-700 dark:bg-rink-800 dark:text-rink-300">
            선수 정보는 코치/감독만 조회할 수 있습니다.
          </div>
        ) : error ? (
          <div className="rounded-xl border border-flame-200 bg-flame-50 dark:bg-flame-900/20 p-4 text-w-small text-flame-700 dark:text-flame-300">
            {error}
          </div>
        ) : (
          <>
            {/* 결제 요약 */}
            <section
              aria-label="결제 현황 요약"
              className="grid grid-cols-3 gap-2"
            >
              <SummaryCard label="참가" value={`${summary.total}명`} />
              <SummaryCard
                label="완납"
                value={`${summary.paid}명`}
                tone="paid"
              />
              <SummaryCard
                label="미납"
                value={`${summary.unpaid}명`}
                tone="unpaid"
              />
            </section>
            <div className="rounded-xl border border-wline-2 bg-white px-4 py-3 dark:border-rink-700 dark:bg-rink-800 flex items-center justify-between">
              <span className="text-w-small font-medium text-wtext-3 dark:text-rink-300">
                총 수금액
              </span>
              <span className="text-card-title font-extrabold text-wtext-1 dark:text-white tabular-nums">
                {summary.collected.toLocaleString('ko-KR')}원
              </span>
            </div>

            {/* 선수 목록 */}
            {rows.length === 0 ? (
              <div className="rounded-xl border border-wline-2 bg-wbg px-4 py-6 text-center text-w-small text-wtext-3 dark:border-rink-700 dark:bg-rink-800 dark:text-rink-300">
                {MESSAGES.empty('참가 선수')}
              </div>
            ) : (
              <ul className="flex flex-col gap-2" role="list">
                {rows.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-wline-2 bg-white px-4 py-3 dark:border-rink-700 dark:bg-rink-800"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Icon name="person" className="text-[20px] text-wtext-3" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block truncate font-bold text-wtext-1 dark:text-white">
                          {r.name}
                        </span>
                        {r.birthYear && (
                          <span className="block text-card-meta text-wtext-3 dark:text-rink-300 tabular-nums">
                            {r.birthYear}년생
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-0.5 shrink-0">
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-w-caption font-bold',
                          r.isPaid
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                            : 'bg-wline-2 text-wtext-3 dark:bg-rink-700 dark:text-rink-300',
                        )}
                      >
                        {r.isPaid ? '완납' : '미납'}
                      </span>
                      {r.amount > 0 && (
                        <span className="text-card-meta text-wtext-3 dark:text-rink-300 tabular-nums">
                          {r.amount.toLocaleString('ko-KR')}원
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </MobileContainer>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'paid' | 'unpaid';
}) {
  return (
    <div className="rounded-xl border border-wline-2 bg-white px-3 py-3 text-center dark:border-rink-700 dark:bg-rink-800">
      <p className="text-w-caption text-wtext-3 dark:text-rink-300">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-card-title font-extrabold tabular-nums',
          tone === 'paid'
            ? 'text-emerald-600 dark:text-emerald-400'
            : tone === 'unpaid'
              ? 'text-flame-600 dark:text-flame-400'
              : 'text-wtext-1 dark:text-white',
        )}
      >
        {value}
      </p>
    </div>
  );
}
