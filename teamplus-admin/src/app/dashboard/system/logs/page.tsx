'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, FileText, AlertCircle, AlertTriangle, Info, Bug, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { api } from '@/services/api-client';

type LogLevel = 'ALL' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

interface LogEntry {
  id: string;
  timestamp: string;
  level: Exclude<LogLevel, 'ALL'>;
  module: string;
  message: string;
  userId?: string;
}

interface LogsResponse {
  data: LogEntry[];
  total: number;
  page: number;
  limit: number;
}

const LOG_LEVEL_CONFIG: Record<Exclude<LogLevel, 'ALL'>, { label: string; color: string; icon: React.ReactNode }> = {
  ERROR: {
    label: 'ERROR',
    color: 'text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-400',
    icon: <AlertCircle className="w-3.5 h-3.5" />,
  },
  WARN: {
    label: 'WARN',
    color: 'text-yellow-700 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400',
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  INFO: {
    label: 'INFO',
    color: 'text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400',
    icon: <Info className="w-3.5 h-3.5" />,
  },
  DEBUG: {
    label: 'DEBUG',
    color: 'text-slate-600 bg-slate-100 dark:bg-slate-700 dark:text-slate-400',
    icon: <Bug className="w-3.5 h-3.5" />,
  },
};

const LOG_LEVEL_TABS: { value: LogLevel; label: string }[] = [
  { value: 'ALL',   label: '전체' },
  { value: 'ERROR', label: 'ERROR' },
  { value: 'WARN',  label: 'WARN' },
  { value: 'INFO',  label: 'INFO' },
  { value: 'DEBUG', label: 'DEBUG' },
];

const PAGE_SIZE = 50;

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [activeLevel, setActiveLevel] = useState<LogLevel>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchLogs = useCallback(async (params: { level: LogLevel; search: string; page: number }) => {
    setIsLoading(true);
    try {
      const queryParams: Record<string, string | number> = {
        page: params.page,
        limit: PAGE_SIZE,
      };
      if (params.level !== 'ALL') queryParams.level = params.level;
      if (params.search) queryParams.search = params.search;

      const res = await api.get<LogsResponse | { data: LogsResponse }>('/admin/system/logs', { params: queryParams });
      const data = (res as { data: LogsResponse })?.data ?? res;
      setLogs(data.data || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('로그 조회 실패:', err);
      setLogs([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs({ level: activeLevel, search: searchTerm, page });
    // searchTerm은 디바운스(handleSearchChange)로 별도 처리하므로 의존성에서 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLevel, page, fetchLogs]);

  // 검색어 디바운스
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchLogs({ level: activeLevel, search: value, page: 1 });
    }, 300);
  };

  const handleLevelChange = (level: LogLevel) => {
    setActiveLevel(level);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">시스템 로그</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            서비스별 로그를 확인하고 검색합니다
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => fetchLogs({ level: activeLevel, search: searchTerm, page })}
          disabled={isLoading}
          className="flex items-center gap-2 h-11 px-5 text-sm font-semibold motion-reduce:transition-none"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
          새로고침
        </Button>
      </div>

      {/* 필터 바 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* 레벨 탭 */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 flex-shrink-0 overflow-x-auto" role="tablist" aria-label="로그 레벨 필터">
          {LOG_LEVEL_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={activeLevel === tab.value}
              onClick={() => handleLevelChange(tab.value)}
              className={`min-h-[36px] px-3.5 py-1.5 rounded-md text-xs font-semibold motion-reduce:transition-none transition-colors whitespace-nowrap ${
                activeLevel === tab.value
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 검색 */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
          <Input
            placeholder="모듈명, 메시지 검색..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 h-10 text-sm"
            aria-label="로그 검색"
          />
        </div>

        {/* 건수 */}
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
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider w-44 tabular-nums">
                  시간
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider w-24">
                  레벨
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider w-36">
                  모듈
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  메시지
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400 dark:text-slate-500">
                      <RefreshCw className="w-6 h-6 animate-spin motion-reduce:animate-none opacity-50" aria-hidden="true" />
                      <p className="text-sm">로그를 불러오고 있습니다...</p>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400 dark:text-slate-500">
                      <FileText className="w-8 h-8 opacity-40" aria-hidden="true" />
                      <p className="text-sm">로그가 없습니다.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const cfg = LOG_LEVEL_CONFIG[log.level] || LOG_LEVEL_CONFIG.INFO;
                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/30 motion-reduce:transition-none transition-colors"
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                        {new Date(log.timestamp).toLocaleString('ko-KR', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${cfg.color}`}>
                          {cfg.icon}
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {log.module}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300 break-all">
                        {log.message}
                      </td>
                    </tr>
                  );
                })
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
