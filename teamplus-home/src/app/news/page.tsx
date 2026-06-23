import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, Pin, Eye } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { StoreBadge } from '@/components/ui/StoreBadge';
import { APP_DOWNLOAD } from '@/lib/content';
import { prisma } from '@/lib/prisma';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '공지 · 소식',
  description:
    'TEAMPLUS 의 최신 업데이트 · 신규 기능 · 공지사항을 게시판 형태로 확인하세요.',
};

// 카테고리별 절제된 accent 1:1 매핑 — 흰 카드 위 분류 식별성 확보 (light bg-50 + text-700 + ring-200)
const CATEGORY_COLORS: Record<string, string> = {
  Release: 'bg-ice-50 text-ice-700 ring-ice-200',
  Feature: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Notice: 'bg-amber-50 text-amber-700 ring-amber-200',
  Partner: 'bg-violet-50 text-violet-700 ring-violet-200',
};

const PAGE_SIZE = 10;

const HERO_TRUST = ['릴리스 노트 확인', '신규 기능 안내', '파트너 소식 업데이트'];

type SearchParams = Promise<{
  page?: string;
  category?: string;
  search?: string;
}>;

export default async function NewsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const category = sp.category;
  const search = sp.search?.trim() || undefined;

  const where = {
    published: true,
    ...(category ? { category } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search } },
            { summary: { contains: search } },
          ],
        }
      : {}),
  };

  const [notices, total, categories] = await Promise.all([
    prisma.notice.findMany({
      where,
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.notice.count({ where }),
    prisma.notice.groupBy({
      by: ['category'],
      where: { published: true },
      _count: true,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const buildHref = (params: { page?: number; category?: string; clear?: boolean }) => {
    const usp = new URLSearchParams();
    if (!params.clear && category) usp.set('category', params.category ?? category);
    if (params.category && !params.clear) usp.set('category', params.category);
    if (search) usp.set('search', search);
    if (params.page && params.page > 1) usp.set('page', String(params.page));
    const q = usp.toString();
    return `/news${q ? '?' + q : ''}`;
  };

  return (
    <>
      <PageHero
        eyebrow="공지 · 소식"
        title={
          <>
            팀플러스<span className="text-green-500">+</span> 공지 게시판
          </>
        }
        description="업데이트 릴리스, 신규 기능 공개, 운영 공지, 파트너십 소식을 한곳에서 확인하세요. 클럽 운영자가 실제 적용 시점을 판단할 수 있도록 변경 이유와 적용 범위를 함께 정리합니다."
        primary={{ src: '/images/app-my.png', alt: '팀플러스 마이페이지 · 알림 앱 화면' }}
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
          <div className="mx-auto max-w-5xl">
            {/* 필터·검색 바 */}
            <form
              action="/news"
              method="GET"
              className="glass-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/news"
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                    !category
                      ? 'border-ice-100 bg-ice-50 text-ice-700'
                      : 'border-wline bg-wsurface text-wtext-3 hover:text-rink-900',
                  )}
                >
                  전체 <span className="ml-1 text-wtext-4">{total}</span>
                </Link>
                {categories.map((c) => (
                  <Link
                    key={c.category}
                    href={`/news?category=${encodeURIComponent(c.category)}`}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                      category === c.category
                        ? 'border-ice-100 bg-ice-50 text-ice-700'
                        : 'border-wline bg-wsurface text-wtext-3 hover:text-rink-900',
                    )}
                  >
                    {c.category} <span className="ml-1 text-wtext-4">{c._count}</span>
                  </Link>
                ))}
              </div>

              <div className="flex items-center gap-2">
                {category && <input type="hidden" name="category" value={category} />}
                <input
                  type="search"
                  name="search"
                  defaultValue={search ?? ''}
                  placeholder="제목·요약 검색"
                  className="min-w-0 flex-1 rounded-full border border-wline bg-wsurface px-4 py-2 text-sm text-rink-900 placeholder:text-wtext-4 focus:border-ice-500 focus:outline-none focus:ring-1 focus:ring-ice-500 sm:w-56 sm:flex-none"
                />
                <button type="submit" className="btn-ghost shrink-0 whitespace-nowrap !px-4 !py-2 text-xs">
                  검색
                </button>
              </div>
            </form>

            {/* 목록 */}
            {notices.length === 0 ? (
              <div className="glass-card mt-6 p-12 text-center text-sm text-wtext-3">
                {search || category
                  ? '조건에 맞는 공지가 없습니다.'
                  : '아직 등록된 공지가 없습니다.'}
              </div>
            ) : (
              <ul className="mt-6 space-y-3">
                {notices.map((n) => (
                  <li key={n.id}>
                    <Link
                      href={`/news/${n.id}`}
                      className="glass-card group flex flex-col gap-3 p-6 transition-colors sm:flex-row sm:items-center sm:gap-6"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs sm:w-44 sm:shrink-0">
                        {n.pinned && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-ice-50 px-2 py-0.5 text-[10px] font-bold text-ice-700 ring-1 ring-ice-100">
                            <Pin size={10} /> 고정
                          </span>
                        )}
                        <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1', CATEGORY_COLORS[n.category] ?? 'bg-wbg text-wtext-2 ring-wline')}>
                          {n.category}
                        </span>
                      </div>

                      <div className="flex-1">
                        <h3 className="line-clamp-2 text-base font-bold text-rink-900 transition-colors group-hover:text-ice-600 sm:text-lg">
                          {n.title}
                        </h3>
                        <p className="mt-1.5 line-clamp-2 text-sm text-wtext-3">
                          {n.summary}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-wtext-4 sm:flex-col sm:items-end sm:gap-1">
                        <span className="font-mono">
                          {new Date(n.createdAt).toLocaleDateString('ko-KR', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                          }).replace(/\s/g, '')}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Eye size={12} /> {n.views.toLocaleString()}
                        </span>
                      </div>

                      <ArrowUpRight
                        size={16}
                        className="hidden text-wtext-4 transition-colors group-hover:text-ice-600 sm:block"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <nav className="mt-10 flex items-center justify-center gap-2 text-sm">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <Link
                    key={p}
                    href={buildHref({ page: p })}
                    className={cn(
                      'flex h-9 min-w-[36px] items-center justify-center rounded-lg border px-3 font-medium transition-colors',
                      p === page
                        ? 'border-ice-100 bg-ice-50 text-ice-700'
                        : 'border-wline bg-wsurface text-wtext-3 hover:bg-wbg',
                    )}
                  >
                    {p}
                  </Link>
                ))}
              </nav>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
