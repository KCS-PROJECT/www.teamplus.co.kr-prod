'use client';

/**
 * /dashboard/matches — 매치 모집 관리 (2026-05-08 재작성)
 *
 * 변경 이력
 *   - 기존: hardcoded `recruitments` 배열로 mock UI
 *   - 신규: GET /api/v1/matches (PickupMatch) 실 데이터 연동
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Calendar,
  Clock,
  Handshake,
  MapPin,
  Plus,
  Search,
  UserPlus,
  Users,
  AlertCircle,
} from 'lucide-react';
import { api } from '@/services/api-client';

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

type MatchStatus = 'recruiting' | 'closing_soon' | 'closed' | 'cancelled';

interface PickupMatch {
  id: string;
  title: string;
  managerId: string;
  scheduledAt: string;
  rinkName: string;
  rinkAddress?: string | null;
  price: number;
  level: string;
  gender: string;
  maxParticipants: number;
  homeTeamName?: string | null;
  awayTeamName?: string | null;
  status: MatchStatus;
  description?: string | null;
  createdAt: string;
  _count?: { applicants?: number };
}

interface MatchesResponse {
  total: number;
  page: number;
  limit: number;
  items: PickupMatch[];
}

const STATUS_LABEL: Record<MatchStatus, string> = {
  recruiting: '모집중',
  closing_soon: '마감 임박',
  closed: '마감',
  cancelled: '취소',
};

const STATUS_COLOR: Record<MatchStatus, string> = {
  recruiting:
    'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  closing_soon:
    'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  closed:
    'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600',
  cancelled:
    'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
};

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatPrice(n: number) {
  return n.toLocaleString('ko-KR');
}

// ────────────────────────────────────────────
// Page
// ────────────────────────────────────────────

type TabKey = 'all' | MatchStatus;

export default function MatchesPage() {
  const [matches, setMatches] = useState<PickupMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('all');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<MatchesResponse | PickupMatch[]>('/matches', { params: { limit: 100 } });
      const items = Array.isArray(res)
        ? res
        : Array.isArray((res as MatchesResponse)?.items)
          ? (res as MatchesResponse).items
          : [];
      setMatches(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : '매치 목록을 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const acc = { all: matches.length, recruiting: 0, closing_soon: 0, closed: 0, cancelled: 0 };
    for (const m of matches) {
      const k = m.status as MatchStatus;
      if (k in acc) acc[k as keyof typeof acc] += 1;
    }
    return acc;
  }, [matches]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return matches.filter((m) => {
      if (activeTab !== 'all' && m.status !== activeTab) return false;
      if (!q) return true;
      return (
        m.title?.toLowerCase().includes(q) ||
        m.rinkName?.toLowerCase().includes(q) ||
        m.homeTeamName?.toLowerCase().includes(q) ||
        m.awayTeamName?.toLowerCase().includes(q)
      );
    });
  }, [matches, activeTab, searchTerm]);

  // 2026-05-08: 팀별 그룹화 — 어느 팀에서 만든 매치인지 명확히 표시.
  // PickupMatch 는 homeTeamName 을 기준 팀으로 사용 (없으면 awayTeamName, 둘 다 없으면 '팀 미지정').
  const matchesByTeam = useMemo(() => {
    const map: Record<string, PickupMatch[]> = {};
    for (const m of filtered) {
      const teamLabel = m.homeTeamName?.trim() || m.awayTeamName?.trim() || '팀 미지정';
      if (!map[teamLabel]) map[teamLabel] = [];
      map[teamLabel].push(m);
    }
    return map;
  }, [filtered]);

  const teamGroupKeys = useMemo(
    () =>
      Object.keys(matchesByTeam).sort((a, b) => {
        if (a === '팀 미지정') return 1;
        if (b === '팀 미지정') return -1;
        return a.localeCompare(b, 'ko-KR');
      }),
    [matchesByTeam],
  );

  const TABS: { key: TabKey; label: string; count: number }[] = [
    { key: 'all', label: '전체', count: counts.all },
    { key: 'recruiting', label: '모집중', count: counts.recruiting },
    { key: 'closing_soon', label: '마감임박', count: counts.closing_soon },
    { key: 'closed', label: '마감', count: counts.closed },
    { key: 'cancelled', label: '취소', count: counts.cancelled },
  ];

  return (
    <div className="space-y-6">
      {/* Header — 수업관리 페이지 스타일 (2026-05-08) */}
      <section
        className="relative overflow-hidden rounded-2xl bg-primary text-white shadow-md"
        aria-label="매치 관리 헤더"
      >
        <div className="relative z-10 p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
                <Handshake className="w-3.5 h-3.5" aria-hidden="true" />
                매치 관리
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">매치 관리</h1>
              <p className="text-sm sm:text-base text-white/80">팀별로 등록된 픽업 매치를 한눈에 확인합니다</p>
            </div>
            <Button
              disabled
              className="h-11 inline-flex items-center gap-2 px-4 rounded-lg bg-white/15 hover:bg-white/25 text-white text-sm font-medium motion-reduce:transition-none transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              신규 매치 (준비중)
            </Button>
          </div>

          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="rounded-xl bg-white/15 px-3 py-2.5">
              <p className="text-xs text-white/70">전체</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums">{counts.all}</p>
            </div>
            <div className="rounded-xl bg-white/15 px-3 py-2.5">
              <p className="text-xs text-white/70">모집 중</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums">{counts.recruiting}</p>
            </div>
            <div className="rounded-xl bg-white/15 px-3 py-2.5">
              <p className="text-xs text-white/70">마감 임박</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums">{counts.closing_soon}</p>
            </div>
            <div className="rounded-xl bg-white/15 px-3 py-2.5">
              <p className="text-xs text-white/70">마감/취소</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums">{counts.closed + counts.cancelled}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Search */}
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <Search className="w-4 h-4 text-slate-400" aria-hidden="true" />
        <Input
          type="search"
          placeholder="제목, 링크, 팀명으로 검색"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="border-0 bg-transparent text-sm focus-visible:ring-0 px-0"
          aria-label="매치 검색"
        />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={
                active
                  ? 'inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-white text-sm font-semibold'
                  : 'inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm hover:bg-slate-50 dark:hover:bg-slate-700'
              }
              aria-pressed={active}
            >
              {tab.label}
              <span
                className={
                  active
                    ? 'rounded-md bg-white/20 px-1.5 text-xs tabular-nums'
                    : 'rounded-md bg-slate-100 dark:bg-slate-700 px-1.5 text-xs tabular-nums'
                }
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Body */}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-6 text-center">
          <AlertCircle className="w-8 h-8 mx-auto text-red-500" aria-hidden="true" />
          <p className="mt-2 text-sm font-bold text-red-700 dark:text-red-300">{error}</p>
          <Button onClick={() => void load()} variant="outline" className="mt-3">
            다시 시도
          </Button>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-10 text-center">
          <UserPlus className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" aria-hidden="true" />
          <p className="mt-3 text-base font-bold text-slate-700 dark:text-slate-200">
            {searchTerm ? '검색 결과가 없습니다' : '등록된 매치가 없습니다'}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {searchTerm ? '다른 키워드로 다시 검색해보세요' : '신규 매치 등록 시 이곳에 표시됩니다'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {teamGroupKeys.map((teamName) => (
            <section
              key={teamName}
              className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden"
              aria-label={`${teamName} 팀 매치 목록`}
            >
              <header className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Handshake className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-bold text-slate-900 dark:text-white">{teamName}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">매치 {matchesByTeam[teamName].length}건</p>
                  </div>
                </div>
              </header>
              <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                {matchesByTeam[teamName].map((m) => (
            <li key={m.id}>
              <div className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors motion-reduce:transition-none">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                  <Handshake className="w-4 h-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{m.title}</p>
                    <Badge className={`shrink-0 ${STATUS_COLOR[m.status] ?? STATUS_COLOR.closed}`}>
                      {STATUS_LABEL[m.status] ?? m.status}
                    </Badge>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3" aria-hidden="true" />
                      <span className="tabular-nums">{formatDate(m.scheduledAt)} {formatTime(m.scheduledAt)}</span>
                    </span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1 truncate">
                      <MapPin className="w-3 h-3" aria-hidden="true" />
                      <span className="truncate">{m.rinkName}</span>
                    </span>
                  </div>
                </div>
                <div className="hidden sm:flex flex-col items-end shrink-0 gap-0.5">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {m.level} · {m.gender} · {m.maxParticipants}명
                  </span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                    {formatPrice(m.price)}원
                  </span>
                </div>
              </div>
            </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'primary',
  icon,
}: {
  label: string;
  value: number;
  tone?: 'primary' | 'emerald' | 'amber' | 'slate';
  icon?: React.ReactNode;
}) {
  const toneCls: Record<string, string> = {
    primary: 'text-primary',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    slate: 'text-slate-500 dark:text-slate-400',
  };
  return (
    <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </div>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${toneCls[tone]}`}>{value}</p>
    </div>
  );
}
