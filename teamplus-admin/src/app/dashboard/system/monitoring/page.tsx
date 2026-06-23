'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Server,
  Database,
  Wifi,
  Activity,
  Users,
  Clock,
  RefreshCw,
  HardDrive,
  Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MiniStatsCard } from '@/components/ui/mini-stats-card';
import { api } from '@/services/api-client';

type ServiceStatus = 'normal' | 'warning' | 'error' | 'unknown';

interface ServiceCard {
  id: string;
  name: string;
  label: string;
  port?: number;
  status: ServiceStatus;
  responseTime: number | null;
  memoryUsage: number | null;
}

interface ServerInfo {
  ip: string;
  hostname: string;
  platform: string;
  arch: string;
  nodeVersion: string;
  uptime: number;
  memoryUsage: {
    total: number;
    free: number;
    usedPercent: number;
  };
  cpuLoad: number[];
}

interface SystemStatusResponse {
  server: ServerInfo;
  services: ServiceCard[];
  activeUsers: number;
  timestamp: string;
}

const STATUS_CONFIG: Record<ServiceStatus, { label: string; color: string; dot: string }> = {
  normal:  { label: '정상',   color: 'text-green-700 bg-green-50 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800',  dot: 'bg-green-500' },
  warning: { label: '경고',   color: 'text-yellow-700 bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800', dot: 'bg-yellow-500' },
  error:   { label: '오류',   color: 'text-red-700 bg-red-50 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',   dot: 'bg-red-500' },
  unknown: { label: '확인 중', color: 'text-slate-600 bg-slate-50 border-slate-200 dark:bg-slate-700/50 dark:text-slate-400 dark:border-slate-600', dot: 'bg-slate-400' },
};

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  backend: <Server className="w-5 h-5" />,
  web: <Wifi className="w-5 h-5" />,
  admin: <Activity className="w-5 h-5" />,
  db: <Database className="w-5 h-5" />,
  redis: <Database className="w-5 h-5" />,
};

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}일 ${h}시간 ${m}분`;
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(1)} GB`;
}

export default function MonitoringPage() {
  const [services, setServices] = useState<ServiceCard[]>([]);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [activeUsers, setActiveUsers] = useState<number | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchStatus = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const res = await api.get<SystemStatusResponse | { data: SystemStatusResponse }>('/admin/system/status');
      const data = (res as { data: SystemStatusResponse })?.data ?? res;
      setServerInfo(data.server);
      setServices(data.services || []);
      setActiveUsers(data.activeUsers ?? 0);
      setLastChecked(
        new Date(data.timestamp).toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    } catch (err) {
      console.error('시스템 상태 조회 실패:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(() => fetchStatus(), 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin motion-reduce:animate-none text-slate-400" aria-hidden="true" />
        <span className="ml-2 text-slate-500">시스템 상태를 확인하고 있습니다...</span>
      </div>
    );
  }

  const memoryPercent = serverInfo?.memoryUsage.usedPercent ?? 0;
  const memoryBarColor = memoryPercent > 90
    ? 'bg-red-500'
    : memoryPercent > 70
    ? 'bg-amber-500'
    : 'bg-green-500';

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">시스템 모니터링</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            서버 상태 및 리소스 현황을 실시간으로 확인합니다
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => fetchStatus(true)}
          disabled={isRefreshing}
          className="h-11 px-5 text-sm font-semibold flex items-center gap-2 motion-reduce:transition-none"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
          새로고침
        </Button>
      </div>

      {/* 상단 요약 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MiniStatsCard
          title="활성 사용자"
          value={activeUsers !== null ? `${activeUsers.toLocaleString()}명` : '-'}
          icon={<Users className="w-5 h-5" aria-hidden="true" />}
          variant="info"
        />
        <MiniStatsCard
          title="정상 서비스"
          value={`${services.filter(s => s.status === 'normal').length} / ${services.length}`}
          icon={<Activity className="w-5 h-5" aria-hidden="true" />}
          variant="success"
        />
        <MiniStatsCard
          title="마지막 확인"
          value={lastChecked ?? '-'}
          icon={<Clock className="w-5 h-5" aria-hidden="true" />}
          variant="neutral"
        />
      </div>

      {/* 서버 정보 카드 */}
      {serverInfo && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
              <Globe className="w-4.5 h-4.5 text-slate-600 dark:text-slate-300" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">서버 정보</h2>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-5">
            <div>
              <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">IP 주소</dt>
              <dd className="text-sm font-semibold text-slate-900 dark:text-white mt-1 font-mono tabular-nums">{serverInfo.ip}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">호스트명</dt>
              <dd className="text-sm font-medium text-slate-700 dark:text-slate-300 mt-1 truncate">{serverInfo.hostname}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">플랫폼</dt>
              <dd className="text-sm font-medium text-slate-700 dark:text-slate-300 mt-1">{serverInfo.platform} ({serverInfo.arch})</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Node.js</dt>
              <dd className="text-sm font-medium text-slate-700 dark:text-slate-300 mt-1 font-mono">{serverInfo.nodeVersion}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">가동 시간</dt>
              <dd className="text-sm font-medium text-slate-700 dark:text-slate-300 mt-1 tabular-nums">{formatUptime(serverInfo.uptime)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">CPU 로드</dt>
              <dd className="text-sm font-medium text-slate-700 dark:text-slate-300 mt-1 tabular-nums">
                {serverInfo.cpuLoad.map((v) => v.toFixed(2)).join(' / ')}
              </dd>
            </div>
          </dl>

          {/* 메모리 바 */}
          <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-slate-400" aria-hidden="true" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">메모리 사용량</span>
              </div>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                {formatBytes(serverInfo.memoryUsage.total - serverInfo.memoryUsage.free)}
                <span className="text-slate-400 mx-1">/</span>
                {formatBytes(serverInfo.memoryUsage.total)}
                <span className="ml-2 text-slate-500">({memoryPercent}%)</span>
              </span>
            </div>
            <div
              className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={memoryPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="메모리 사용률"
            >
              <div
                className={`h-full rounded-full motion-reduce:transition-none transition-all ${memoryBarColor}`}
                style={{ width: `${memoryPercent}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 서비스 상태 카드 */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">서비스 상태</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {services.map((service) => {
            const cfg = STATUS_CONFIG[service.status] || STATUS_CONFIG.unknown;
            return (
              <div
                key={service.id}
                className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0">
                      {SERVICE_ICONS[service.id] || <Server className="w-5 h-5" aria-hidden="true" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{service.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{service.label}</p>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border shrink-0 ${cfg.color}`}
                    role="status"
                    aria-label={`상태: ${cfg.label}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} aria-hidden="true" />
                    {cfg.label}
                  </span>
                </div>

                {service.port && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 tabular-nums">
                    포트 <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">:{service.port}</span>
                  </p>
                )}

                <dl className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100 dark:border-slate-700">
                  <div>
                    <dt className="text-xs text-slate-500 dark:text-slate-400">응답시간</dt>
                    <dd className="text-sm font-semibold text-slate-900 dark:text-white mt-1 tabular-nums">
                      {service.responseTime !== null ? `${service.responseTime}ms` : '-'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500 dark:text-slate-400">메모리</dt>
                    <dd className="text-sm font-semibold text-slate-900 dark:text-white mt-1 tabular-nums">
                      {service.memoryUsage !== null ? `${service.memoryUsage}MB` : '-'}
                    </dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
