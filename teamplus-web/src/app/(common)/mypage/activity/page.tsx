'use client';

/**
 * /mypage/activity — 최근 활동 (timeline)
 *
 * W2.C #3: 마이페이지 활동 탭의 "최근 활동 > 전체" 버튼이 이전에는 `/attendance-history`
 * 로 잘못 라우팅되어 홈으로 이동하는 회귀가 발생. 본 페이지가 정식 진입점이며,
 * 출석 / 결제 / 알림 3종 활동을 시간순으로 묶어 노출한다.
 *
 * 데이터:
 *   - 출석:     GET /attendance/my?limit=15 (역할 자동 — 자녀 출석은 parent 학부모 대시보드에서)
 *   - 결제:     getPaymentHistory({ page:1, pageSize:15 }) (서비스 재활용)
 *   - 알림:     useNotificationCount (미읽음 카운트만 표시)
 *
 * 빈 상태:    MESSAGES.empty('활동')
 * 라우팅:    각 카드 클릭 시 출석/결제/알림 상세로 이동
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigation } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { api } from '@/services/api-client';
import { getPaymentHistory } from '@/services/payment';
import { useNotificationCount } from '@/hooks/useNotificationCount';
import { MESSAGES } from '@/lib/messages';
import { PATHS } from '@/lib/paths';
import { cn } from '@/lib/utils';
import type { PaymentHistoryItem } from '@/types/payment';

// ─── 타입 정의 ────────────────────────────────────────
type ActivityKind = 'attendance' | 'payment' | 'notification';

interface ActivityItem {
  id: string;
  kind: ActivityKind;
  title: string;
  subtitle: string;
  timestamp: string; // ISO
  href: string;
  status?: 'positive' | 'neutral' | 'warning';
}

interface AttendanceApiItem {
  id: string;
  className?: string;
  scheduledDate?: string;
  attendanceStatus?: string;
  location?: string;
}

const KIND_META: Record<ActivityKind, { icon: string; bg: string; color: string; label: string }> = {
  attendance: {
    icon: 'event_available',
    bg: 'bg-ice-50 dark:bg-ice-500/15',
    color: 'text-ice-500',
    label: '출석',
  },
  payment: {
    icon: 'receipt_long',
    bg: 'bg-mint-100 dark:bg-mint-500/15',
    color: 'text-mint-500',
    label: '결제',
  },
  notification: {
    icon: 'notifications',
    bg: 'bg-sun-100 dark:bg-sun-500/15',
    color: 'text-sun-500',
    label: '알림',
  },
};

function formatRelative(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return '방금 전';
    if (diffMin < 60) return `${diffMin}분 전`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}시간 전`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay}일 전`;
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return iso;
  }
}

export default function MyActivityPage() {
  useNativeUI({ showStatusBar: true, showAppBar: false, showBottomNav: true });
  const { navigate } = useNavigation();
  const { unreadCount } = useNotificationCount();

  const [items, setItems] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  usePageReady(!isLoading);

  const loadActivities = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const collected: ActivityItem[] = [];

    // 출석 — 본인 출석 이력 (백엔드 미존재 시 graceful skip)
    try {
      const resp = await api.get<AttendanceApiItem[] | { items?: AttendanceApiItem[] }>(
        '/attendance/my',
        { params: { limit: 15 } },
      );
      if (resp.success && resp.data) {
        const list = Array.isArray(resp.data)
          ? resp.data
          : Array.isArray(resp.data.items)
            ? resp.data.items
            : [];
        list.forEach((a) => {
          const isPresent = a.attendanceStatus === 'present';
          collected.push({
            id: `att-${a.id}`,
            kind: 'attendance',
            title: a.className ?? '수업 출석',
            subtitle:
              [isPresent ? '출석 완료' : a.attendanceStatus ?? '', a.location ?? '']
                .filter(Boolean)
                .join(' · ') || (isPresent ? '출석 완료' : '결석 처리'),
            timestamp: a.scheduledDate ?? '',
            href: PATHS.mypage.activityAttendance,
            status: isPresent ? 'positive' : 'warning',
          });
        });
      }
    } catch {
      // 백엔드 미연동 시 출석 항목 생략 — 결제/알림은 별도 시도
    }

    // 결제 — 본인 결제 이력
    try {
      const resp = await getPaymentHistory();
      if (resp.success && resp.data) {
        const payments: PaymentHistoryItem[] = resp.data.payments ?? [];
        payments.slice(0, 15).forEach((p) => {
          const timestamp = p.date ? `${p.date}T${p.time ?? '00:00:00'}` : '';
          collected.push({
            id: `pay-${p.id}`,
            kind: 'payment',
            title: p.productName ?? p.className ?? '결제',
            subtitle: `${(p.amount ?? 0).toLocaleString()}원`,
            timestamp,
            href: PATHS.mypage.activityPayments,
            status: p.status === 'completed' ? 'positive' : 'neutral',
          });
        });
      }
    } catch {
      // 결제 API 실패 시 graceful skip
    }

    // 알림 — 미읽음 카운트만 요약 표시 (전체 목록은 /notifications 로 이동)
    if (unreadCount > 0) {
      collected.push({
        id: 'notif-summary',
        kind: 'notification',
        title: `읽지 않은 알림 ${unreadCount}건`,
        subtitle: '알림 센터에서 확인하기',
        timestamp: new Date().toISOString(),
        href: '/notifications',
        status: 'warning',
      });
    }

    // 시간 역순 정렬
    collected.sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    });

    setItems(collected);
    setIsLoading(false);
  }, [unreadCount]);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="최근 활동" forceNative />

      <main
        className="flex-1 overflow-y-auto hide-scrollbar bg-wbg dark:bg-puck pb-8"
        role="main"
        aria-label="최근 활동 타임라인"
      >
        {isLoading ? null : error ? (
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <p className="text-card-body text-wtext-2 dark:text-wtext-4">{error}</p>
            <button
              type="button"
              onClick={() => void loadActivities()}
              className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-w-pill bg-ice-500 px-5 text-card-meta font-bold text-white transition-colors motion-reduce:transition-none hover:bg-ice-600 active:brightness-95"
            >
              다시 시도
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <div
              className="w-16 h-16 rounded-w-pill bg-wsurface dark:bg-rink-800 flex items-center justify-center mb-4"
              aria-hidden="true"
            >
              <Icon name="history" className="text-3xl text-wtext-4 dark:text-wtext-3" />
            </div>
            <p className="text-card-body text-wtext-2 dark:text-wtext-4 text-center">
              {MESSAGES.empty('활동')}
            </p>
            <p className="mt-1 text-card-meta text-wtext-3 dark:text-rink-300 text-center">
              출석·결제·알림이 발생하면 여기에 표시됩니다.
            </p>
          </div>
        ) : (
          <section className="px-5 pt-4 flex flex-col gap-2.5" aria-label="활동 목록">
            {items.map((it) => {
              const meta = KIND_META[it.kind];
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => navigate(it.href)}
                  className="flex items-center gap-3 rounded-w-lg bg-wsurface dark:bg-rink-800 p-4 border border-wline-2 dark:border-rink-700 shadow-sh-1 text-left transition-shadow duration-200 ease-wallet motion-reduce:transition-none hover:shadow-sh-2 active:brightness-95"
                >
                  <div
                    className={cn(
                      'shrink-0 size-11 rounded-w-md flex items-center justify-center',
                      meta.bg,
                    )}
                    aria-hidden="true"
                  >
                    <Icon name={meta.icon} className={cn('text-card-title', meta.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-w-xs px-1.5 py-0.5 text-card-meta font-bold',
                          meta.bg,
                          meta.color,
                        )}
                      >
                        {meta.label}
                      </span>
                      <h3 className="truncate text-card-title font-bold text-wtext-1 dark:text-white">
                        {it.title}
                      </h3>
                    </div>
                    <p className="mt-1 truncate text-card-meta text-wtext-3 dark:text-rink-300">
                      {it.subtitle}
                    </p>
                  </div>
                  <span
                    className="shrink-0 text-card-meta text-wtext-3 dark:text-rink-300 font-num tabular-nums"
                    aria-label={`발생 시점: ${it.timestamp}`}
                  >
                    {formatRelative(it.timestamp)}
                  </span>
                </button>
              );
            })}
          </section>
        )}
      </main>
    </MobileContainer>
  );
}
