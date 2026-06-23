'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/services/api-client';

import { usePageReady } from '@/hooks/usePageReady';
interface Popup {
  id: string;
  title: string;
  priority: number | 'urgent' | 'scheduled';
  isActive: boolean;
  startDate: string;
  endDate: string;
  targets: string[];
  category: string;
  image?: string;
}

type FilterType = 'all' | 'active' | 'waiting' | 'ended';

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'active', label: '노출 중' },
  { key: 'waiting', label: '대기' },
  { key: 'ended', label: '종료' },
];

export default function PopupsPage() {
  const [filter, setFilter] = useState<FilterType>('all');
  const [popups, setPopups] = useState<Popup[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  const loadPopups = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<Popup[]>('/app/banners');
      setPopups(res.data ?? []);
    } catch {
      setPopups([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPopups();
  }, [loadPopups]);

  const togglePopup = (id: string) => {
    setPopups(popups.map((popup) =>
      popup.id === id ? { ...popup, isActive: !popup.isActive } : popup,
    ));
  };

  const getPriorityBadge = (priority: number | 'urgent' | 'scheduled') => {
    if (priority === 'urgent') {
      return { text: '긴급', className: 'bg-red-600 text-white' };
    }
    if (priority === 'scheduled') {
      return { text: '예정', className: 'bg-amber-500 text-white' };
    }
    return {
      text: `${priority}순위`,
      className: priority === 1 ? 'bg-ice-500 text-white' : 'bg-rink-500 text-white',
    };
  };

  const getTargetBadge = (target: string) => {
    if (target === '전체 회원' || target === '전체') {
      return 'bg-ice-500/10 text-ice-500 dark:bg-ice-500/20';
    }
    if (target === '부모') {
      return 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300';
    }
    if (target === '아이') {
      return 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
    }
    return 'bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100';
  };

  const counts = useMemo(() => {
    const active = popups.filter((p) => p.isActive).length;
    const waiting = popups.filter((p) => p.priority === 'scheduled').length;
    return { all: popups.length, active, waiting, ended: 0 };
  }, [popups]);

  const visiblePopups = useMemo(() => {
    return popups.filter((p) => {
      if (filter === 'all') return true;
      if (filter === 'active') return p.isActive;
      if (filter === 'waiting') return p.priority === 'scheduled';
      return false;
    });
  }, [popups, filter]);

  return (
    <MobileContainer hasBottomNav>
      {/* AppBar — 수정 금지 */}
      <PageAppBar title="팝업 관리" className="z-50" />

      {/* Filter Chips */}
      <div className="sticky top-14 z-40 bg-white dark:bg-rink-900 border-b border-wline-2 dark:border-rink-800">
        <div className="flex gap-2 px-4 py-3 overflow-x-auto hide-scrollbar">
          {FILTERS.map(({ key, label }) => {
            const count =
              key === 'all' ? counts.all :
              key === 'active' ? counts.active :
              key === 'waiting' ? counts.waiting :
              counts.ended;
            const active = filter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-w-pill px-4 text-card-body font-bold transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900 ${
                  active
                    ? 'bg-ice-500 text-white shadow-sm'
                    : 'bg-white dark:bg-rink-800 text-wtext-2 dark:text-rink-100 border border-wline dark:border-rink-700 hover:bg-wbg dark:hover:bg-rink-700'
                }`}
                aria-pressed={active}
              >
                {label}
                <span
                  className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-w-pill text-[11px] font-bold tabular-nums ${
                    active ? 'bg-white/20 text-white' : 'bg-wline-2 dark:bg-rink-700 text-wtext-3 dark:text-rink-300'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-4 flex flex-col gap-3 pb-28 max-w-lg mx-auto w-full">
        {isLoading ? null : visiblePopups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-w-pill bg-wline-2 dark:bg-rink-700">
              <Icon name="web_asset_off" className="text-[28px] text-wtext-3 dark:text-rink-300" aria-hidden="true" />
            </div>
            <p className="mt-4 text-card-emphasis font-bold text-wtext-2 dark:text-rink-100">
              등록된 팝업이 없습니다.
            </p>
            <p className="mt-1 text-card-body font-medium text-wtext-3 dark:text-rink-300">
              새 팝업을 등록해 회원에게 알려보세요.
            </p>
          </div>
        ) : (
          visiblePopups.map((popup) => {
            const badge = getPriorityBadge(popup.priority);
            const isWaiting = popup.priority === 'scheduled';

            return (
              <article
                key={popup.id}
                className={`relative flex flex-col bg-white dark:bg-rink-800 rounded-xl shadow-sm hover:shadow-md transition-shadow motion-reduce:transition-none overflow-hidden border ${
                  isWaiting
                    ? 'border-dashed border-wline dark:border-rink-700'
                    : 'border-wline dark:border-rink-700'
                } ${!popup.isActive && !isWaiting ? 'opacity-75' : ''}`}
              >
                <div className="p-4 flex gap-4">
                  {/* Thumbnail */}
                  <div className="relative shrink-0">
                    <div
                      className={`size-[88px] rounded-lg bg-wline-2 dark:bg-rink-700 bg-cover bg-center overflow-hidden border border-wline-2 dark:border-rink-700 ${isWaiting ? 'grayscale' : ''}`}
                      style={popup.image ? { backgroundImage: `url(${popup.image})` } : {}}
                      role="img"
                      aria-label={`${popup.title} 썸네일`}
                    >
                      {!popup.image && (
                        <div className="w-full h-full flex items-center justify-center text-wtext-3 dark:text-rink-300">
                          <Icon name="image" className="text-[32px]" aria-hidden="true" />
                        </div>
                      )}
                    </div>
                    <div
                      className={`absolute -top-2 -left-2 text-[10px] font-bold px-2 py-1 rounded-w-pill border-2 border-white dark:border-rink-800 shadow-sm z-10 ${badge.className}`}
                    >
                      {badge.text}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex flex-1 flex-col justify-between min-w-0">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3
                          className={`text-card-emphasis font-bold leading-snug line-clamp-2 pr-2 ${isWaiting ? 'text-wtext-2 dark:text-rink-100' : 'text-wtext-1 dark:text-white'}`}
                        >
                          {popup.title}
                        </h3>
                        {/* Toggle */}
                        {!isWaiting ? (
                          <label className="relative inline-flex items-center cursor-pointer shrink-0">
                            <span className="sr-only">팝업 노출 {popup.isActive ? '끄기' : '켜기'}</span>
                            <input
                              type="checkbox"
                              checked={popup.isActive}
                              onChange={() => togglePopup(popup.id)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-wline peer-focus-visible:ring-2 peer-focus-visible:ring-ice-500 peer-focus-visible:ring-offset-2 rounded-w-pill peer dark:bg-rink-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-wline after:border after:rounded-w-pill after:h-5 after:w-5 after:transition-all motion-reduce:after:transition-none peer-checked:bg-ice-500" />
                          </label>
                        ) : (
                          <div className="px-2 py-1 rounded bg-wline-2 dark:bg-rink-700 text-[10px] font-bold text-wtext-3 dark:text-rink-300">
                            대기중
                          </div>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {popup.targets.map((target, i) => (
                          <span
                            key={i}
                            className={`inline-flex items-center px-2 py-0.5 rounded text-card-meta font-bold ${getTargetBadge(target)}`}
                          >
                            {target}
                          </span>
                        ))}
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-card-meta font-bold bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100">
                          {popup.category}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center text-card-meta text-wtext-3 dark:text-rink-300 font-semibold tabular-nums">
                      <Icon
                        name={isWaiting ? 'event_upcoming' : 'calendar_today'}
                        className="text-[14px] mr-1"
                        aria-hidden="true"
                      />
                      {isWaiting ? `${popup.startDate} 시작 예정` : `${popup.startDate} ~ ${popup.endDate}`}
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div
                  className={`flex border-t border-wline-2 dark:border-rink-700 ${isWaiting ? 'bg-wbg dark:bg-rink-800/60' : ''}`}
                >
                  <button
                    type="button"
                    className="flex-1 h-11 text-card-meta font-bold text-wtext-2 dark:text-rink-100 hover:text-ice-500 hover:bg-wbg dark:hover:bg-rink-700/50 transition-colors motion-reduce:transition-none flex items-center justify-center gap-1 focus:outline-none focus-visible:bg-wbg dark:focus-visible:bg-rink-700/50"
                  >
                    <Icon name={isWaiting ? 'edit_calendar' : 'edit'} className="text-[16px]" aria-hidden="true" />
                    {isWaiting ? '일정 변경' : '수정하기'}
                  </button>
                  {!isWaiting && (
                    <button
                      type="button"
                      className="flex-1 h-11 text-card-meta font-bold text-wtext-2 dark:text-rink-100 hover:text-ice-500 hover:bg-wbg dark:hover:bg-rink-700/50 transition-colors motion-reduce:transition-none flex items-center justify-center gap-1 focus:outline-none focus-visible:bg-wbg dark:focus-visible:bg-rink-700/50"
                    >
                      <Icon name="visibility" className="text-[16px]" aria-hidden="true" />
                      미리보기
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </main>

      {/* Floating Action Button */}
      <div
        className="fixed left-0 right-0 px-4 flex justify-center z-40 pointer-events-none"
        style={{
          bottom: 'calc(1.5rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))',
        }}
      >
        <button
          type="button"
          className="pointer-events-auto bg-ice-500 text-white shadow-md rounded-w-pill h-14 pl-6 pr-8 flex items-center gap-2 hover:bg-ice-700 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
          aria-label="새 팝업 등록"
        >
          <Icon name="add_photo_alternate" className="text-[24px]" aria-hidden="true" />
          <span className="text-card-emphasis font-bold">새 팝업 등록</span>
        </button>
      </div>
    </MobileContainer>
  );
}
