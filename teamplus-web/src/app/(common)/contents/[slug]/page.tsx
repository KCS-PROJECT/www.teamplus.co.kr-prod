'use client';

/**
 * 포스트 상세 (/contents/[slug]) — 발행된 BlogPost 읽기 화면.
 * 설계 SoT: docs/Planning/SPEC_DASHBOARD_READING_CONTENT.md §2-3
 *
 * HTML 방어: backend 저장 시 sanitizeBlogHtml + web 렌더 전 DOMPurify 이중 방어.
 * 허용 태그/속성은 backend allowlist(sanitize.util.ts blogHtmlOptions)와 동일 — 절대 넓히지 않는다.
 * 조회수 비콘: 브라우저 세션당 글 1회(sessionStorage), fire-and-forget.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { NavLink } from '@/components/ui/NavLink';
import { BLOG_CATEGORY_META, BlogCover, formatBlogDate } from '@/components/contents/ContentCard';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useContentLinkHandler } from '@/hooks/useContentLinks';
import { MESSAGES } from '@/lib/messages';
import { sanitizeBlogHtmlForRender } from '@/lib/blog-sanitize';
import { cn } from '@/lib/utils';
import {
  BlogNotFoundError,
  getBlogBySlug,
  recordBlogView,
  type BlogDetail,
} from '@/services/blog.service';

// 본문 살균은 `@/lib/blog-sanitize` 전용 인스턴스 사용 — 태그별 속성 allowlist 로
// backend `sanitizeBlogHtml` 와 1:1 정합 (테스트: lib/__tests__/blog-sanitize.test.ts).

/** 읽기 시간 — HTML 태그 제거 후 한국어 기준 분당 500자, 최소 1분 */
function estimateReadingMinutes(html: string): number {
  const text = html.replace(/<[^>]*>/g, '').replace(/\s+/g, '');
  return Math.max(1, Math.round(text.length / 500));
}

type ScreenStatus = 'loading' | 'ready' | 'notFound' | 'error';

/**
 * 조회수 비콘 세션 가드의 in-memory fallback — sessionStorage 접근이 차단된 환경
 * (프라이빗 모드 등)에서도 탭 생명주기 동안 slug 당 1회만 전송한다 (Codex R6-2 #2).
 */
const viewedSlugsInMemory = new Set<string>();

export default function ContentDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === 'string' ? decodeURIComponent(params.slug) : '';

  const [post, setPost] = useState<BlogDetail | null>(null);
  const [status, setStatus] = useState<ScreenStatus>('loading');
  const handleContentLinkClick = useContentLinkHandler();

  // forceNative 웹 헤더 규약의 필수 짝 — 네이티브 AppBar 명시 숨김 + 상세라 BottomNav 숨김.
  //   미호출 시 직전 화면의 네이티브 크롬 상태가 잔존해 앱에서 이중 헤더/뒤로가기 어긋남.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
    isDataLoaded: status !== 'loading',
  });

  const loadPost = useCallback(async () => {
    if (!slug) {
      setStatus('notFound');
      return;
    }
    setStatus('loading');
    try {
      const detail = await getBlogBySlug(slug);
      setPost(detail);
      setStatus('ready');
    } catch (error) {
      setStatus(error instanceof BlogNotFoundError ? 'notFound' : 'error');
    }
  }, [slug]);

  useEffect(() => {
    void loadPost();
  }, [loadPost]);

  // 조회수 비콘 — 세션당 글 1회. 실패해도 열람을 막지 않고, unmount 후 상태 갱신 없음(fire-and-forget).
  //   1차 가드 sessionStorage(브라우저 세션 지속) + 2차 in-memory Set(저장소 차단 환경 fallback).
  useEffect(() => {
    if (status !== 'ready' || !slug) return;
    if (viewedSlugsInMemory.has(slug)) return;
    const key = `blog-viewed:${slug}`;
    try {
      if (sessionStorage.getItem(key)) {
        viewedSlugsInMemory.add(slug);
        return;
      }
      sessionStorage.setItem(key, '1');
    } catch {
      // sessionStorage 불가 — in-memory 가드만으로 1회 보장
    }
    viewedSlugsInMemory.add(slug);
    void recordBlogView(slug);
  }, [status, slug]);

  usePageReady(status !== 'loading');

  const header = <PageAppBar title={MESSAGES.contents.pageTitle} forceNative />;

  if (status === 'loading') {
    return (
      <MobileContainer hasBottomNav={false}>
        {header}
        <div className="flex flex-1 flex-col bg-it-canvas dark:bg-puck">
          <div className="mt-2 animate-pulse bg-it-surface px-5 pt-5 pb-6 dark:bg-rink-800 motion-reduce:animate-none" aria-hidden="true">
            <div className="h-3 w-16 rounded bg-it-fill dark:bg-rink-700/40" />
            <div className="mt-3 h-5 w-4/5 rounded bg-it-fill dark:bg-rink-700/40" />
            <div className="mt-2 h-3 w-32 rounded bg-it-fill dark:bg-rink-700/40" />
            <div className="mt-4 aspect-video w-full rounded-w-lg bg-it-fill dark:bg-rink-700/40" />
            <div className="mt-4 h-3 w-full rounded bg-it-fill dark:bg-rink-700/40" />
            <div className="mt-2 h-3 w-11/12 rounded bg-it-fill dark:bg-rink-700/40" />
          </div>
        </div>
      </MobileContainer>
    );
  }

  if (status !== 'ready' || !post) {
    const isTransient = status === 'error';
    return (
      <MobileContainer hasBottomNav={false}>
        {header}
        <div className="flex flex-1 flex-col items-center justify-center bg-it-canvas py-20 dark:bg-puck">
          <Icon
            name={isTransient ? 'wifi_off' : 'error_outline'}
            className="mb-4 text-6xl text-it-ink-300 dark:text-rink-500"
            aria-hidden="true"
          />
          <p className="px-8 text-center text-[15px] font-semibold text-it-ink-600 dark:text-rink-100">
            {isTransient ? MESSAGES.contents.loadFailed : MESSAGES.contents.notFound}
          </p>
          {!isTransient && (
            <p className="mt-1 px-8 text-center text-[13px] text-it-ink-400 dark:text-rink-300">
              {MESSAGES.contents.notFoundHint}
            </p>
          )}
          {isTransient && (
            <button
              type="button"
              onClick={() => void loadPost()}
              className="mt-4 h-11 rounded-w-md bg-it-blue-500 px-6 font-semibold text-white transition-colors motion-reduce:transition-none hover:bg-it-blue-600 active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/50"
            >
              {MESSAGES.contents.retry}
            </button>
          )}
          <NavLink
            href="/contents"
            className="mt-3 text-[14px] font-medium text-it-blue-500 hover:underline"
          >
            {MESSAGES.contents.backToList}
          </NavLink>
        </div>
      </MobileContainer>
    );
  }

  const meta = BLOG_CATEGORY_META[post.category] ?? BLOG_CATEGORY_META.NEWS;
  const readingMinutes = estimateReadingMinutes(post.content);

  return (
    <MobileContainer hasBottomNav={false} className="selectable-text">
      {header}

      <main
        className="flex-1 overflow-y-auto bg-it-canvas pb-10 dark:bg-puck"
        role="main"
        aria-label={MESSAGES.contents.pageTitle}
      >
        <article className="mt-2 bg-it-surface px-5 pt-5 pb-8 dark:bg-rink-800">
          {/* 카테고리 + 추천 */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[12px] font-bold text-it-blue-600 dark:text-it-blue-200">
              {meta.label}
            </span>
            {post.pinned && (
              <span className="inline-flex items-center gap-0.5 text-[12px] font-bold text-it-ink-500 dark:text-rink-200">
                <Icon name="push_pin" className="text-[12px]" aria-hidden="true" />
                {MESSAGES.contents.pinned}
              </span>
            )}
          </div>

          {/* 제목 */}
          <h1 className="mt-2 text-[20px] font-extrabold leading-snug tracking-[-0.02em] text-it-ink-800 dark:text-white">
            {post.title}
          </h1>

          {/* 날짜 · 읽기 시간 */}
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-it-ink-400 dark:text-it-ink-300">
            <time className="tabular-nums">{formatBlogDate(post)}</time>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-0.5">
              <Icon name="schedule" className="text-[13px]" aria-hidden="true" />
              {MESSAGES.contents.readingMinutes(readingMinutes)}
            </span>
          </div>

          {/* 커버 */}
          {post.coverImageUrl && (
            <BlogCover post={post} ratioClassName="aspect-video" className="mt-4" />
          )}

          {/* 본문 — 이중 살균 HTML. 이미지·코드 블록 렌더 규칙은 컨테이너 CSS 로 부여.
              앵커 클릭은 본문 외부 링크 공통 규약(useContentLinkHandler)이 처리. */}
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- 클릭 위임 대상은 내부 앵커(키보드 접근 가능)뿐 */}
          <div
            onClick={handleContentLinkClick}
            className={cn(
              'mt-5 text-[15px] leading-relaxed text-it-ink-800 dark:text-it-ink-100 break-words',
              '[&_p]:my-3 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
              '[&_h1]:mt-7 [&_h1]:mb-3 [&_h1]:text-[19px] [&_h1]:font-extrabold',
              '[&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-[17px] [&_h2]:font-extrabold',
              '[&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-[16px] [&_h3]:font-bold',
              '[&_h4]:mt-4 [&_h4]:mb-2 [&_h4]:text-[15px] [&_h4]:font-bold',
              '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1',
              '[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1',
              '[&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-it-line dark:[&_blockquote]:border-rink-700 [&_blockquote]:pl-4 [&_blockquote]:text-it-ink-500 dark:[&_blockquote]:text-rink-300',
              '[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-w-lg [&_pre]:bg-it-fill dark:[&_pre]:bg-rink-700/40 [&_pre]:p-4 [&_pre]:text-[13px]',
              '[&_code]:text-[13.5px]',
              '[&_img]:my-4 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-w-lg',
              '[&_hr]:my-6 [&_hr]:border-it-line dark:[&_hr]:border-rink-700',
              '[&_a]:text-it-blue-600 dark:[&_a]:text-it-blue-200 [&_a]:underline',
              '[&_strong]:font-extrabold [&_b]:font-extrabold',
            )}
            dangerouslySetInnerHTML={{ __html: sanitizeBlogHtmlForRender(post.content) }}
          />

          {/* 목록으로 */}
          <div className="mt-8 border-t border-it-line pt-5 dark:border-rink-700">
            <NavLink
              href="/contents"
              className="flex h-11 w-full items-center justify-center gap-1 rounded-w-md border border-it-line bg-it-fill text-[13px] font-bold text-it-ink-600 transition-colors motion-reduce:transition-none hover:bg-it-line/60 active:brightness-95 dark:border-rink-700 dark:bg-rink-700/40 dark:text-rink-100 dark:hover:bg-rink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/50"
            >
              <Icon name="chevron_right" className="rotate-180 text-[18px]" aria-hidden="true" />
              {MESSAGES.contents.backToList}
            </NavLink>
          </div>
        </article>
      </main>
    </MobileContainer>
  );
}
