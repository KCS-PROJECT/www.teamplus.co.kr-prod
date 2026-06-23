'use client';

/**
 * /dashboard/academies — 오픈클래스 관리 (Academy 단위)
 *
 * [재구성 2026-05-13]
 *  - 기존 테이블 형식 → /dashboard/teams 와 동일한 hero + 카드 그리드.
 *  - 클래스(Academy) 별 카드(닫힌클래스 / 클로즈클래스 등)로 표시.
 *  - 카드 클릭 → /dashboard/academies/[academyId] 상세.
 *
 * 데이터 source: GET /api/v1/academies/public (admin 권한 무관, 공개 list 사용)
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { GraduationCap, Users, CalendarDays, Search, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { api } from '@/services/api-client';

interface AcademyRow {
  id: string;
  name: string;
  code?: string | null;
  region?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  isActive?: boolean;
  _count?: { members?: number; coaches?: number; classes?: number };
}

interface PublicListResponse {
  data?: AcademyRow[];
  academies?: AcademyRow[];
}

export default function AcademiesPage() {
  const [items, setItems] = useState<AcademyRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.get<AcademyRow[] | PublicListResponse>(
          '/academies/public',
          { params: { limit: 200 } },
        );
        if (cancelled) return;
        const list: AcademyRow[] = Array.isArray(res)
          ? res
          : Array.isArray((res as PublicListResponse).data)
            ? (res as PublicListResponse).data!
            : Array.isArray((res as PublicListResponse).academies)
              ? (res as PublicListResponse).academies!
              : [];
        setItems(list);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '오픈클래스 목록을 불러오지 못했습니다.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (isLoading) return <LoadingSpinner message="오픈클래스 정보를 불러오는 중..." />;

  const q = searchTerm.trim().toLowerCase();
  const filtered = q
    ? items.filter((a) =>
        a.name.toLowerCase().includes(q) ||
        (a.code ?? '').toLowerCase().includes(q) ||
        (a.region ?? '').toLowerCase().includes(q),
      )
    : items;

  const totalMembers = items.reduce((s, a) => s + (a._count?.members ?? 0), 0);
  const totalCoaches = items.reduce((s, a) => s + (a._count?.coaches ?? 0), 0);
  const totalClasses = items.reduce((s, a) => s + (a._count?.classes ?? 0), 0);

  return (
    <div className="space-y-5 pb-10">
      {/* Hero — 팀관리 페이지와 동일 톤 */}
      <section className="rounded-2xl bg-primary text-white shadow-md p-6 sm:p-7">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">오픈클래스 관리</h1>
        <p className="mt-1.5 text-sm text-white/80">
          활성 오픈클래스 {items.length}개 · 전체 수강생 {totalMembers}명 · 코치 {totalCoaches}명 · 개설 수업 {totalClasses}개
        </p>
      </section>

      {/* Search */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <Search className="w-4 h-4 text-slate-400" aria-hidden="true" />
        <input
          type="search"
          placeholder="오픈클래스명, 코드, 지역으로 검색"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
          aria-label="오픈클래스 검색"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {!error && filtered.length === 0 && (
        <Card className="p-12 text-center text-slate-500 dark:text-slate-400">
          {searchTerm ? '검색 결과가 없습니다.' : '등록된 오픈클래스가 없습니다.'}
        </Card>
      )}

      {filtered.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((academy) => (
            <Link
              key={academy.id}
              href={`/dashboard/academies/${academy.id}`}
              className="block group"
            >
              <Card className="p-5 hover:border-primary hover:shadow-md transition-all">
                <div className="flex items-center gap-3">
                  <div className="relative w-12 h-12 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                    <GraduationCap className="w-6 h-6" />
                    <Sparkles className="absolute -top-1 -right-1 w-3 h-3 text-amber-500 dark:text-amber-400" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate">
                      {academy.name}
                    </h3>
                    {(academy.code || academy.region) && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {academy.code ?? ''}
                        {academy.code && academy.region ? ' · ' : ''}
                        {academy.region ?? ''}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 pt-4 border-t border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-1.5 text-xs">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600 dark:text-slate-300 font-semibold">
                      {academy._count?.members ?? 0}명
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <GraduationCap className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600 dark:text-slate-300 font-semibold">
                      {academy._count?.coaches ?? 0}코치
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <CalendarDays className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600 dark:text-slate-300 font-semibold">
                      {academy._count?.classes ?? 0}수업
                    </span>
                  </div>
                </div>

                <p className="mt-3 text-xs text-slate-400 dark:text-slate-500 group-hover:text-primary">
                  자세히 보기 →
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
