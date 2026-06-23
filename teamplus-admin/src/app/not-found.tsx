'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md border border-slate-200 bg-white p-8 text-center rounded-xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-2xl text-slate-500">
          404
        </div>
        <h1 className="mt-5 text-xl font-bold text-slate-900">페이지를 찾을 수 없습니다</h1>
        <p className="mt-2 text-sm text-slate-500">
          주소가 변경되었거나 권한이 없는 페이지입니다.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link href="/dashboard">
            <Button className="w-full">대시보드로 이동</Button>
          </Link>
          <Link href="/login">
            <Button variant="secondary" className="w-full">로그인으로 이동</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
