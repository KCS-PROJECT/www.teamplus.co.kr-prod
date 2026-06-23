'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { SubmainAppBar } from '@/components/layout/SubmainAppBar';
import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { MESSAGES } from '@/lib/messages';
import { api } from '@/services/api-client';
import { useRefreshSubscription, REFRESH_KEYS } from '@/lib/refresh-bus';

import { usePageReady } from '@/hooks/usePageReady';
interface Notice {
  id: string;
  title: string;
  category?: string;
  createdAt: string;
  isPublished: boolean;
}

type StatusFilter = 'all' | 'published' | 'hidden';

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'published', label: '게시 중' },
  { key: 'hidden', label: '비공개' },
];

export default function NoticesManagePage() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const { navigate } = useNavigation();

  const loadNotices = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<{ data: Notice[] }>('/notices/admin/list');
      setNotices(res.data?.data ?? []);
    } catch {
      setNotices([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotices();
  }, [loadNotices]);

  // [추가 2026-05-15 T07↔T02] 공지 mutation 후 자동 갱신.
  //   - notices-create 가 'notices' 와 ['notices', 'admin'] 둘 다 발화.
  //   - 본 페이지는 'notices' prefix 만 구독해도 양쪽 모두 수신 (prefix 매칭).
  useRefreshSubscription(REFRESH_KEYS.NOTICES, () => {
    void loadNotices();
  });

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  };

  const summary = useMemo(() => {
    const total = notices.length;
    const published = notices.filter((n) => n.isPublished).length;
    return { total, published, hidden: total - published };
  }, [notices]);

  const filtered = useMemo(() => {
    if (filter === 'published') return notices.filter((n) => n.isPublished);
    if (filter === 'hidden') return notices.filter((n) => !n.isPublished);
    return notices;
  }, [notices, filter]);

  const handleCreate = useCallback(() => {
    navigate('/notice/create');
  }, [navigate]);

  const handleEdit = useCallback(
    (id: string) => {
      navigate(`/notices-create?edit=${id}`);
    },
    [navigate],
  );

  return (
    <MobileContainer hasBottomNav>
      <SubmainAppBar title="공지 관리" />

      <main className="flex-1 overflow-y-auto px-5 pt-6 pb-28">
        {/* Hero 섹션 */}
        <section className="mb-6">
          <p className="text-card-meta font-bold uppercase tracking-[0.18em] text-ice-500 mb-2">
            Notice Center
          </p>
          <h2 className="text-3xl font-black text-wtext-1 dark:text-white leading-tight tracking-tight">
            공지사항
            <br />
            전체 관리
          </h2>
          <p className="mt-3 text-card-body font-medium text-wtext-3 dark:text-rink-300">
            전달이 필요한 메시지를 한눈에 확인하고 등록하세요.
          </p>
        </section>

        {/* 서머리 카드 3열 */}
        <section aria-label="공지 요약" className="mb-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 p-4 shadow-sm">
            <p className="text-card-meta font-semibold text-wtext-3 dark:text-rink-300">
              전체
            </p>
            <p className="mt-1 text-2xl font-black text-wtext-1 dark:text-white text-right tabular-nums">
              {isLoading ? '—' : summary.total}
            </p>
          </div>
          <div className="rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 p-4 shadow-sm">
            <p className="text-card-meta font-semibold text-wtext-3 dark:text-rink-300">
              게시 중
            </p>
            <p className="mt-1 text-2xl font-black text-ice-500 text-right tabular-nums">
              {isLoading ? '—' : summary.published}
            </p>
          </div>
          <div className="rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 p-4 shadow-sm">
            <p className="text-card-meta font-semibold text-wtext-3 dark:text-rink-300">
              비공개
            </p>
            <p className="mt-1 text-2xl font-black text-wtext-3 dark:text-rink-300 text-right tabular-nums">
              {isLoading ? '—' : summary.hidden}
            </p>
          </div>
        </section>

        {/* 상태 필터 칩 */}
        <section aria-label="상태 필터" className="mb-5">
          <div className="flex gap-2 overflow-x-auto hide-scrollbar">
            {STATUS_FILTERS.map(({ key, label }) => {
              const count =
                key === 'all' ? summary.total : key === 'published' ? summary.published : summary.hidden;
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
                    className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-w-pill text-card-meta font-bold tabular-nums ${
                      active ? 'bg-white/20 text-white' : 'bg-wline-2 dark:bg-rink-700 text-wtext-3 dark:text-rink-300'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 섹션 헤더 + 신규 등록 버튼 */}
        <section aria-labelledby="notices-heading">
          <div className="mb-4 flex items-end justify-between">
            <h3
              id="notices-heading"
              className="text-xl font-bold text-wtext-1 dark:text-white tracking-tight"
            >
              공지 목록
            </h3>
            <button
              type="button"
              onClick={handleCreate}
              className="inline-flex h-11 items-center gap-1 rounded-xl bg-ice-500 px-4 text-card-body font-bold text-white shadow-md hover:bg-ice-700 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
            >
              <Icon name="add" className="text-[18px]" aria-hidden="true" />
              신규 공지
            </button>
          </div>

          {isLoading ? null : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-wline dark:border-rink-700 bg-white dark:bg-rink-800 p-10 text-center shadow-sm">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-w-pill bg-wline-2 dark:bg-rink-700">
                <Icon
                  name="campaign"
                  className="text-[28px] text-wtext-3 dark:text-rink-300"
                  aria-hidden="true"
                />
              </div>
              <p className="mt-4 text-card-emphasis font-bold text-wtext-2 dark:text-rink-100">
                {filter === 'all' ? MESSAGES.empty('공지사항') : '해당 상태의 공지가 없습니다.'}
              </p>
              <p className="mt-1 text-card-body font-medium text-wtext-3 dark:text-rink-300">
                첫 공지를 등록해 회원에게 소식을 전달해보세요.
              </p>
              <button
                type="button"
                onClick={handleCreate}
                className="mt-5 inline-flex h-11 items-center gap-1 rounded-xl bg-ice-500 px-5 text-card-body font-bold text-white shadow-md hover:bg-ice-700 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
              >
                <Icon name="add" className="text-[18px]" aria-hidden="true" />
                공지 등록하기
              </button>
            </div>
          ) : (
            <ul className="space-y-3" aria-label="공지 목록">
              {filtered.map((notice) => (
                <li
                  key={notice.id}
                  className="rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 shadow-sm hover:shadow-md active:brightness-95 transition-shadow motion-reduce:transition-none"
                >
                  <div className="p-5">
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-w-pill px-2.5 py-1 text-card-meta font-bold ${
                          notice.isPublished
                            ? 'bg-ice-500/10 text-ice-500 dark:bg-ice-500/20'
                            : 'bg-wline-2 text-wtext-3 dark:bg-rink-700 dark:text-rink-100'
                        }`}
                      >
                        <span
                          className={`size-1.5 rounded-w-pill ${
                            notice.isPublished ? 'bg-ice-500' : 'bg-wtext-4 dark:bg-wbg0'
                          }`}
                          aria-hidden="true"
                        />
                        {notice.isPublished ? '게시 중' : '비공개'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-card-emphasis font-bold text-wtext-1 dark:text-white leading-snug line-clamp-2">
                          {notice.title}
                        </h4>
                        <div className="mt-1 flex items-center gap-2 text-card-meta font-semibold text-wtext-3 dark:text-rink-300">
                          {notice.category && (
                            <>
                              <span className="inline-flex items-center rounded-md bg-wline-2 dark:bg-rink-700 px-2 py-0.5 text-card-meta font-bold text-wtext-2 dark:text-rink-100">
                                {notice.category}
                              </span>
                              <span className="text-wtext-4 dark:text-rink-500" aria-hidden="true">·</span>
                            </>
                          )}
                          <span className="tabular-nums">{formatDate(notice.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleEdit(notice.id)}
                        className="inline-flex h-11 items-center gap-1 rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 px-4 text-card-body font-bold text-wtext-2 dark:text-rink-100 hover:bg-wbg dark:hover:bg-rink-700 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
                        aria-label={`${notice.title} 편집`}
                      >
                        <Icon name="edit" className="text-[16px]" aria-hidden="true" />
                        수정하기
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </MobileContainer>
  );
}
