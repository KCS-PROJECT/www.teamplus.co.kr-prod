'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Search,
  ReceiptText,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Clock,
  Gauge,
  Activity,
} from 'lucide-react';
import { api } from '@/services/api-client';

// ============ 타입 ============
type TxResult = 'SUCCESS' | 'FAIL' | 'ERROR';
type ResultTab = 'ALL' | TxResult;

interface TxLogListItem {
  id: string;
  requestId: string;
  occurredAt: string;
  method: string;
  path: string;
  httpStatus: number;
  bizSuccess: boolean | null;
  result: TxResult;
  errorCode: string | null;
  durationMs: number;
  userId: string | null;
  userRole: string | null;
  userEmail: string | null;
  userName: string | null;
  platform: string | null;
  clientVersion: string | null;
  viewId: string | null;
  ip: string | null;
  responseBytes: number | null;
  truncated: boolean;
}

interface TxLogDetail extends TxLogListItem {
  errorMessage: string | null;
  env: string;
  schemaVersion: number;
  requestHeaders: unknown;
  requestBody: unknown;
  requestQuery: unknown;
  requestParams: unknown;
  responseHeaders: unknown;
  responseBody: unknown;
  createdAt: string;
}

interface TxListResponse {
  data: TxLogListItem[];
  total: number;
  page: number;
  limit: number;
}

interface TxSummary {
  total: number;
  result: { SUCCESS: number; FAIL: number; ERROR: number };
  successRate: number;
  avgDurationMs: number;
  maxDurationMs: number;
  platformStats: {
    platform: string;
    total: number;
    success: number;
    successRate: number;
  }[];
  failTopPaths: { path: string; count: number }[];
  slowTopPaths: { path: string; avgDurationMs: number }[];
  range: { from: string | null; to: string | null };
}

// ============ 상수 ============
const PAGE_SIZE = 50;

const RESULT_CONFIG: Record<TxResult, { label: string; badge: string; dot: string }> = {
  SUCCESS: {
    label: '성공',
    badge: 'text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400',
    dot: 'bg-green-500',
  },
  FAIL: {
    label: '실패',
    badge: 'text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  ERROR: {
    label: '에러',
    badge: 'text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-400',
    dot: 'bg-red-500',
  },
};

const RESULT_TABS: { value: ResultTab; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'SUCCESS', label: '성공' },
  { value: 'FAIL', label: '실패' },
  { value: 'ERROR', label: '에러' },
];

const PLATFORM_OPTIONS = ['', 'web', 'admin', 'ios', 'android', 'flutter', 'unknown'];
const METHOD_OPTIONS = ['', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function fmtKst(iso: string): string {
  try {
    const parts = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).formatToParts(new Date(iso));
    const get = (t: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === t)?.value ?? '';
    // 형식: "2026.06.08. 오후 06:21:11" (연도 포함, 날짜는 점 구분)
    return `${get('year')}.${get('month')}.${get('day')}. ${get('dayPeriod')} ${get('hour')}:${get('minute')}:${get('second')}`;
  } catch {
    return iso;
  }
}

/**
 * 검색어 형태로 검색 대상 자동 인식.
 * UUID → requestId · cuid(c+영숫자) → userId · '@' → userEmail · 파일경로(.tsx/.ts/src/) → viewId · 그 외 → path
 */
function detectSearchField(
  q: string,
): 'requestId' | 'viewId' | 'userEmail' | 'userId' | 'path' {
  const t = q.trim();
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}/.test(t)) return 'requestId';
  // cuid (사용자 ID): 'c' + 영숫자 20자 이상 (예: cmoib0id90000yhh7isgp2auh)
  if (/^c[a-z0-9]{20,}$/i.test(t)) return 'userId';
  if (t.includes('@')) return 'userEmail';
  if (t.includes('.tsx') || t.includes('.ts') || t.includes('src/')) return 'viewId';
  return 'path';
}

function statusColor(status: number): string {
  if (status >= 500) return 'text-red-600 dark:text-red-400';
  if (status >= 400) return 'text-amber-600 dark:text-amber-400';
  if (status >= 300) return 'text-blue-600 dark:text-blue-400';
  return 'text-green-600 dark:text-green-400';
}

function durationColor(ms: number): string {
  if (ms >= 1000) return 'text-red-600 dark:text-red-400 font-semibold';
  if (ms >= 500) return 'text-amber-600 dark:text-amber-400';
  return 'text-slate-600 dark:text-slate-400';
}

// ============ 요약 카드 ============
function SummaryCards({ summary }: { summary: TxSummary | null }) {
  if (!summary) return null;
  const { result } = summary;
  const cards = [
    { label: '총 호출수', value: summary.total.toLocaleString(), icon: <Activity className="w-4 h-4" />, sub: '건' },
    { label: '성공률', value: `${summary.successRate}`, icon: <CheckCircle2 className="w-4 h-4" />, sub: '%' },
    { label: '평균 응답', value: summary.avgDurationMs.toLocaleString(), icon: <Gauge className="w-4 h-4" />, sub: 'ms' },
    { label: '최대 응답', value: summary.maxDurationMs.toLocaleString(), icon: <Clock className="w-4 h-4" />, sub: 'ms' },
  ];
  const total = summary.total || 1;
  const segs: { key: TxResult; count: number }[] = [
    { key: 'SUCCESS', count: result.SUCCESS },
    { key: 'FAIL', count: result.FAIL },
    { key: 'ERROR', count: result.ERROR },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4"
          >
            <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 mb-2">
              {c.icon}
              <span className="text-xs font-medium">{c.label}</span>
            </div>
            <p className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
              {c.value}
              <span className="text-sm font-medium text-slate-400 ml-1">{c.sub}</span>
            </p>
          </div>
        ))}
      </div>

      {/* result 분포 막대 + platform별 성공률 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">결과 분포</p>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-700 mb-3">
            {segs.map((s) => (
              <div
                key={s.key}
                className={RESULT_CONFIG[s.key].dot}
                style={{ width: `${(s.count / total) * 100}%` }}
                title={`${RESULT_CONFIG[s.key].label} ${s.count}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {segs.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5 text-xs">
                <span className={`w-2 h-2 rounded-full ${RESULT_CONFIG[s.key].dot}`} />
                <span className="text-slate-600 dark:text-slate-400">{RESULT_CONFIG[s.key].label}</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                  {s.count.toLocaleString()}
                </span>
              </span>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">플랫폼별 성공률</p>
          {summary.platformStats.length === 0 ? (
            <p className="text-xs text-slate-400">데이터 없음</p>
          ) : (
            <div className="space-y-2">
              {summary.platformStats.map((p) => (
                <div key={p.platform} className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300 w-16 truncate">
                    {p.platform}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: `${p.successRate}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums w-20 text-right">
                    {p.successRate}% ({p.total})
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top N (접이식) */}
      {(summary.failTopPaths.length > 0 || summary.slowTopPaths.length > 0) && (
        <details className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <summary className="text-xs font-semibold text-slate-500 dark:text-slate-400 cursor-pointer select-none">
            실패 많은 API · 느린 API Top 10
          </summary>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
            <div>
              <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-2">실패 많은 API</p>
              <ul className="space-y-1">
                {summary.failTopPaths.length === 0 ? (
                  <li className="text-xs text-slate-400">없음</li>
                ) : (
                  summary.failTopPaths.map((f, i) => (
                    <li key={i} className="flex items-center justify-between text-xs gap-2">
                      <span className="font-mono text-slate-600 dark:text-slate-300 truncate">{f.path}</span>
                      <span className="font-semibold text-red-600 dark:text-red-400 tabular-nums flex-shrink-0">
                        {f.count}건
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-2">느린 API</p>
              <ul className="space-y-1">
                {summary.slowTopPaths.length === 0 ? (
                  <li className="text-xs text-slate-400">없음</li>
                ) : (
                  summary.slowTopPaths.map((s, i) => (
                    <li key={i} className="flex items-center justify-between text-xs gap-2">
                      <span className="font-mono text-slate-600 dark:text-slate-300 truncate">{s.path}</span>
                      <span className="font-semibold text-amber-600 dark:text-amber-400 tabular-nums flex-shrink-0">
                        {s.avgDurationMs.toLocaleString()}ms
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

// ============ JSON 블록 ============
function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const isEmpty =
    value === null ||
    value === undefined ||
    (typeof value === 'object' && value !== null && Object.keys(value as object).length === 0);
  return (
    <div>
      <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
        {label}
      </h4>
      {isEmpty ? (
        <p className="text-xs text-slate-400 dark:text-slate-500 italic px-3 py-2">없음</p>
      ) : (
        <pre className="text-xs bg-slate-50 dark:bg-slate-900/60 rounded-lg p-3 overflow-auto text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 max-h-72 whitespace-pre-wrap break-all">
          {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ============ 상세 모달 ============
function DetailModal({
  requestId,
  onClose,
}: {
  requestId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<TxLogDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setIsLoading(true);
      try {
        const res = await api.get<TxLogDetail | { data: TxLogDetail }>(
          `/admin/system/logs/transactions/${encodeURIComponent(requestId)}`,
        );
        const data = (res as { data?: TxLogDetail })?.data ?? (res as TxLogDetail);
        if (alive) setDetail(data ?? null);
      } catch (err) {
        console.error('거래로그 상세 조회 실패:', err);
        if (alive) setDetail(null);
      } finally {
        if (alive) setIsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [requestId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-3xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 rounded-t-2xl">
          <div className="flex items-center gap-2 min-w-0">
            <ReceiptText className="w-5 h-5 text-slate-400 flex-shrink-0" aria-hidden="true" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">거래로그 상세</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 motion-reduce:transition-none transition-colors"
            aria-label="닫기"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin motion-reduce:animate-none opacity-50" aria-hidden="true" />
              <p className="text-sm">불러오는 중...</p>
            </div>
          ) : !detail ? (
            <p className="text-sm text-slate-400 text-center py-16">상세 정보를 찾을 수 없습니다.</p>
          ) : (
            <>
              {/* 메타 그리드 */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5 text-xs">
                <Meta label="결과">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded font-semibold ${RESULT_CONFIG[detail.result].badge}`}
                  >
                    {RESULT_CONFIG[detail.result].label}
                  </span>
                </Meta>
                <Meta label="HTTP">
                  <span className={`font-bold tabular-nums ${statusColor(detail.httpStatus)}`}>
                    {detail.httpStatus}
                  </span>
                </Meta>
                <Meta label="응답시간">
                  <span className={`tabular-nums ${durationColor(detail.durationMs)}`}>
                    {detail.durationMs.toLocaleString()}ms
                  </span>
                </Meta>
                <Meta label="Method">{detail.method}</Meta>
                <Meta label="Platform">{detail.platform ?? '-'}</Meta>
                <Meta label="bizSuccess">{String(detail.bizSuccess)}</Meta>
                <Meta label="시각(KST)">{fmtKst(detail.occurredAt)}</Meta>
                <Meta label="사용자">{detail.userName ?? '-'}</Meta>
                <Meta label="userRole">{detail.userRole ?? '-'}</Meta>
                <Meta label="userEmail">{detail.userEmail ?? '-'}</Meta>
                <Meta label="userId">{detail.userId ?? '-'}</Meta>
                <Meta label="ip">{detail.ip ?? '-'}</Meta>
                <Meta label="clientVersion">{detail.clientVersion ?? '-'}</Meta>
                <Meta label="env">{detail.env}</Meta>
              </div>

              <div className="text-xs space-y-1.5 pt-1">
                <div className="flex gap-2">
                  <span className="text-slate-400 w-20 flex-shrink-0">path</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300 break-all">{detail.path}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-slate-400 w-20 flex-shrink-0">requestId</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300 break-all">{detail.requestId}</span>
                </div>
                {detail.viewId && (
                  <div className="flex gap-2">
                    <span className="text-slate-400 w-20 flex-shrink-0">viewId</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300 break-all">{detail.viewId}</span>
                  </div>
                )}
                {detail.truncated && (
                  <p className="text-amber-600 dark:text-amber-400 font-medium">
                    ⚠ payload가 10KB를 초과하여 일부 잘려 저장되었습니다.
                  </p>
                )}
              </div>

              {(detail.errorCode || detail.errorMessage) && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 p-3 text-xs">
                  {detail.errorCode && (
                    <p className="font-semibold text-red-700 dark:text-red-400">errorCode: {detail.errorCode}</p>
                  )}
                  {detail.errorMessage && (
                    <p className="text-red-600 dark:text-red-300 mt-1 break-all">{detail.errorMessage}</p>
                  )}
                </div>
              )}

              {/* 요청 / 응답 payload */}
              <div className="grid grid-cols-1 gap-3 pt-1">
                <JsonBlock label="요청 헤더" value={detail.requestHeaders} />
                <JsonBlock label="요청 Query" value={detail.requestQuery} />
                <JsonBlock label="요청 Params" value={detail.requestParams} />
                <JsonBlock label="요청 Body" value={detail.requestBody} />
                <JsonBlock label="응답 헤더" value={detail.responseHeaders} />
                <JsonBlock label="응답 Body" value={detail.responseBody} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-slate-400 dark:text-slate-500 mb-0.5">{label}</p>
      <p className="text-slate-700 dark:text-slate-200 font-medium break-all">{children}</p>
    </div>
  );
}

// ============ 메인 ============
export default function TransactionLogsPage() {
  const [rows, setRows] = useState<TxLogListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<TxSummary | null>(null);
  const [activeResult, setActiveResult] = useState<ResultTab>('ALL');
  const [platform, setPlatform] = useState('');
  const [method, setMethod] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchList = useCallback(
    async (params: {
      result: ResultTab;
      platform: string;
      method: string;
      status: string;
      search: string;
      page: number;
    }) => {
      setIsLoading(true);
      try {
        const q: Record<string, string | number> = { page: params.page, limit: PAGE_SIZE };
        if (params.result !== 'ALL') q.result = params.result;
        if (params.platform) q.platform = params.platform;
        if (params.method) q.method = params.method;
        if (params.status) q.httpStatus = params.status;
        // 검색어 형태로 검색 대상 자동 인식 (UUID→requestId, @→이메일, 파일경로→viewId, 그 외 path)
        if (params.search) q[detectSearchField(params.search)] = params.search;

        const res = await api.get<TxListResponse>(
          '/admin/system/logs/transactions',
          { params: q },
        );
        // api-client.extractData 가 {success,data} 를 1회 해제 → res = {data, total, page, limit}.
        //   (한 번 더 res.data 로 내려가면 rows 배열을 잡아 .data 가 undefined 가 되므로 금지)
        const result = (res ?? {}) as TxListResponse;
        setRows(Array.isArray(result.data) ? result.data : []);
        setTotal(result.total ?? 0);
      } catch (err) {
        console.error('거래로그 조회 실패:', err);
        setRows([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const fetchSummary = useCallback(async () => {
    try {
      const res = await api.get<TxSummary | { data: TxSummary }>(
        '/admin/system/logs/transactions/summary',
      );
      const data = (res as { data?: TxSummary })?.data ?? (res as TxSummary);
      setSummary(data ?? null);
    } catch (err) {
      console.error('거래로그 요약 조회 실패:', err);
      setSummary(null);
    }
  }, []);

  useEffect(() => {
    fetchList({ result: activeResult, platform, method, status: statusFilter, search, page });
    // search 는 디바운스로 별도 처리
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeResult, platform, method, statusFilter, page, fetchList]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchList({ result: activeResult, platform, method, status: statusFilter, search: value, page: 1 });
    }, 300);
  };

  const refresh = () => {
    fetchList({ result: activeResult, platform, method, status: statusFilter, search, page });
    fetchSummary();
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const selectClass =
    'h-10 px-3 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40';

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">거래로그</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            web·앱·관리자의 모든 API 거래(요청·응답)를 requestId 단위로 조회·분석합니다
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={refresh}
          disabled={isLoading}
          className="flex items-center gap-2 h-11 px-5 text-sm font-semibold motion-reduce:transition-none"
        >
          <RefreshCw
            className={`w-4 h-4 ${isLoading ? 'animate-spin motion-reduce:animate-none' : ''}`}
            aria-hidden="true"
          />
          새로고침
        </Button>
      </div>

      {/* 요약 */}
      <SummaryCards summary={summary} />

      {/* 필터 바 */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* result 탭 */}
          <div
            className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 flex-shrink-0"
            role="tablist"
            aria-label="결과 필터"
          >
            {RESULT_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={activeResult === tab.value}
                onClick={() => {
                  setActiveResult(tab.value);
                  setPage(1);
                }}
                className={`min-h-[36px] px-3.5 py-1.5 rounded-md text-xs font-semibold motion-reduce:transition-none transition-colors whitespace-nowrap ${
                  activeResult === tab.value
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <select
            className={selectClass}
            value={platform}
            onChange={(e) => {
              setPlatform(e.target.value);
              setPage(1);
            }}
            aria-label="플랫폼 필터"
          >
            {PLATFORM_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p === '' ? '전체 플랫폼' : p}
              </option>
            ))}
          </select>

          <select
            className={selectClass}
            value={method}
            onChange={(e) => {
              setMethod(e.target.value);
              setPage(1);
            }}
            aria-label="메서드 필터"
          >
            {METHOD_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m === '' ? '전체 메서드' : m}
              </option>
            ))}
          </select>

          <Input
            type="number"
            placeholder="상태코드"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="h-10 w-28 text-sm"
            aria-label="HTTP 상태코드 필터"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* 검색 */}
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
            <Input
              placeholder="검색 (path · requestId · userId · viewId · 이메일 자동 인식)"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 h-10 text-sm"
              aria-label="거래로그 검색"
            />
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0 tabular-nums">
            총 <span className="font-semibold text-slate-700 dark:text-slate-300">{total.toLocaleString()}</span>건
          </span>
        </div>
      </div>

      {/* 테이블 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
              <tr>
                {['시각', 'PF', 'Method · Path', 'HTTP', '결과', '응답', '사용자', 'requestId'].map((h, i) => (
                  <th
                    key={h}
                    scope="col"
                    className={`px-3 py-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap ${
                      i === 2 ? 'text-left' : 'text-center'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400 dark:text-slate-500">
                      <RefreshCw className="w-6 h-6 animate-spin motion-reduce:animate-none opacity-50" aria-hidden="true" />
                      <p className="text-sm">거래로그를 불러오고 있습니다...</p>
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400 dark:text-slate-500">
                      <ReceiptText className="w-8 h-8 opacity-40" aria-hidden="true" />
                      <p className="text-sm">거래로그가 없습니다.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const cfg = RESULT_CONFIG[r.result];
                  const resultIcon =
                    r.result === 'SUCCESS' ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : r.result === 'FAIL' ? (
                      <AlertTriangle className="w-3.5 h-3.5" />
                    ) : (
                      <AlertOctagon className="w-3.5 h-3.5" />
                    );
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setSelected(r.requestId)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/30 motion-reduce:transition-none transition-colors cursor-pointer"
                    >
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums text-center">
                        {fmtKst(r.occurredAt)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap text-center">
                        {r.platform ?? '-'}
                      </td>
                      <td className="px-3 py-2.5 text-left">
                        <span className="font-mono text-xs whitespace-nowrap">
                          <span className="font-semibold text-slate-500 dark:text-slate-400">{r.method}</span>{' '}
                          <span className="text-slate-700 dark:text-slate-300">{r.path}</span>
                        </span>
                      </td>
                      <td className={`px-3 py-2.5 text-xs font-bold tabular-nums whitespace-nowrap text-center ${statusColor(r.httpStatus)}`}>
                        {r.httpStatus}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap ${cfg.badge}`}>
                          {resultIcon}
                          {cfg.label}
                        </span>
                      </td>
                      <td className={`px-3 py-2.5 text-xs tabular-nums whitespace-nowrap text-center ${durationColor(r.durationMs)}`}>
                        {r.durationMs.toLocaleString()}ms
                      </td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap text-center">
                        {r.userName ? (
                          <span className="inline-flex flex-col leading-tight">
                            <span className="text-slate-700 dark:text-slate-200 font-medium">{r.userName}</span>
                            {r.userRole && (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500">{r.userRole}</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">{r.userRole ?? '-'}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap text-center">
                        {r.requestId}
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
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {(page - 1) * PAGE_SIZE + 1} - {Math.min(page * PAGE_SIZE, total)}
              </span>
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

      {selected && <DetailModal requestId={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
