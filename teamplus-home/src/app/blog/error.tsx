'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RotateCw, ArrowLeft, CloudOff } from 'lucide-react';
import { BackgroundMesh } from '@/components/ui/BackgroundMesh';

/**
 * /blog 세그먼트 error boundary.
 *
 * 존재 이유: `getBlogBySlug` 는 백엔드 장애를 `BlogBackendError` 로 throw 한다(404 로 뭉개지 않음).
 * 그 오류가 여기로 떨어져 "일시적 오류 + 다시 시도" 로 정직하게 표시된다.
 * 실제 미존재(백엔드 404)는 계속 `notFound()` → not-found.tsx 로 간다 — 둘은 다른 화면이다.
 *
 * not-found.tsx 와 동일 어휘(BackgroundMesh · btn-primary/ghost · wtext 토큰)를 쓴다.
 */
export default function BlogError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 서버 로그의 [blog] 라인과 대조할 수 있도록 digest 를 남긴다.
    console.error('[blog] 렌더 오류', error.message, error.digest ?? '');
  }, [error]);

  return (
    <section className="relative flex min-h-[80vh] items-center justify-center pt-28">
      <BackgroundMesh variant="hero" />
      <div className="container-site text-center">
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-ice-50 text-ice-600 ring-1 ring-ice-100">
          <CloudOff size={28} strokeWidth={1.5} aria-hidden />
        </span>
        <h1 className="mt-6 text-2xl font-bold text-rink-900 sm:text-3xl">
          글을 불러오지 못했습니다
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-wtext-3">
          일시적인 문제로 내용을 가져오지 못했습니다. 글이 삭제된 것은 아니니 잠시 후 다시 시도해
          주세요.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button type="button" onClick={reset} className="btn-primary">
            <RotateCw size={16} aria-hidden /> 다시 시도
          </button>
          <Link href="/blog" className="btn-ghost">
            <ArrowLeft size={16} aria-hidden /> 블로그 목록으로
          </Link>
        </div>
      </div>
    </section>
  );
}
