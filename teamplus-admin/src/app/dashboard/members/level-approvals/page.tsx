'use client';

/**
 * Task #40 C-5 감독 승인 UI (Admin)
 *
 * 자동 계산된 선수 등급 변경을 감독(ADMIN/DIRECTOR/ACADEMY_DIRECTOR)이
 * 승인하거나 직접 오버라이드하는 페이지.
 *
 * 백엔드:
 *   - GET   /api/v1/member-level/pending?season=
 *   - PATCH /api/v1/member-level/:historyId/approve
 *   - PATCH /api/v1/member-level/:historyId/override   body { newLevel }
 *   - POST  /api/v1/member-level/run                   (ADMIN)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Award,
  Calendar,
  Check,
  ChevronsUp,
  ChevronsDown,
  Edit3,
  Minus,
  PlayCircle,
  RefreshCw,
  Trophy,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  memberLevelService,
  parseReason,
  type MemberLevelTier,
  type PendingLevelApproval,
} from '@/services/member-level.service';

// ───────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────

const TIER_BADGE: Record<number, { label: string; className: string }> = {
  1: {
    label: '하위',
    className:
      'bg-slate-100 text-slate-700 dark:bg-slate-700/60 dark:text-slate-200 border-transparent',
  },
  2: {
    label: '중위',
    className:
      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-transparent',
  },
  3: {
    label: '상위',
    className:
      'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-transparent',
  },
};

const TIER_OPTIONS: { value: MemberLevelTier; label: string }[] = [
  { value: 1, label: '1 · 하위' },
  { value: 2, label: '2 · 중위' },
  { value: 3, label: '3 · 상위' },
];

/** 현재 시즌 문자열 (9월 이후는 차년도 시즌으로 간주) */
function getCurrentSeason(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

/** 최근 3개 시즌 옵션 */
function buildSeasonOptions(): string[] {
  const current = getCurrentSeason();
  const [startStr] = current.split('-');
  const start = Number(startStr);
  return [
    current,
    `${start - 1}-${start}`,
    `${start - 2}-${start - 1}`,
  ];
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function displayName(
  user: PendingLevelApproval['user'],
  fallback: string,
): string {
  if (!user) return fallback;
  const full = `${user.lastName ?? ''}${user.firstName ?? ''}`.trim();
  return full || fallback;
}

function formatScore(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return '-';
  return value.toFixed(1);
}

// ───────────────────────────────────────────────────────────
// Tier Diff 컴포넌트
// ───────────────────────────────────────────────────────────

function TierDiff({ from, to }: { from: number; to: number }) {
  const fromBadge = TIER_BADGE[from] ?? TIER_BADGE[1];
  const toBadge = TIER_BADGE[to] ?? TIER_BADGE[1];

  const Icon = to > from ? ChevronsUp : to < from ? ChevronsDown : Minus;
  const iconClass =
    to > from
      ? 'text-green-600 dark:text-green-400'
      : to < from
        ? 'text-red-600 dark:text-red-400'
        : 'text-slate-500 dark:text-slate-400';

  return (
    <div className="flex items-center gap-2">
      <Badge className={fromBadge.className}>{fromBadge.label}</Badge>
      <ArrowRight aria-hidden="true" className="h-4 w-4 text-slate-400" />
      <Badge className={toBadge.className}>{toBadge.label}</Badge>
      <Icon
        aria-hidden="true"
        className={`h-4 w-4 ${iconClass} motion-reduce:transition-none`}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Score Bars — composite/attendance/tournament/coach 4지표
// ───────────────────────────────────────────────────────────

function ScoreBars({
  composite,
  attendance,
  tournament,
  coach,
}: {
  composite?: number;
  attendance?: number;
  tournament?: number;
  coach?: number;
}) {
  const items: {
    label: string;
    value?: number;
    color: string;
  }[] = [
    { label: '종합', value: composite, color: 'bg-blue-500' },
    { label: '출석', value: attendance, color: 'bg-emerald-500' },
    { label: '대회', value: tournament, color: 'bg-amber-500' },
    { label: '코치', value: coach, color: 'bg-purple-500' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map((item) => {
        const safe = Math.max(0, Math.min(100, item.value ?? 0));
        return (
          <div key={item.label}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-500 dark:text-slate-400">
                {item.label}
              </span>
              <span className="font-medium text-slate-700 dark:text-slate-200 tabular-nums">
                {formatScore(item.value)}
              </span>
            </div>
            <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full ${item.color} motion-reduce:transition-none`}
                style={{ width: `${safe}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Approval Card
// ───────────────────────────────────────────────────────────

interface ApprovalCardProps {
  item: PendingLevelApproval;
  processing: boolean;
  onApprove: (historyId: string) => void;
  onOverride: (item: PendingLevelApproval) => void;
}

function ApprovalCard({
  item,
  processing,
  onApprove,
  onOverride,
}: ApprovalCardProps) {
  const parsed = useMemo(() => parseReason(item.reason), [item.reason]);

  return (
    <Card className="p-5 space-y-4 shadow-md rounded-xl hover:shadow-md transition-shadow motion-reduce:transition-none">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Users
              aria-hidden="true"
              className="h-4 w-4 text-slate-400 dark:text-slate-500"
            />
            <p className="font-semibold text-slate-900 dark:text-white">
              {displayName(item.user, '회원')}
            </p>
            {item.season && (
              <Badge
                variant="outline"
                className="border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              >
                {item.season}
              </Badge>
            )}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {item.user?.email ?? '이메일 정보 없음'}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
            <Calendar aria-hidden="true" className="h-3 w-3" />
            계산 시각 · {formatDateTime(item.changedAt)}
          </p>
        </div>

        <TierDiff from={item.previousLevel} to={item.newLevel} />
      </div>

      <div className="pt-3 border-t border-slate-100 dark:border-slate-700">
        <ScoreBars
          composite={parsed.composite}
          attendance={parsed.attendance}
          tournament={parsed.tournament}
          coach={parsed.coach}
        />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOverride(item)}
          disabled={processing}
        >
          <Edit3 aria-hidden="true" className="h-4 w-4" />
          직접 변경하기
        </Button>
        <Button
          type="button"
          variant="success"
          onClick={() => onApprove(item.id)}
          disabled={processing}
        >
          <Check aria-hidden="true" className="h-4 w-4" />
          승인하기
        </Button>
      </div>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────
// Main Page
// ───────────────────────────────────────────────────────────

type MessageState = { type: 'success' | 'error'; text: string } | null;

export default function MemberLevelApprovalsPage() {
  const seasonOptions = useMemo(() => buildSeasonOptions(), []);
  const [season, setSeason] = useState<string>(seasonOptions[0]);
  const [items, setItems] = useState<PendingLevelApproval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<MessageState>(null);

  const [overrideTarget, setOverrideTarget] =
    useState<PendingLevelApproval | null>(null);
  const [overrideLevel, setOverrideLevel] = useState<MemberLevelTier>(2);

  const load = useCallback(async (seasonKey?: string) => {
    setIsLoading(true);
    try {
      const data = await memberLevelService.getPendingApprovals(seasonKey);
      setItems(data);
    } catch (error) {
      setItems([]);
      const text =
        error instanceof Error
          ? error.message
          : '승인 대기 목록을 불러오지 못했습니다.';
      setMessage({ type: 'error', text });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(season);
  }, [season, load]);

  const handleApprove = useCallback(
    async (historyId: string) => {
      setProcessingId(historyId);
      try {
        await memberLevelService.approveLevel(historyId);
        setItems((prev) => prev.filter((it) => it.id !== historyId));
        setMessage({ type: 'success', text: '등급이 승인되었습니다.' });
      } catch (error) {
        const text =
          error instanceof Error
            ? error.message
            : '등급 승인 처리에 실패했습니다.';
        setMessage({ type: 'error', text });
      } finally {
        setProcessingId(null);
      }
    },
    [],
  );

  const handleOpenOverride = useCallback((item: PendingLevelApproval) => {
    setOverrideTarget(item);
    setOverrideLevel((item.newLevel as MemberLevelTier) ?? 2);
  }, []);

  const handleCloseOverride = useCallback(() => {
    setOverrideTarget(null);
  }, []);

  const handleConfirmOverride = useCallback(async () => {
    if (!overrideTarget) return;
    setProcessingId(overrideTarget.id);
    try {
      await memberLevelService.overrideLevel(overrideTarget.id, overrideLevel);
      setItems((prev) => prev.filter((it) => it.id !== overrideTarget.id));
      setMessage({ type: 'success', text: '등급이 변경되었습니다.' });
      setOverrideTarget(null);
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : '등급 변경 처리에 실패했습니다.';
      setMessage({ type: 'error', text });
    } finally {
      setProcessingId(null);
    }
  }, [overrideTarget, overrideLevel]);

  const handleRunCalculation = useCallback(async () => {
    setIsRunning(true);
    try {
      const result = await memberLevelService.runCalculation();
      setMessage({
        type: 'success',
        text: `등급 계산이 완료되었습니다. ${result.processed}/${result.total}명 처리됨.`,
      });
      await load(season);
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : '등급 계산 실행에 실패했습니다.';
      setMessage({ type: 'error', text });
    } finally {
      setIsRunning(false);
    }
  }, [load, season]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="선수 등급 승인"
        subtitle="자동 계산된 등급 변경 요청을 검토하고 승인 또는 직접 변경합니다."
        actions={[
          {
            label: '새로고침',
            onClick: () => void load(season),
            icon: RefreshCw,
            variant: 'outline',
          },
          {
            label: isRunning ? '계산 중...' : '등급 계산 실행',
            onClick: () => {
              if (isRunning) return;
              void handleRunCalculation();
            },
            icon: PlayCircle,
            variant: 'secondary',
          },
        ]}
      />

      {/* 시즌 필터 & 요약 */}
      <Card className="p-5 space-y-4 shadow-md rounded-xl">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div className="w-full md:w-72">
            <label
              htmlFor="season-select"
              className="block text-sm mb-1.5 text-slate-600 dark:text-slate-300"
            >
              시즌
            </label>
            <Select
              value={season}
              onValueChange={(value) => setSeason(value)}
            >
              <SelectTrigger id="season-select" className="w-full">
                <SelectValue placeholder="시즌 선택" />
              </SelectTrigger>
              <SelectContent>
                {seasonOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <Trophy aria-hidden="true" className="h-3 w-3" />
              <span className="tabular-nums">대기 {items.length}건</span>
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Award aria-hidden="true" className="h-3 w-3" />
              {season}
            </Badge>
          </div>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          <span className="font-medium text-slate-600 dark:text-slate-300">
            자동 계산 공식
          </span>{' '}
          · 출석률 × 40% + 대회 수상 × 40% + 코치 평가 × 20% → 70점 이상 상위,
          40점 이상 중위, 그 외 하위. 매월 1일 자동 실행됩니다.
        </p>
      </Card>

      {/* 메시지 배너 */}
      {message && (
        <Card
          role={message.type === 'error' ? 'alert' : 'status'}
          className={`p-4 text-sm shadow-md rounded-xl ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800'
              : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <span>{message.text}</span>
            <button
              type="button"
              onClick={() => setMessage(null)}
              className="text-xs underline opacity-70 hover:opacity-100"
              aria-label="메시지 닫기"
            >
              닫기
            </button>
          </div>
        </Card>
      )}

      {/* 목록 */}
      {isLoading ? (
        <LoadingSpinner message="승인 대기 목록을 불러오는 중입니다..." />
      ) : items.length === 0 ? (
        <Card className="p-10 text-center shadow-md rounded-xl">
          <div className="flex flex-col items-center gap-2">
            <Award
              aria-hidden="true"
              className="h-10 w-10 text-slate-300 dark:text-slate-600"
            />
            <p className="text-slate-600 dark:text-slate-300 font-medium">
              승인 대기 중인 등급 변경이 없습니다.
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              상단의 &quot;등급 계산 실행&quot; 버튼으로 즉시 재계산할 수
              있습니다.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <ApprovalCard
              key={item.id}
              item={item}
              processing={processingId === item.id}
              onApprove={handleApprove}
              onOverride={handleOpenOverride}
            />
          ))}
        </div>
      )}

      {/* 오버라이드 다이얼로그 */}
      <Dialog
        open={overrideTarget !== null}
        onOpenChange={(open) => {
          if (!open) handleCloseOverride();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>등급 직접 변경</DialogTitle>
            <DialogDescription>
              자동 계산된 등급 대신 감독 판단으로 등급을 직접 지정합니다. 변경
              사유는 서버에 기록됩니다.
            </DialogDescription>
          </DialogHeader>

          {overrideTarget && (
            <div className="space-y-4">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 p-4 space-y-2">
                <p className="font-medium text-slate-900 dark:text-white">
                  {displayName(overrideTarget.user, '회원')}
                </p>
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <span>자동 계산 결과:</span>
                  <TierDiff
                    from={overrideTarget.previousLevel}
                    to={overrideTarget.newLevel}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="override-level"
                  className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-200"
                >
                  새 등급
                </label>
                <Select
                  value={String(overrideLevel)}
                  onValueChange={(v) =>
                    setOverrideLevel(Number(v) as MemberLevelTier)
                  }
                >
                  <SelectTrigger id="override-level" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIER_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={String(o.value)}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleCloseOverride}
              disabled={processingId !== null}
            >
              취소
            </Button>
            <Button
              type="button"
              onClick={() => void handleConfirmOverride()}
              disabled={processingId !== null}
            >
              변경하기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
