'use client';

/**
 * 감사 로그 페이지 - TEAMPLUS
 *
 * AuditLog(감사 로그) 조회 — 누가 무엇을 했는지(로그인/결제/삭제/승인 등)를 기록.
 *   GET /admin/audit-logs?page=&limit=&search=
 *   (서버 운영 로그는 별도 '시스템로그' 페이지 = platform='backend')
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StatusFilter } from '@/components/ui/admin-tabs';
import { Search, History, ChevronLeft, ChevronRight, RefreshCw, User as UserIcon, Globe, Smartphone, ShieldCheck } from 'lucide-react';
import { api } from '@/services/api-client';

type PlatformFilter = 'all' | 'web' | 'admin' | 'app';

const PLATFORM_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  web: { label: '웹', color: 'text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400', icon: <Globe className="w-3 h-3" /> },
  admin: { label: '관리자', color: 'text-purple-700 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400', icon: <ShieldCheck className="w-3 h-3" /> },
  app: { label: '앱', color: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400', icon: <Smartphone className="w-3 h-3" /> },
};
function platformMeta(p?: string | null) {
  return PLATFORM_META[p ?? ''] ?? { label: '기타', color: 'text-slate-500 bg-slate-100 dark:bg-slate-700 dark:text-slate-400', icon: null };
}

interface AuditUser {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  userType?: string;
}

interface AuditLogEntry {
  id: string;
  action: string;
  resource?: string | null;
  platform?: string | null;
  ipAddress?: string | null;
  createdAt: string;
  userId?: string | null;
  user?: AuditUser | null;
}

interface AuditLogsResponse {
  data: AuditLogEntry[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const PAGE_SIZE = 50;

// action 유형별 배지 색상 (감사 성격 기반)
function actionColor(action: string): string {
  const a = action.toUpperCase();
  if (a.includes('FAIL') || a.includes('ERROR') || a.includes('DELETE') || a.includes('REJECT') || a.includes('BLOCK'))
    return 'text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-400';
  if (a.includes('SUCCESS') || a.includes('APPROVE') || a.includes('CREATE'))
    return 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400';
  if (a.includes('UPDATE') || a.includes('ADJUST') || a.includes('CANCEL'))
    return 'text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400';
  return 'text-slate-600 bg-slate-100 dark:bg-slate-700 dark:text-slate-400';
}

function userLabel(log: AuditLogEntry): string {
  const u = log.user;
  if (u) {
    const name = [u.lastName, u.firstName].filter(Boolean).join('');
    if (name) return name;
    if (u.email) return u.email;
  }
  return log.userId ? log.userId.slice(0, 8) : '시스템';
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [platform, setPlatform] = useState<PlatformFilter>('all');
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchLogs = useCallback(async (params: { search: string; platform: PlatformFilter; page: number }) => {
    setIsLoading(true);
    try {
      const queryParams: Record<string, string | number> = {
        page: params.page,
        limit: PAGE_SIZE,
      };
      if (params.search) queryParams.search = params.search;
      if (params.platform !== 'all') queryParams.platform = params.platform;

      const res = await api.get<AuditLogsResponse | { data: AuditLogsResponse }>('/admin/audit-logs', { params: queryParams });
      const body =
        res && 'pagination' in res ? res : (res as { data: AuditLogsResponse })?.data;
      setLogs(body?.data || []);
      setTotal(body?.pagination?.total || 0);
    } catch (err) {
      console.error('감사 로그 조회 실패:', err);
      setLogs([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs({ search: searchTerm, platform, page });
    // searchTerm은 디바운스로 별도 처리
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, platform, fetchLogs]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchLogs({ search: value, platform, page: 1 });
    }, 300);
  };

  const handlePlatformChange = (p: PlatformFilter) => {
    setPlatform(p);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">감사 로그</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            사용자·관리자 활동(로그인·결제·삭제·승인 등)을 추적합니다
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => fetchLogs({ search: searchTerm, platform, page })}
          disabled={isLoading}
          className="flex items-center gap-2 h-11 px-5 text-sm font-semibold motion-reduce:transition-none"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
          새로고침
        </Button>
      </div>

      {/* 필터 바 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <StatusFilter
          options={[
            { value: 'all', label: '전체' },
            { value: 'web', label: '웹' },
            { value: 'admin', label: '관리자' },
            { value: 'app', label: '앱' },
          ]}
          selected={platform}
          onChange={(v) => handlePlatformChange(v as PlatformFilter)}
        />
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
          <Input
            placeholder="액션, 리소스 검색..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 h-10 text-sm"
            aria-label="감사 로그 검색"
          />
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0 tabular-nums">
          총 <span className="font-semibold text-slate-700 dark:text-slate-300">{total.toLocaleString()}</span>건
        </span>
      </div>

      {/* 로그 테이블 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider w-44 tabular-nums">시간</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider w-24">플랫폼</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider w-40">사용자</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider w-48">액션</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">리소스</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider w-32">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400 dark:text-slate-500">
                      <RefreshCw className="w-6 h-6 animate-spin motion-reduce:animate-none opacity-50" aria-hidden="true" />
                      <p className="text-sm">감사 로그를 불러오고 있습니다...</p>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400 dark:text-slate-500">
                      <History className="w-8 h-8 opacity-40" aria-hidden="true" />
                      <p className="text-sm">감사 로그가 없습니다.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-700/30 motion-reduce:transition-none transition-colors"
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                      {new Date(log.createdAt).toLocaleString('ko-KR', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-2.5">
                      {(() => {
                        const m = platformMeta(log.platform);
                        return (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${m.color}`}>
                            {m.icon}
                            {m.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                        <UserIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                        <span className="truncate max-w-[8rem]">{userLabel(log)}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${actionColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-300 break-all">
                      {log.resource || '-'}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                      {log.ipAddress || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30">
            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              <span className="font-semibold text-slate-700 dark:text-slate-300">{(page - 1) * PAGE_SIZE + 1} - {Math.min(page * PAGE_SIZE, total)}</span>
              <span className="text-slate-400 mx-1">/</span>
              <span>{total.toLocaleString()}건</span>
            </p>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isLoading}
                className="h-9 w-9 p-0 motion-reduce:transition-none"
                aria-label="이전 페이지"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </Button>
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 px-3 tabular-nums">
                {page} <span className="text-slate-400 font-normal">/</span> {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isLoading}
                className="h-9 w-9 p-0 motion-reduce:transition-none"
                aria-label="다음 페이지"
              >
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
