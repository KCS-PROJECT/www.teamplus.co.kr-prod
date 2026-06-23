'use client';

/**
 * RecentNoticesSection — 코치/감독 홈 공지사항 카드
 *  - GET /notices?limit=3&isActive=true 호출
 *  - 핀고정 우선, 최신순 정렬, 상위 3건 미리보기
 *  - "전체 보기" → /notices/list
 *  - DESIGN.md Pattern B 카드 (wsurface · sh-1 · ice-500)
 */

import { useEffect, useState } from 'react';

import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { SectionHead } from '@/components/wallet';
import { api } from '@/services/api-client';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import { useSelectedChild } from '@/contexts/SelectedChildContext';

interface NoticeItem {
  id: string;
  title: string;
  type?: string | null;
  isPinned?: boolean;
  createdAt: string;
}

interface ApiDataWrapper<T> {
  success?: boolean;
  data?: T;
}

function unwrap<T>(payload: unknown): T | null {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return ((payload as ApiDataWrapper<T>).data ?? null) as T | null;
  }
  return (payload ?? null) as T | null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return sameYear
    ? d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
    : d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  EVENT: { label: '이벤트', cls: 'bg-sun-100 text-rink-800' },
  URGENT: { label: '긴급', cls: 'bg-flame-100 text-flame-500' },
  INFO: { label: '안내', cls: 'bg-ice-50 text-ice-700' },
};

interface RecentNoticesSectionProps {
  /**
   * 섹션 헤더 문구. 미지정 시 "팀 공지사항"(MESSAGES.dashboard.teamNotices).
   * 학부모 대시보드는 "공지사항"(MESSAGES.dashboard.notices)을 전달.
   */
  title?: string;
  /**
   * "전체보기" 이동 경로. 기본 /team-notices(조회 전용).
   * 작성/수정/삭제 권한 역할(감독·코치·오픈클래스)은 관리 페이지 /director-notices 를 전달.
   */
  viewAllHref?: string;
  /**
   * [2026-05-11 Phase 2] CHILD 페이지 헤더 가독성 보강 — SectionHead 에 그대로 전달.
   *  카드 내부는 동일 (학부모와 일관성 유지 — 사용자 의도: "디자인 그대로, 헤더 글씨만 크게").
   */
  variant?: 'default' | 'child';
  /**
   * 공지 작성 진입 콜백. 전달 시 카드 하단에 "공지 작성하기" 버튼 노출.
   * 작성 권한 있는 역할(감독/코치)의 대시보드에서만 전달 — 학부모/child 는 미전달(버튼 미노출).
   */
  onCreateNotice?: () => void;
}

export function RecentNoticesSection({ title, viewAllHref = '/team-notices', variant = 'default', onCreateNotice }: RecentNoticesSectionProps = {}) {
  const { navigate } = useNavigation();
  const { selectedChildId } = useSelectedChild();
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // [2026-05-21] 홈 하단 공지 섹션 — 소속 팀 공지(scope=team)만 노출.
      // 선택 자녀 소속 팀 기준 필터 — childId 전송(null=자녀0명 시 미전송, 백엔드 전체 폴백).
      const res = await api.get<NoticeItem[] | { notices?: NoticeItem[] } | ApiDataWrapper<NoticeItem[] | { notices?: NoticeItem[] }>>(
        '/notices',
        {
          params: {
            limit: 5,
            page: 1,
            isActive: true,
            scope: 'team',
            ...(selectedChildId ? { childId: selectedChildId } : {}),
          },
          retry: false,
        },
      );
      if (cancelled) return;
      const payload = res.success ? unwrap<NoticeItem[] | { notices?: NoticeItem[] }>(res.data) : null;
      const list = Array.isArray(payload)
        ? payload
        : Array.isArray((payload as { notices?: NoticeItem[] })?.notices)
          ? (payload as { notices: NoticeItem[] }).notices
          : [];
      // 핀고정 우선 + 최신순
      const sorted = [...list].sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      // [2026-06-09] 대시보드 공지 노출 3 → 5개.
      setNotices(sorted.slice(0, 5));
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedChildId]);

  return (
    <>
      <SectionHead
        title={title ?? MESSAGES.dashboard.teamNotices}
        action="전체보기 ›"
        onActionClick={() => navigate(viewAllHref)}
        variant={variant}
      />
      <div className="px-4 sm:px-5">
        <div className="rounded-w-xl bg-wsurface dark:bg-rink-800 shadow-sh-1 border border-wline dark:border-rink-700 overflow-hidden">
          {isLoading ? null : notices.length === 0 ? (
            <div className="px-5 py-8 flex flex-col items-center gap-2 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-w-pill bg-wline-2 dark:bg-rink-700">
                <Icon name="campaign" className="text-2xl text-wtext-3 dark:text-rink-300" aria-hidden="true" />
              </div>
              <p className="text-card-title font-semibold text-wtext-2 dark:text-rink-100">
                등록된 공지가 없습니다
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-wline-2 dark:divide-rink-700">
              {notices.map((n) => {
                const badge = n.type ? TYPE_BADGE[n.type.toUpperCase()] : undefined;
                return (
                  <li key={n.id}>
                    {/* 1줄 레이아웃 — [아이콘][배지][제목 flex-1 truncate][날짜 우측].
                         날짜를 우측 정렬해 한 줄에 표시(꺽쇠 제거 — 카드 전체가 클릭 영역). */}
                    <button
                      type="button"
                      onClick={() => navigate(`/notice/${n.id}`)}
                      className="w-full px-5 py-3 flex items-center gap-2.5 text-left hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors duration-150 motion-reduce:transition-none"
                    >
                      {n.isPinned ? (
                        <Icon
                          name="push_pin"
                          className="text-[16px] text-flame-500 shrink-0"
                          aria-label="고정"
                        />
                      ) : (
                        <Icon
                          name="campaign"
                          className="text-[16px] text-ice-500 shrink-0"
                          aria-hidden="true"
                        />
                      )}
                      {badge && (
                        <span className={cn('shrink-0 rounded-w-pill px-2 py-0.5 text-card-meta font-extrabold', badge.cls)}>
                          {badge.label}
                        </span>
                      )}
                      <p className="min-w-0 flex-1 truncate text-card-title font-semibold text-wtext-1 dark:text-white">
                        {n.title}
                      </p>
                      <span className="shrink-0 text-card-meta font-num tabular-nums text-wtext-3 dark:text-rink-300">
                        {formatDate(n.createdAt)}
                      </span>
                      <Icon name="chevron_right" className="shrink-0 text-[18px] text-wtext-4 dark:text-rink-500" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {!isLoading && onCreateNotice && (
            <button
              type="button"
              onClick={onCreateNotice}
              className="w-full flex items-center justify-center gap-1.5 border-t border-wline-2 dark:border-rink-700 px-5 py-3.5 text-card-body font-extrabold text-ice-500 hover:bg-ice-500/5 dark:hover:bg-ice-500/10 transition-colors duration-150 motion-reduce:transition-none"
              aria-label="공지 작성하기"
            >
              <Icon name="edit" className="text-[18px]" aria-hidden="true" />
              공지 작성하기
            </button>
          )}
        </div>
      </div>
    </>
  );
}
