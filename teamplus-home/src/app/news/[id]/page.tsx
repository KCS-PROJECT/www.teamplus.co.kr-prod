import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Eye, Pin } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { FinalCta } from '@/components/sections/FinalCta';
import { prisma } from '@/lib/prisma';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// 라이트 캔버스(흰 카드)용 칩 토큰 — 목록 페이지와 동일 (다크 테마 색 사용 금지)
const CATEGORY_COLORS: Record<string, string> = {
  Release: 'bg-ice-50 text-ice-700 ring-ice-200',
  Feature: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Notice: 'bg-amber-50 text-amber-700 ring-amber-200',
  Partner: 'bg-violet-50 text-violet-700 ring-violet-200',
};

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const notice = await prisma.notice.findUnique({
    where: { id: Number(id) },
    select: { title: true, summary: true, published: true },
  });
  if (!notice || !notice.published) return { title: '찾을 수 없음' };
  return {
    title: notice.title,
    description: notice.summary,
  };
}

export default async function NoticeDetailPage({ params }: { params: Params }) {
  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const notice = await prisma.notice.findUnique({ where: { id } });
  if (!notice || !notice.published) notFound();

  // 조회수 +1 (비동기 무시)
  prisma.notice
    .update({ where: { id }, data: { views: { increment: 1 } } })
    .catch(() => undefined);

  // 이전/다음 공지 조회
  const [prev, next] = await Promise.all([
    prisma.notice.findFirst({
      where: { published: true, id: { gt: id } },
      orderBy: { id: 'asc' },
      select: { id: true, title: true },
    }),
    prisma.notice.findFirst({
      where: { published: true, id: { lt: id } },
      orderBy: { id: 'desc' },
      select: { id: true, title: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow={notice.category.toUpperCase()}
        title={notice.title}
        description={notice.summary}
      />

      <section className="section relative !pt-0">
        <div className="container-site">
          <article className="mx-auto max-w-3xl">
            {/* 메타 정보 */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-wtext-3">
              {notice.pinned && (
                <span className="inline-flex items-center gap-1 rounded-full bg-ice-50 px-2 py-0.5 text-[10px] font-bold text-ice-700 ring-1 ring-ice-100">
                  <Pin size={10} /> 고정
                </span>
              )}
              <span className={cn(
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1',
                CATEGORY_COLORS[notice.category] ?? 'bg-wbg text-wtext-2 ring-wline',
              )}>
                {notice.category}
              </span>
              <span className="font-mono">
                {new Date(notice.createdAt).toLocaleString('ko-KR', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span className="inline-flex items-center gap-1">
                <Eye size={12} /> {notice.views.toLocaleString()}
              </span>
            </div>

            {/* 본문 */}
            <div className="glass-card mt-8 whitespace-pre-wrap p-8 text-[15px] leading-relaxed text-wtext-2 sm:p-10">
              {notice.content}
            </div>

            {/* 이전·다음 네비게이션 */}
            <nav className="mt-8 grid gap-3 sm:grid-cols-2">
              {prev ? (
                <Link
                  href={`/news/${prev.id}`}
                  className="glass-card group flex flex-col gap-1 p-5 transition-colors"
                >
                  <span className="text-xs font-semibold uppercase tracking-wider text-wtext-3">
                    이전 글
                  </span>
                  <span className="line-clamp-2 text-sm font-medium text-wtext-2 transition-colors group-hover:text-ice-600">
                    {prev.title}
                  </span>
                </Link>
              ) : (
                <div className="glass-card flex items-center justify-center p-5 text-xs text-wtext-3">
                  이전 글이 없습니다
                </div>
              )}
              {next ? (
                <Link
                  href={`/news/${next.id}`}
                  className="glass-card group flex flex-col gap-1 p-5 text-right transition-colors"
                >
                  <span className="text-xs font-semibold uppercase tracking-wider text-wtext-3">
                    다음 글
                  </span>
                  <span className="line-clamp-2 text-sm font-medium text-wtext-2 transition-colors group-hover:text-ice-600">
                    {next.title}
                  </span>
                </Link>
              ) : (
                <div className="glass-card flex items-center justify-center p-5 text-xs text-wtext-3">
                  다음 글이 없습니다
                </div>
              )}
            </nav>

            <div className="mt-8 text-center">
              <Link href="/news" className="btn-ghost">
                <ArrowLeft size={14} /> 목록으로
              </Link>
            </div>
          </article>
        </div>
      </section>

      <FinalCta />
    </>
  );
}
