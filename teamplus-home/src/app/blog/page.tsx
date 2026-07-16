import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Pin, Eye, Newspaper } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { StoreBadge } from '@/components/ui/StoreBadge';
import {
  getBlogList,
  BLOG_CATEGORY_META,
  BLOG_CATEGORIES,
  type BlogListItem,
  type BlogCategory,
} from '@/lib/blog-api';
import { APP_DOWNLOAD } from '@/lib/content';
import { cn } from '@/lib/utils';

// 발행 글을 재배포 없이 반영 — ISR(5분).
export const revalidate = 300;

const PAGE_TITLE = '블로그';
const PAGE_DESC =
  '아이스하키 클럽 운영 노하우, 팀플러스 소식·가이드·이벤트·보도자료를 확인하세요.';
const PAGE_SIZE = 12;

/** 히어로 신뢰 신호 — /news·/features·/solution·/contact 와 동일 패턴. 실제 카테고리(소식·가이드·이벤트·보도자료) 기반. */
const HERO_TRUST = ['클럽 운영 노하우 가이드', '신규 기능·업데이트 소식', '이벤트·보도자료 아카이브'];

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESC,
  alternates: { canonical: '/blog' },
  openGraph: { url: '/blog', title: PAGE_TITLE, description: PAGE_DESC },
};

type SearchParams = Promise<{ page?: string; category?: string }>;

function isBlogCategory(v: string | undefined): v is BlogCategory {
  return !!v && (BLOG_CATEGORIES as string[]).includes(v);
}

function formatDate(iso: string) {
  return new Date(iso)
    .toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\.$/, '')
    .replace(/\s/g, '');
}

/** 주요 글 — 큰 커버 카드. */
function FeaturedCard({ post }: { post: BlogListItem }) {
  const meta = BLOG_CATEGORY_META[post.category];
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-wline bg-wsurface shadow-sh-1 transition-all duration-300 hover:-translate-y-1 hover:shadow-sh-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-wbg">
        {post.coverImageUrl ? (
          // backend 업로드 이미지(외부 오리진) — next/image 대신 일반 img 사용
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.coverImageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-ice-50/60 text-ice-500">
            <Newspaper size={30} strokeWidth={1.5} />
          </div>
        )}
        <div className="absolute left-3.5 top-3.5 flex items-center gap-1.5">
          {post.pinned && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-bold text-ice-700 ring-1 ring-ice-100 backdrop-blur">
              <Pin size={10} /> 고정
            </span>
          )}
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1',
              meta.chip,
            )}
          >
            {meta.label}
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-6">
        <h3 className="line-clamp-2 text-lg font-bold leading-snug text-rink-900 transition-colors group-hover:text-ice-600">
          {post.title}
        </h3>
        <p className="mt-2.5 line-clamp-2 flex-1 text-sm leading-relaxed text-wtext-3">
          {post.summary}
        </p>
        <div className="mt-5 flex items-center justify-between border-t border-wline pt-4 text-xs text-wtext-4">
          <span className="flex items-center gap-3">
            <span className="font-mono">{formatDate(post.createdAt)}</span>
            <span className="inline-flex items-center gap-1">
              <Eye size={12} /> {post.viewCount.toLocaleString()}
            </span>
          </span>
          <span className="inline-flex items-center gap-1 font-semibold text-ice-600">
            읽기 <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
          </span>
        </div>
      </div>
    </Link>
  );
}

/** 전체 글 — 썸네일 좌측 가로형 리스트 카드. */
function ListCard({ post }: { post: BlogListItem }) {
  const meta = BLOG_CATEGORY_META[post.category];
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex items-stretch gap-4 rounded-xl border border-wline bg-wsurface p-3.5 transition-colors hover:border-ice-100 hover:bg-ice-50/30 sm:gap-6 sm:p-4"
    >
      <div className="relative aspect-square w-24 shrink-0 overflow-hidden rounded-xl bg-wbg sm:w-40">
        {post.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.coverImageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-ice-50/60 text-ice-500">
            <Newspaper size={22} strokeWidth={1.5} />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center py-0.5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {post.pinned && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-ice-700">
              <Pin size={10} /> 고정
            </span>
          )}
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1',
              meta.chip,
            )}
          >
            {meta.label}
          </span>
          <span className="font-mono text-wtext-4">{formatDate(post.createdAt)}</span>
        </div>
        <h3 className="mt-1.5 line-clamp-2 text-[15px] font-bold leading-snug text-rink-900 transition-colors group-hover:text-ice-600 sm:text-base">
          {post.title}
        </h3>
        <p className="mt-1 line-clamp-1 text-sm text-wtext-3 sm:line-clamp-2">{post.summary}</p>
        <div className="mt-2 inline-flex items-center gap-1 text-xs text-wtext-4">
          <Eye size={12} /> {post.viewCount.toLocaleString()}
        </div>
      </div>
    </Link>
  );
}

export default async function BlogListPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const category = isBlogCategory(sp.category) ? sp.category : undefined;

  const { items, total } = await getBlogList({ page, pageSize: PAGE_SIZE, category });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // glslogi 구조: 1페이지·필터없음에서만 상단 '주요 글' 3개 → 나머지는 아카이브 리스트.
  const showFeatured = page === 1 && !category && items.length > 0;
  const featured = showFeatured ? items.slice(0, 3) : [];
  const archive = showFeatured ? items.slice(3) : items;

  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  const buildHref = (params: { page?: number; category?: BlogCategory | null }) => {
    const usp = new URLSearchParams();
    const cat = params.category === null ? undefined : params.category ?? category;
    if (cat) usp.set('category', cat);
    if (params.page && params.page > 1) usp.set('page', String(params.page));
    const q = usp.toString();
    return `/blog${q ? '?' + q : ''}`;
  };

  return (
    <>
      <PageHero
        eyebrow="블로그"
        title={
          <>
            아이스하키 운영 인사이트,{' '}
            <span className="text-ice-500">팀플러스+</span> 블로그
          </>
        }
        description="클럽 운영 노하우와 팀플러스의 소식·가이드·이벤트·보도자료를 한곳에서. 현장에 바로 쓰는 실무 인사이트를 정리합니다."
        primary={{
          src: '/images/app-home.png',
          alt: '팀플러스 홈 대시보드 · 팀 공지사항 앱 화면',
        }}
      >
        {/* 히어로 도입 CTA */}
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <StoreBadge
            store="apple"
            href={APP_DOWNLOAD.appStore}
            className="w-full justify-center sm:w-auto sm:justify-start"
          />
          <StoreBadge
            store="google"
            href={APP_DOWNLOAD.googlePlay}
            className="w-full justify-center sm:w-auto sm:justify-start"
          />
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-wtext-4">
          {HERO_TRUST.map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-ice-500" />
              {t}
            </span>
          ))}
        </div>
      </PageHero>

      <section className="section relative !pt-0">
        <div className="container-site">
          <div className="mx-auto max-w-6xl">
            {/* 카테고리 필터 */}
            <div className="flex flex-wrap gap-2">
              <Link
                href={buildHref({ category: null, page: 1 })}
                className={cn(
                  'rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
                  !category
                    ? 'border-ice-500 bg-ice-500 text-white'
                    : 'border-wline bg-wsurface text-wtext-3 hover:border-ice-100 hover:text-rink-900',
                )}
              >
                전체
              </Link>
              {BLOG_CATEGORIES.map((c) => (
                <Link
                  key={c}
                  href={buildHref({ category: c, page: 1 })}
                  className={cn(
                    'rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
                    category === c
                      ? 'border-ice-500 bg-ice-500 text-white'
                      : 'border-wline bg-wsurface text-wtext-3 hover:border-ice-100 hover:text-rink-900',
                  )}
                >
                  {BLOG_CATEGORY_META[c].label}
                </Link>
              ))}
            </div>

            {/* 빈 상태 */}
            {items.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-wline bg-wsurface p-16 text-center">
                <Newspaper size={32} strokeWidth={1.5} className="mx-auto text-wtext-4" />
                <p className="mt-4 text-sm text-wtext-3">
                  {category ? '해당 카테고리의 글이 아직 없습니다.' : '아직 등록된 글이 없습니다.'}
                </p>
              </div>
            ) : (
              <>
                {/* 주요 글 */}
                {featured.length > 0 && (
                  <div className="mt-9">
                    <div className="mb-5 flex items-baseline gap-3">
                      <h2 className="text-lg font-bold text-rink-900">주요 글</h2>
                      <span className="h-px flex-1 bg-wline" />
                    </div>
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                      {featured.map((post) => (
                        <FeaturedCard key={post.id} post={post} />
                      ))}
                    </div>
                  </div>
                )}

                {/* 전체 글 */}
                {archive.length > 0 && (
                  <div className={cn(featured.length > 0 ? 'mt-14' : 'mt-9')}>
                    <div className="mb-5 flex items-baseline gap-3">
                      <h2 className="text-lg font-bold text-rink-900">
                        {category ? BLOG_CATEGORY_META[category].label : '전체 글'}
                      </h2>
                      <span className="h-px flex-1 bg-wline" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {archive.map((post) => (
                        <ListCard key={post.id} post={post} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* 페이지네이션 */}
            {(totalPages > 1 || total > 0) && (
              <div className="mt-12 flex flex-col items-center gap-4">
                {totalPages > 1 && (
                  <nav className="flex items-center justify-center gap-2 text-sm">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <Link
                        key={p}
                        href={buildHref({ page: p })}
                        className={cn(
                          'flex h-10 min-w-[40px] items-center justify-center rounded-lg border px-3 font-semibold tabular-nums transition-colors',
                          p === page
                            ? 'border-ice-500 bg-ice-500 text-white'
                            : 'border-wline bg-wsurface text-wtext-3 hover:bg-wbg',
                        )}
                      >
                        {p}
                      </Link>
                    ))}
                  </nav>
                )}
                <p className="text-xs text-wtext-4">
                  총 {total.toLocaleString()}건 · {rangeStart}–{rangeEnd} 표시
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
