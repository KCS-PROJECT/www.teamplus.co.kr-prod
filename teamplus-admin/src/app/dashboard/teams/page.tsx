'use client';

/**
 * /dashboard/teams — 팀 관리 (Team 단위)
 *
 * 사용자 요청:
 *  - 사이드바: '클럽관리' → '팀관리'
 *  - 페이지 헤더: '소속 클럽' → '팀 관리'
 *  - 실제 DB 의 Team(타이탄스/블리자드) 카드 표시
 *  - 카드 클릭 → /dashboard/teams/[teamId] 상세
 *
 * 데이터 source: GET /api/v1/teams (모든 팀, 관리자 권한)
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Users, Layers, Search } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { api } from '@/services/api-client';

interface TeamRow {
  id: string;
  name: string;
  shortName: string | null;
  // [추가 2026-05-12] 팀 코드 — 회원/코치 가입 시 입력하는 식별 코드 (예: TST2, BLZ, TTN)
  teamCode: string | null;
  division: string | null;
  isActive: boolean;
  clubId: string;
  _count?: { roster?: number; groups?: number };
  // 응답에 따라 다양한 필드가 올 수 있어 광범위 허용
  roster?: unknown[];
  groups?: unknown[];
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.get<TeamRow[] | { data?: TeamRow[] }>('/teams');
        if (cancelled) return;
        // 응답이 배열이거나 { data: [...] }
        const list = Array.isArray(res) ? res : Array.isArray((res as { data?: TeamRow[] })?.data) ? (res as { data?: TeamRow[] }).data! : [];
        setTeams(list);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '팀 목록을 불러오지 못했습니다.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (isLoading) return <LoadingSpinner message="팀 정보를 불러오는 중..." />;

  const q = searchTerm.trim().toLowerCase();
  const filteredTeams = q
    ? teams.filter((t) =>
        t.name.toLowerCase().includes(q) ||
        (t.teamCode ?? '').toLowerCase().includes(q) ||
        (t.shortName ?? '').toLowerCase().includes(q),
      )
    : teams;
  const totalMembers = teams.reduce((s, t) => s + (t._count?.roster ?? t.roster?.length ?? 0), 0);
  const totalGroups = teams.reduce((s, t) => s + (t._count?.groups ?? t.groups?.length ?? 0), 0);

  return (
    <div className="space-y-5 pb-10">
      {/* Hero — 다른 관리 페이지와 동일 톤 */}
      <section className="rounded-2xl bg-primary text-white shadow-md p-6 sm:p-7">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">팀 관리</h1>
        <p className="mt-1.5 text-sm text-white/80">
          활성 팀 {teams.length}개 · 전체 소속 {totalMembers}명 · 그룹 {totalGroups}개
        </p>
      </section>

      {/* Search */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <Search className="w-4 h-4 text-slate-400" aria-hidden="true" />
        <input
          type="search"
          placeholder="팀명, 팀코드로 검색"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
          aria-label="팀 검색"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {!error && filteredTeams.length === 0 && (
        <Card className="p-12 text-center text-slate-500 dark:text-slate-400">
          {searchTerm ? '검색 결과가 없습니다.' : '등록된 팀이 없습니다.'}
        </Card>
      )}

      {filteredTeams.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTeams.map((team) => (
            <Link
              key={team.id}
              href={`/dashboard/teams/${team.id}`}
              className="block group"
            >
              <Card className="p-5 hover:border-primary hover:shadow-md transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate">
                      {team.name}
                    </h3>
                    {/* [수정 2026-05-12] 팀명 밑에 항상 팀코드 노출 — shortName(과거) 대신 teamCode 우선. */}
                    {(team.teamCode || team.shortName || team.division) && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {team.teamCode ?? team.shortName ?? ''}
                        {(team.teamCode || team.shortName) && team.division ? ' · ' : ''}
                        {team.division ?? ''}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 pt-4 border-t border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-2 text-xs">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600 dark:text-slate-300 font-semibold">
                      {team._count?.roster ?? team.roster?.length ?? '–'} 명
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Layers className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600 dark:text-slate-300 font-semibold">
                      {team._count?.groups ?? team.groups?.length ?? '–'} 그룹
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
