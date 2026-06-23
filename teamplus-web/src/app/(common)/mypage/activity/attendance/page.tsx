'use client';

/**
 * /mypage/activity/attendance — 출석 기록
 *
 * W2.C #4: 마이페이지 활동 탭의 "출석 기록" 이 이전에는 `/attendance-history` 로
 * 잘못 라우팅되어 홈으로 이동하는 회귀가 발생. 본 페이지는 (common) 그룹 내 모든
 * 인증 사용자가 접근 가능한 본인 출석 기록 화면이며, GET /attendance/my 데이터를 그대로 사용.
 *
 * 데이터:    GET /attendance/my?limit=50 (서버는 본인 출석만 자동 필터)
 * 빈 상태:   MESSAGES.empty('출석 기록')
 *
 * 학부모(parent) 가 자녀별 상세 출석 보기는 별도 (parent)/attendance-history 페이지가
 * 존재하므로 그쪽으로 이동하는 링크를 함께 제공.
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigation } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { useSessionAuth } from '@/hooks/useSessionAuth';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';

interface AttendanceApiItem {
  id: string;
  className?: string;
  scheduledDate?: string;
  attendanceStatus?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
}

interface AttendanceRow {
  id: string;
  className: string;
  isPresent: boolean;
  date: string; // YYYY.MM.DD
  time: string;
  location: string;
  rawDate: Date;
}

const KOR_DAYS = ['일', '월', '화', '수', '목', '금', '토'];

function parseRow(a: AttendanceApiItem): AttendanceRow {
  const d = a.scheduledDate ? new Date(a.scheduledDate) : new Date();
  const day = KOR_DAYS[d.getDay()];
  const dateLabel = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} (${day})`;
  const time =
    a.startTime && a.endTime ? `${a.startTime} ~ ${a.endTime}` : (a.startTime ?? '');
  return {
    id: a.id,
    className: a.className ?? '수업',
    isPresent: a.attendanceStatus === 'present',
    date: dateLabel,
    time,
    location: a.location ?? '',
    rawDate: d,
  };
}

export default function MyAttendanceHistoryPage() {
  useNativeUI({ showStatusBar: true, showAppBar: false, showBottomNav: true });
  const { navigate } = useNavigation();
  const { user } = useSessionAuth();

  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  usePageReady(!isLoading);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const resp = await api.get<AttendanceApiItem[] | { items?: AttendanceApiItem[] }>(
        '/attendance/my',
        { params: { limit: 50 } },
      );
      if (resp.success && resp.data) {
        const list = Array.isArray(resp.data)
          ? resp.data
          : Array.isArray(resp.data.items)
            ? resp.data.items
            : [];
        const parsed = list.map(parseRow).sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime());
        setRows(parsed);
      } else {
        setRows([]);
      }
    } catch {
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isParent = user?.userType === 'parent';

  const totalCount = rows.length;
  const presentCount = rows.filter((r) => r.isPresent).length;
  const rate = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="출석 기록" forceNative />

      <main
        className="flex-1 overflow-y-auto hide-scrollbar bg-wbg dark:bg-puck pb-8"
        role="main"
        aria-label="본인 출석 기록"
      >
        {!isLoading && (
          <section className="px-5 pt-4" aria-label="출석 요약">
            <div className="rounded-w-xl bg-wsurface dark:bg-rink-800 border border-wline-2 dark:border-rink-700 p-5 shadow-sh-1">
              <p className="text-card-meta font-bold uppercase tracking-[0.12em] text-wtext-3 dark:text-wtext-4 mb-3">
                ATTENDANCE
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-card-meta text-wtext-3 dark:text-wtext-4">총 기록</p>
                  <p className="mt-1 text-w-h3 font-num font-bold tabular-nums text-wtext-1 dark:text-white">
                    {totalCount}
                  </p>
                </div>
                <div>
                  <p className="text-card-meta text-wtext-3 dark:text-wtext-4">출석</p>
                  <p className="mt-1 text-w-h3 font-num font-bold tabular-nums text-ice-500">
                    {presentCount}
                  </p>
                </div>
                <div>
                  <p className="text-card-meta text-wtext-3 dark:text-wtext-4">출석률</p>
                  <p className="mt-1 text-w-h3 font-num font-bold tabular-nums text-wtext-1 dark:text-white">
                    {rate}
                    <span className="text-card-body text-wtext-3 dark:text-wtext-4 ml-0.5">%</span>
                  </p>
                </div>
              </div>
              {isParent && (
                <button
                  type="button"
                  onClick={() => navigate('/attendance-history')}
                  className="mt-4 inline-flex items-center gap-1 text-card-meta font-bold text-ice-500 transition-colors motion-reduce:transition-none hover:text-ice-600"
                >
                  자녀별 상세 출석 보기
                  <Icon name="chevron_right" className="text-[16px]" aria-hidden="true" />
                </button>
              )}
            </div>
          </section>
        )}

        {isLoading ? null : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <div
              className="w-16 h-16 rounded-w-pill bg-wsurface dark:bg-rink-800 flex items-center justify-center mb-4"
              aria-hidden="true"
            >
              <Icon name="event_busy" className="text-3xl text-wtext-4 dark:text-wtext-3" />
            </div>
            <p className="text-card-body text-wtext-2 dark:text-wtext-4 text-center">
              {MESSAGES.empty('출석 기록')}
            </p>
            <p className="mt-1 text-card-meta text-wtext-3 dark:text-rink-300 text-center">
              수업에 출석하면 여기에 표시됩니다.
            </p>
          </div>
        ) : (
          <section
            className="px-5 pt-4 flex flex-col gap-2.5"
            aria-label={`총 ${rows.length}건의 출석 기록`}
          >
            {rows.map((r) => (
              <article
                key={r.id}
                className="rounded-w-lg bg-wsurface dark:bg-rink-800 border border-wline-2 dark:border-rink-700 p-4 shadow-sh-1"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'shrink-0 size-11 rounded-w-md flex items-center justify-center',
                      r.isPresent
                        ? 'bg-ice-50 dark:bg-ice-500/15'
                        : 'bg-wline-2 dark:bg-rink-700',
                    )}
                    aria-hidden="true"
                  >
                    <Icon
                      name={r.isPresent ? 'check_circle' : 'cancel'}
                      className={cn(
                        'text-card-title',
                        r.isPresent
                          ? 'text-ice-500'
                          : 'text-wtext-3 dark:text-wtext-4',
                      )}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="truncate text-card-title font-bold text-wtext-1 dark:text-white">
                        {r.className}
                      </h3>
                      <span
                        className={cn(
                          'shrink-0 inline-flex items-center rounded-w-xs px-1.5 py-0.5 text-card-meta font-bold',
                          r.isPresent
                            ? 'bg-mint-100 dark:bg-mint-500/15 text-mint-500'
                            : 'bg-wline-2 dark:bg-rink-700 text-wtext-3 dark:text-wtext-4',
                        )}
                      >
                        {r.isPresent ? '출석' : '결석'}
                      </span>
                    </div>
                    <p className="mt-1 text-card-meta text-wtext-3 dark:text-rink-300 font-num tabular-nums">
                      {r.date}
                      {r.time ? ` · ${r.time}` : ''}
                    </p>
                    {r.location && (
                      <p className="mt-0.5 text-card-meta text-wtext-3 dark:text-rink-300 truncate">
                        <Icon
                          name="location_on"
                          className="text-[14px] align-middle mr-0.5"
                          aria-hidden="true"
                        />
                        {r.location}
                      </p>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </main>
    </MobileContainer>
  );
}
