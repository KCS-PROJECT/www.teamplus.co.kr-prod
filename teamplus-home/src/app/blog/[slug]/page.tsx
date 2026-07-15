import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, Clock, Eye, Pin } from 'lucide-react';
import { FinalCta } from '@/components/sections/FinalCta';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  getBlogBySlug,
  getBlogList,
  BLOG_CATEGORY_META,
  type BlogListItem,
} from '@/lib/blog-api';
import { blogPostingSchema, breadcrumbSchema } from '@/lib/seo';
import { cn } from '@/lib/utils';

// 발행 글을 재배포 없이 반영 — ISR(5분).
export const revalidate = 300;

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogBySlug(slug);
  if (!post) return { title: '찾을 수 없음' };
  return {
    title: post.title,
    description: post.summary,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: 'article',
      url: `/blog/${post.slug}`,
      title: post.title,
      description: post.summary,
      ...(post.coverImageUrl ? { images: [{ url: post.coverImageUrl }] } : {}),
    },
  };
}

/** 한국어 기준 대략적 읽기 시간(분) — 분당 약 500자. */
function readingMinutes(html: string): number {
  const text = html.replace(/<[^>]*>/g, '').replace(/\s+/g, '');
  return Math.max(1, Math.round(text.length / 500));
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** 관련 글 카드(컴팩트). */
function RelatedCard({ post }: { post: BlogListItem }) {
  const meta = BLOG_CATEGORY_META[post.category];
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-wline bg-wsurface transition-colors hover:border-ice-100 hover:bg-ice-50/30"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-wbg">
        {post.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.coverImageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-wtext-4">
            TEAMPLUS+
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <span
          className={cn(
            'mb-1.5 inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1',
            meta.chip,
          )}
        >
          {meta.label}
        </span>
        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-rink-900 transition-colors group-hover:text-ice-600">
          {post.title}
        </h3>
      </div>
    </Link>
  );
}

export default async function BlogDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const post = await getBlogBySlug(slug);
  if (!post) notFound();

  const meta = BLOG_CATEGORY_META[post.category];
  const minutes = readingMinutes(post.content);

  // 관련 글 — 최신 발행 글에서 현재 글 제외 후 최대 3개.
  const { items } = await getBlogList({ pageSize: 4 });
  const related = items.filter((p) => p.slug !== post.slug).slice(0, 3);

  return (
    <>
      <JsonLd
        data={[
          blogPostingSchema(post),
          breadcrumbSchema([
            { name: '홈', path: '/' },
            { name: '블로그', path: '/blog' },
            { name: post.title, path: `/blog/${post.slug}` },
          ]),
        ]}
      />

      {/* 아티클 헤더 — 좁은 컬럼 중앙, 에디토리얼 톤 */}
      <header className="relative isolate pt-36 sm:pt-44">
        <div className="container-site">
          <div className="mx-auto max-w-3xl">
            {/* breadcrumb */}
            <nav className="flex items-center gap-1.5 text-xs text-wtext-4" aria-label="breadcrumb">
              <Link href="/blog" className="transition-colors hover:text-ice-600">
                블로그
              </Link>
              <span aria-hidden="true">/</span>
              <span className="text-wtext-3">{meta.label}</span>
            </nav>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {post.pinned && (
                <span className="inline-flex items-center gap-1 rounded-full bg-ice-50 px-2 py-0.5 text-[10px] font-bold text-ice-700 ring-1 ring-ice-100">
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

            <h1 className="mt-4 text-balance text-3xl font-black leading-tight tracking-tight text-rink-900 sm:text-4xl">
              {post.title}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-wtext-3 sm:text-lg">{post.summary}</p>

            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-wline pt-5 text-sm text-wtext-4">
              <span className="font-medium text-wtext-3">
                {formatDate(post.publishedAt ?? post.createdAt)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock size={14} /> 약 {minutes}분
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Eye size={14} /> {post.viewCount.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </header>

      <article className="pb-8 pt-10">
        <div className="container-site">
          <div className="mx-auto max-w-3xl">
            {/* 커버 */}
            {post.coverImageUrl && (
              <div className="mb-10 overflow-hidden rounded-2xl border border-wline">
                {/* backend 업로드 이미지(외부 오리진) — next/image 대신 일반 img 사용 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.coverImageUrl}
                  alt={post.title}
                  className="aspect-[16/9] w-full object-cover"
                />
              </div>
            )}

            {/* 본문 — backend sanitizeBlogHtml 로 저장 시점에 살균된 신뢰 HTML */}
            <div
              className={cn(
                'prose prose-slate max-w-none',
                'prose-headings:text-rink-900 prose-headings:font-bold prose-headings:tracking-tight',
                'prose-h2:mt-12 prose-h2:text-2xl prose-h3:mt-8 prose-h3:text-xl',
                'prose-p:text-[16px] prose-p:leading-[1.85] prose-p:text-wtext-2',
                'prose-li:text-wtext-2 prose-li:leading-[1.8] prose-strong:text-rink-900',
                'prose-a:font-medium prose-a:text-ice-600 prose-a:no-underline hover:prose-a:underline',
                'prose-blockquote:border-l-2 prose-blockquote:border-l-ice-500 prose-blockquote:bg-ice-50/40 prose-blockquote:py-1 prose-blockquote:not-italic prose-blockquote:text-wtext-3',
                'prose-img:rounded-xl prose-img:border prose-img:border-wline',
                'prose-hr:border-wline',
              )}
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: post.content }}
            />

            {/* 목록으로 */}
            <div className="mt-12 border-t border-wline pt-8">
              <Link
                href="/blog"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-wtext-3 transition-colors hover:text-ice-600"
              >
                <ArrowLeft size={15} /> 블로그 목록으로
              </Link>
            </div>
          </div>
        </div>
      </article>

      {/* 관련 글 */}
      {related.length > 0 && (
        <section className="section relative !pt-4">
          <div className="container-site">
            <div className="mx-auto max-w-6xl">
              <div className="mb-5 flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-bold text-rink-900">다른 글도 읽어보세요</h2>
                <Link
                  href="/blog"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-ice-600 transition-colors hover:text-ice-700"
                >
                  전체 보기 <ArrowRight size={14} />
                </Link>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((p) => (
                  <RelatedCard key={p.id} post={p} />
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      <FinalCta />
    </>
  );
}
