'use client';

/**
 * 시스템 로그 (서버/OS) 페이지 - TEAMPLUS
 *
 * 서버(OS) 레벨 정보 — 애플리케이션(서비스) 로그와 별개.
 *   - GET /admin/system/os-resources : CPU 부하·메모리·디스크·업타임 등 리소스 현황
 *   - GET /admin/system/os-logs       : 리눅스 시스템 로그 (journalctl 우선, syslog 폴백)
 */

import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Server, Cpu, MemoryStick, HardDrive, Clock, Search,
  AlertCircle, AlertTriangle, Info, Bug, RefreshCw, Terminal,
} from 'lucide-react';
import { api } from '@/services/api-client';

type OsLevel = 'ALL' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

interface OsResources {
  hostname: string;
  platform: string;
  release: string;
  arch: string;
  uptimeSec: number;
  loadavg: { '1m': number; '5m': number; '15m': number };
  cpu: { cores: number; model: string };
  memory: { totalMb: number; usedMb: number; freeMb: number; usedPercent: number };
  process: { pid: number; rssMb: number; nodeUptimeSec: number };
  disk: { totalGb: number; usedGb: number; availGb: number; usedPercent: number } | null;
  collectedAt: string;
}

interface OsLogEntry {
  timestamp: string | null;
  level: Exclude<OsLevel, 'ALL'>;
  source: string;
  message: string;
}

const LEVEL_CFG: Record<Exclude<OsLevel, 'ALL'>, { color: string; icon: React.ReactNode }> = {
  ERROR: { color: 'text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-400', icon: <AlertCircle className="w-3.5 h-3.5" /> },
  WARN: { color: 'text-yellow-700 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  INFO: { color: 'text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400', icon: <Info className="w-3.5 h-3.5" /> },
  DEBUG: { color: 'text-slate-600 bg-slate-100 dark:bg-slate-700 dark:text-slate-400', icon: <Bug className="w-3.5 h-3.5" /> },
};

const LEVEL_TABS: { value: OsLevel; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'ERROR', label: 'ERROR' },
  { value: 'WARN', label: 'WARN' },
];

function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return [d ? `${d}일` : '', h ? `${h}시간` : '', `${m}분`].filter(Boolean).join(' ');
}

function usageColor(pct: number): string {
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 75) return 'bg-amber-500';
  return 'bg-emerald-500';
}

export default function OsLogsPage() {
  const [resources, setResources] = useState<OsResources | null>(null);
  const [logs, setLogs] = useState<OsLogEntry[]>([]);
  const [logSource, setLogSource] = useState<string>('');
  const [level, setLevel] = useState<OsLevel>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadResources = useCallback(async () => {
    try {
      const res = await api.get<OsResources>('/admin/system/os-resources');
      setResources(res ?? null);
    } catch (err) {
      console.error('OS 리소스 조회 실패:', err);
      setResources(null);
    }
  }, []);

  const loadLogs = useCallback(async (lvl: OsLevel) => {
    setIsLoading(true);
    try {
      const params: Record<string, string | number> = { lines: 200 };
      if (lvl !== 'ALL') params.level = lvl;
      const res = await api.get<{ source: string; logs: OsLogEntry[] }>('/admin/system/os-logs', { params });
      setLogs(res?.logs || []);
      setLogSource(res?.source || '');
    } catch (err) {
      console.error('OS 로그 조회 실패:', err);
      setLogs([]);
      setLogSource('unavailable');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadResources();
  }, [loadResources]);

  useEffect(() => {
    loadLogs(level);
  }, [level, loadLogs]);

  const refresh = () => {
    loadResources();
    loadLogs(level);
  };

  const filteredLogs = searchTerm
    ? logs.filter((l) =>
        (l.message + l.source).toLowerCase().includes(searchTerm.toLowerCase()),
      )
    : logs;

  const resourceCards = resources
    ? [
        {
          icon: <Server className="w-5 h-5 text-primary" />,
          label: '서버',
          value: resources.hostname,
          sub: `${resources.platform} · ${resources.arch}`,
        },
        {
          icon: <Clock className="w-5 h-5 text-emerald-600" />,
          label: '업타임',
          value: fmtUptime(resources.uptimeSec),
          sub: `커널 ${resources.release}`,
        },
        {
          icon: <Cpu className="w-5 h-5 text-amber-600" />,
          label: 'CPU 부하 (1·5·15분)',
          value: `${resources.loadavg['1m']} · ${resources.loadavg['5m']} · ${resources.loadavg['15m']}`,
          sub: `${resources.cpu.cores} 코어`,
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">시스템 로그</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            서버(OS) 리소스 현황과 리눅스 시스템 로그를 확인합니다
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={refresh}
          disabled={isLoading}
          className="flex items-center gap-2 h-11 px-5 text-sm font-semibold motion-reduce:transition-none"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
          새로고침
        </Button>
      </div>

      {/* 리소스 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {resourceCards.map((c, idx) => (
          <div key={idx} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center">{c.icon}</div>
              <span className="text-sm text-slate-500 dark:text-slate-400">{c.label}</span>
            </div>
            <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums truncate">{c.value}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">{c.sub}</p>
          </div>
        ))}

        {/* 메모리 사용률 */}
        {resources && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                <MemoryStick className="w-5 h-5 text-purple-600" />
              </div>
              <span className="text-sm text-slate-500 dark:text-slate-400">메모리</span>
              <span className="ml-auto text-sm font-bold text-slate-900 dark:text-white tabular-nums">{resources.memory.usedPercent}%</span>
            </div>
            <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-1.5">
              <div className={`h-full rounded-full ${usageColor(resources.memory.usedPercent)}`} style={{ width: `${resources.memory.usedPercent}%` }} />
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
              {(resources.memory.usedMb / 1024).toFixed(1)} / {(resources.memory.totalMb / 1024).toFixed(1)} GB
            </p>
          </div>
        )}

        {/* 디스크 사용률 */}
        {resources?.disk && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                <HardDrive className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-sm text-slate-500 dark:text-slate-400">디스크 (/)</span>
              <span className="ml-auto text-sm font-bold text-slate-900 dark:text-white tabular-nums">{resources.disk.usedPercent}%</span>
            </div>
            <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-1.5">
              <div className={`h-full rounded-full ${usageColor(resources.disk.usedPercent)}`} style={{ width: `${resources.disk.usedPercent}%` }} />
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
              {resources.disk.usedGb} / {resources.disk.totalGb} GB 사용
            </p>
          </div>
        )}
      </div>

      {/* 로그 필터 바 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 flex-shrink-0" role="tablist" aria-label="로그 레벨 필터">
          {LEVEL_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={level === tab.value}
              onClick={() => setLevel(tab.value)}
              className={`min-h-[36px] px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors motion-reduce:transition-none whitespace-nowrap ${
                level === tab.value
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
          <Input
            placeholder="메시지, 소스 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-10 text-sm"
            aria-label="시스템 로그 검색"
          />
        </div>
        <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
          <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
          {logSource === 'unavailable' ? '로그 소스 없음' : `소스: ${logSource || '-'}`} · {filteredLogs.length.toLocaleString()}건
        </span>
      </div>

      {/* 로그 테이블 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider w-44 tabular-nums">시간</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider w-24">레벨</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider w-40">소스</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">메시지</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400 dark:text-slate-500">
                      <RefreshCw className="w-6 h-6 animate-spin motion-reduce:animate-none opacity-50" aria-hidden="true" />
                      <p className="text-sm">시스템 로그를 불러오고 있습니다...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400 dark:text-slate-500">
                      <Server className="w-8 h-8 opacity-40" aria-hidden="true" />
                      <p className="text-sm">{logSource === 'unavailable' ? '이 서버에서 시스템 로그를 읽을 수 없습니다 (권한/환경 확인).' : '표시할 로그가 없습니다.'}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log, idx) => {
                  const cfg = LEVEL_CFG[log.level] || LEVEL_CFG.INFO;
                  return (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 motion-reduce:transition-none transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                        {log.timestamp
                          ? new Date(log.timestamp).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
                          : '-'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${cfg.color}`}>
                          {cfg.icon}
                          {log.level}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap truncate max-w-[10rem]">
                        {log.source}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300 break-all font-mono text-xs">
                        {log.message}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
