import Link from 'next/link';
import { Home, ArrowLeft } from 'lucide-react';
import { BackgroundMesh } from '@/components/ui/BackgroundMesh';

export default function NotFound() {
  return (
    <section className="relative flex min-h-[80vh] items-center justify-center pt-28">
      <BackgroundMesh variant="hero" />
      <div className="container-site text-center">
        <p className="font-num text-[clamp(5rem,15vw,12rem)] font-black leading-none text-ice-600">
          404
        </p>
        <h1 className="mt-4 text-2xl font-bold text-rink-900 sm:text-3xl">
          페이지를 찾을 수 없습니다
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-wtext-3">
          요청하신 주소가 변경되었거나 존재하지 않습니다. 메인으로 돌아가 다시 탐색해보세요.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/" className="btn-primary">
            <Home size={16} /> 홈으로 가기
          </Link>
          <Link href="/contact" className="btn-ghost">
            <ArrowLeft size={16} /> 고객센터 문의
          </Link>
        </div>
      </div>
    </section>
  );
}
