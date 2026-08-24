'use client';

/**
 * 포스트 목록 카드 — /contents 목록 전용 16:10 커버 카드.
 * 설계 SoT: docs/Planning/SPEC_DASHBOARD_READING_CONTENT.md §2-2
 *
 * 렌더 계약(Accepted Decision 9): 커버는 next/image 미사용 — 일반 <img> + lazy + 고정 비율 컨테이너.
 * 커버 도메인이 next.config images.remotePatterns 에 없어 next/image 는 런타임 오류가 난다.
 */

import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import type { BlogCategory, BlogListItem } from '@/services/blog.service';

/** 카테고리 라벨·아이콘 — 아이콘은 Material Symbols 서브셋에 이미 포함된 glyph 만 사용 */
export const BLOG_CATEGORY_META: Record<
  BlogCategory,
  { label: string; icon: string }
> = {
  NEWS: { label: MESSAGES.contents.categories.NEWS, icon: 'campaign' },
  GUIDE: { label: MESSAGES.contents.categories.GUIDE, icon: 'menu_book' },
  EVENT: { label: MESSAGES.contents.categories.EVENT, icon: 'celebration' },
  PRESS: { label: MESSAGES.contents.categories.PRESS, icon: 'campaign' },
};

/** 표시 일자 — publishedAt ?? createdAt, YYYY.MM.DD */
export function formatBlogDate(post: Pick<BlogListItem, 'publishedAt' | 'createdAt'>): string {
  const raw = post.publishedAt ?? post.createdAt;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}.${mm}.${dd}`;
}

/** 커버 이미지 또는 토큰 기반 중립 placeholder — 고정 비율 컨테이너로 CLS 차단 */
export function BlogCover({
  post,
  ratioClassName = 'aspect-[16/10]',
  iconClassName = 'text-4xl',
  className,
}: {
  post: Pick<BlogListItem, 'coverImageUrl' | 'title' | 'category'>;
  ratioClassName?: string;
  iconClassName?: string;
  className?: string;
}) {
  const meta = BLOG_CATEGORY_META[post.category] ?? BLOG_CATEGORY_META.NEWS;
  return (
    <div
      className={cn(
        ratioClassName,
        'w-full overflow-hidden rounded-w-lg bg-it-fill dark:bg-rink-700/40',
        className,
      )}
    >
      {post.coverImageUrl ? (
        // Accepted Decision 9 — 커버 도메인이 images.remotePatterns 미등록이라 next/image 는
        // 런타임 오류. 고정 비율 부모 + lazy 로 CLS·성능을 확보한다.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.coverImageUrl}
          alt={post.title}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center"
          role="img"
          aria-label={`${meta.label} ${MESSAGES.contents.pageTitle}`}
        >
          <Icon
            name={meta.icon}
            className={cn(iconClassName, 'text-it-ink-300 dark:text-rink-500')}
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
}

interface ContentCardProps {
  post: BlogListItem;
  className?: string;
}

export function ContentCard({ post, className }: ContentCardProps) {
  const meta = BLOG_CATEGORY_META[post.category] ?? BLOG_CATEGORY_META.NEWS;
  return (
    <NavLink
      href={`/contents/${encodeURIComponent(post.slug)}`}
      className={cn(
        'block rounded-w-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/50',
        className,
      )}
      aria-label={post.title}
    >
      <BlogCover post={post} />
      <div className="mt-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
          <span className="font-bold text-it-blue-600 dark:text-it-blue-200">
            {meta.label}
          </span>
          {post.pinned && (
            <span className="inline-flex items-center gap-0.5 font-bold text-it-ink-500 dark:text-rink-200">
              <Icon name="push_pin" className="text-[12px]" aria-hidden="true" />
              {MESSAGES.contents.pinned}
            </span>
          )}
          <time className="tabular-nums text-it-ink-400 dark:text-it-ink-300">
            {formatBlogDate(post)}
          </time>
        </div>
        <h3 className="mt-1 line-clamp-2 text-[16px] font-bold leading-snug text-it-ink-800 dark:text-white">
          {post.title}
        </h3>
        {post.summary && (
          <p className="mt-1 line-clamp-2 text-[13.5px] leading-relaxed text-it-ink-500 dark:text-rink-300">
            {post.summary}
          </p>
        )}
      </div>
    </NavLink>
  );
}
