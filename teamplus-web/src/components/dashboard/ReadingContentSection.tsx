'use client';

/**
 * ReadingContentSection — 역할 대시보드 공통 "포스트" 섹션.
 * 설계 SoT: docs/Planning/SPEC_DASHBOARD_READING_CONTENT.md §2-4
 *
 * - 데이터: GET /blog?page=1&pageSize=3 (공개) — 기존 API 정렬(pinned DESC, createdAt DESC) 그대로.
 * - 구성: 대표 글 1건(16:9 커버) + 간결한 글 최대 2건(고정 크기 썸네일 행). 큰 카드 3개·캐러셀 금지.
 * - 0건/요청 실패 시 섹션 전체 미노출(null) — 빈 여백·오류 toast 없음.
 * - 대시보드 usePageReady 합성에 포함하지 않는다(선택적 콘텐츠) — onReady 없음.
 * - placement 는 배치 문맥 구분용일 뿐 콘텐츠 밀도·시각 강조를 바꾸지 않는다.
 */

import { useEffect, useState } from 'react';

import { NavLink, useNavigation } from '@/components/ui/NavLink';
import { SectionHead } from '@/components/wallet';
import {
  BLOG_CATEGORY_META,
  BlogCover,
  formatBlogDate,
} from '@/components/contents/ContentCard';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { getBlogList, type BlogListItem } from '@/services/blog.service';

interface ReadingContentSectionProps {
  /** promoted: 빈 대시보드 승격 위치 / footer: 정상 상태 최하단 — 배치 문맥 구분만 담당 */
  placement: 'promoted' | 'footer';
  /** ICETIMES flat 테마 — 대시보드 다른 섹션과 동일하게 적용 */
  iceTheme?: boolean;
}

type SectionStatus = 'loading' | 'ready' | 'hidden';

function MetaLine({ post }: { post: BlogListItem }) {
  const meta = BLOG_CATEGORY_META[post.category] ?? BLOG_CATEGORY_META.NEWS;
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 text-[12px]">
      <span className="font-bold text-it-blue-600 dark:text-it-blue-200">
        {meta.label}
      </span>
      <span aria-hidden="true" className="text-it-ink-300 dark:text-rink-500">
        ·
      </span>
      <time className="tabular-nums text-it-ink-400 dark:text-it-ink-300">
        {formatBlogDate(post)}
      </time>
    </div>
  );
}

export function ReadingContentSection({
  placement,
  iceTheme = false,
}: ReadingContentSectionProps) {
  const { navigate } = useNavigation();
  const [status, setStatus] = useState<SectionStatus>('loading');
  const [posts, setPosts] = useState<BlogListItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await getBlogList({ page: 1, pageSize: 3 });
        if (cancelled) return;
        if (result.items.length === 0) {
          setStatus('hidden');
          return;
        }
        setPosts(result.items);
        setStatus('ready');
      } catch {
        // 선택적 콘텐츠 — 실패 시 조용히 섹션 제거, 사용자 오류 표시 없음.
        if (!cancelled) setStatus('hidden');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'hidden') return null;

  const [featured, ...rest] = posts;
  const compactPosts = rest.slice(0, 2);

  return (
    <section
      data-placement={placement}
      className={cn(iceTheme && 'mt-2 bg-it-surface dark:bg-it-blue-950')}
      aria-label={MESSAGES.contents.dashboardTitle}
    >
      <SectionHead
        title={MESSAGES.contents.dashboardTitle}
        action={`${MESSAGES.contents.viewAll} ›`}
        onActionClick={() => navigate('/contents')}
        iceTheme={iceTheme}
      />
      <div className={cn(iceTheme ? 'px-5 pb-5' : 'px-4 sm:px-5 pb-4')}>
        {status === 'loading' ? (
          // 최종 높이를 예약한 스켈레톤 — 데이터 교체 시 레이아웃 이동(CLS) 차단.
          <div role="status" aria-busy="true">
            <span className="sr-only">{MESSAGES.common.loading}</span>
            <div aria-hidden="true" className="animate-pulse motion-reduce:animate-none">
              <div className="aspect-video w-full rounded-w-lg bg-it-fill dark:bg-rink-700/40" />
              <div className="mt-3 h-3 w-24 rounded bg-it-fill dark:bg-rink-700/40" />
              <div className="mt-2 h-4 w-4/5 rounded bg-it-fill dark:bg-rink-700/40" />
              {[0, 1].map((i) => (
                <div key={i} className="mt-4 flex items-center gap-3">
                  <div className="aspect-[16/10] w-[76px] shrink-0 rounded-w-lg bg-it-fill dark:bg-rink-700/40" />
                  <div className="min-w-0 flex-1">
                    <div className="h-3 w-20 rounded bg-it-fill dark:bg-rink-700/40" />
                    <div className="mt-2 h-4 w-3/4 rounded bg-it-fill dark:bg-rink-700/40" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            {/* 대표 글 — 커버 16:9 + 카테고리·날짜 + 제목 2줄 + 요약 2줄 */}
            <NavLink
              href={`/contents/${encodeURIComponent(featured.slug)}`}
              className="block rounded-w-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/50"
              aria-label={featured.title}
            >
              <BlogCover post={featured} ratioClassName="aspect-video" />
              <div className="mt-3">
                <MetaLine post={featured} />
                <p className="mt-1 line-clamp-2 text-[16px] font-bold leading-snug text-it-ink-800 dark:text-white">
                  {featured.title}
                </p>
                {featured.summary && (
                  <p className="mt-1 line-clamp-2 text-[13.5px] leading-relaxed text-it-ink-500 dark:text-rink-300">
                    {featured.summary}
                  </p>
                )}
              </div>
            </NavLink>

            {/* 간결한 글 최대 2건 — 고정 크기 썸네일 + 카테고리·날짜 + 제목 2줄 (요약·조회수 없음) */}
            {compactPosts.length > 0 && (
              <ul className="mt-4 space-y-3">
                {compactPosts.map((post) => (
                  <li key={post.id}>
                    <NavLink
                      href={`/contents/${encodeURIComponent(post.slug)}`}
                      className="flex min-h-[56px] items-center gap-3 rounded-w-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/50"
                      aria-label={post.title}
                    >
                      <div className="w-[76px] shrink-0">
                        <BlogCover post={post} iconClassName="text-xl" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <MetaLine post={post} />
                        <p className="mt-0.5 line-clamp-2 text-[14px] font-bold leading-snug text-it-ink-800 dark:text-white">
                          {post.title}
                        </p>
                      </div>
                    </NavLink>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
