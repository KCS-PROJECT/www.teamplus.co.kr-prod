'use client';

/**
 * 장비 점검 리포트 상세 (코치/감독)
 *
 * - 항목별 condition/issueDetail/photoUrl 표시
 * - status 변경 (pending → completed)
 * - 종합 메모 수정
 * - issue_found 인 경우 알림톡 발송 이력 표시 (notified flag)
 *
 * Backend: GET /api/v1/equipment-inspections/:id, PATCH /:id
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useNavigation } from '@/components/ui/NavLink';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { useSessionAuth } from '@/hooks/useSessionAuth';
import {
  equipmentInspectionService,
  type EquipmentInspection,
  type InspectionStatus,
  type InspectionCondition,
} from '@/services/equipment-inspection.service';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { resolveImageSrc } from '@/lib/image-url';

const CATEGORY_LABEL: Record<string, string> = {
  helmet: '헬멧',
  skate: '스케이트',
  pad: '패드',
  stick: '스틱',
  goal: '골대',
  ice: '링크/얼음',
  other: '기타',
};

const CONDITION_META: Record<
  InspectionCondition,
  { label: string; color: string; icon: string }
> = {
  good: {
    label: '양호',
    color:
      'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
    icon: 'check_circle',
  },
  minor_issue: {
    label: '경미한 이상',
    color:
      'bg-sun-500/10 text-sun-500 dark:bg-sun-500/20 dark:text-sun-500',
    icon: 'warning',
  },
  critical: {
    label: '심각한 이상',
    color:
      'bg-it-red-500/10 text-it-red-500 dark:bg-it-red-500/20 dark:text-it-red-500',
    icon: 'error',
  },
  replaced: {
    label: '교체 완료',
    color:
      'bg-it-blue-50 text-it-blue-500 dark:bg-it-blue-900/30 dark:text-it-blue-500',
    icon: 'autorenew',
  },
};

const STATUS_LABEL: Record<InspectionStatus, string> = {
  pending: '진행 중',
  completed: '완료',
  issue_found: '이상 발견',
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function EquipmentInspectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useSessionAuth();
  const { navigate } = useNavigation();
  const { toast } = useToast();
  const [inspection, setInspection] = useState<EquipmentInspection | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
    isDataLoaded: !isLoading,
  });
  usePageReady(!isLoading);

  const canEdit = useMemo(() => {
    const role = (user?.userType ?? '').toString().toUpperCase();
    return ['COACH', 'DIRECTOR', 'ACADEMY_DIRECTOR', 'ADMIN'].includes(role);
  }, [user]);

  const load = useCallback(async () => {
    setIsLoading(true);
    const res = await equipmentInspectionService.findOne(id);
    if (res.success && res.data) {
      setInspection(res.data);
      setNotes(res.data.notes ?? '');
    } else {
      toast.error(res.error?.message ?? MESSAGES.error.network);
    }
    setIsLoading(false);
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleStatusChange = useCallback(
    async (newStatus: InspectionStatus) => {
      if (!canEdit || !inspection) return;
      setIsSaving(true);
      const res = await equipmentInspectionService.update(id, {
        status: newStatus,
      });
      if (res.success && res.data) {
        setInspection(res.data);
        toast.success(MESSAGES.common.statusChanged);
      } else {
        toast.error(res.error?.message ?? MESSAGES.error.network);
      }
      setIsSaving(false);
    },
    [canEdit, inspection, id, toast],
  );

  const handleSaveNotes = useCallback(async () => {
    if (!canEdit) return;
    setIsSaving(true);
    const res = await equipmentInspectionService.update(id, { notes });
    if (res.success) {
      toast.success(MESSAGES.save.success);
    } else {
      toast.error(res.error?.message ?? MESSAGES.error.network);
    }
    setIsSaving(false);
  }, [canEdit, id, notes, toast]);

  if (isLoading) {
    return (
      <MobileContainer hasBottomNav={false}>
        <PageAppBar title="장비 점검" forceNative />
        <main className="flex-1 flex items-center justify-center bg-it-canvas dark:bg-puck text-it-ink-500 dark:text-wtext-4" />
      </MobileContainer>
    );
  }

  if (!inspection) {
    return (
      <MobileContainer hasBottomNav={false}>
        <PageAppBar title="장비 점검" forceNative />
        <main className="flex-1 flex flex-col items-center justify-center gap-3 px-6 bg-it-canvas dark:bg-puck">
          <p className="text-card-title text-it-ink-700 dark:text-wtext-4">
            점검 리포트를 찾을 수 없습니다.
          </p>
          <button
            type="button"
            onClick={() => navigate('/coach-equipment-inspection')}
            className="rounded-w-md bg-it-blue-500 px-4 py-2.5 text-white font-bold transition-colors motion-reduce:transition-none hover:bg-it-blue-600 active:brightness-95"
          >
            목록으로
          </button>
        </main>
      </MobileContainer>
    );
  }

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar title="장비 점검 상세" forceNative />

      <main
        className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck hide-scrollbar !pb-8"
        role="main"
        aria-label="장비 점검 상세"
      >
        {/* 헤더 정보 — flat 흰 섹션 */}
        <section className="bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-5" aria-label="점검 기본 정보">
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'rounded-w-pill px-2 py-0.5 text-card-meta font-bold',
                inspection.status === 'issue_found'
                  ? 'bg-it-red-500/10 text-it-red-500 dark:bg-it-red-500/20 dark:text-it-red-500'
                  : inspection.status === 'completed'
                    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'bg-it-line text-it-ink-700 dark:bg-rink-700 dark:text-wtext-4',
              )}
            >
              {STATUS_LABEL[inspection.status]}
            </span>
            <span className="text-card-meta text-it-ink-500 dark:text-wtext-4 font-num tabular-nums">
              {formatDateTime(inspection.inspectedAt)}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-card-body">
            <div>
              <p className="text-it-ink-500 dark:text-wtext-4">팀</p>
              <p className="mt-0.5 font-bold text-it-ink-800 dark:text-white">
                {inspection.team?.name ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-it-ink-500 dark:text-wtext-4">점검자</p>
              <p className="mt-0.5 font-bold text-it-ink-800 dark:text-white">
                {inspection.inspector?.firstName ?? '—'}
              </p>
            </div>
          </div>
          {inspection.notified && inspection.status === 'issue_found' && (
            <div className="mt-4 flex items-center gap-2 rounded-w-md bg-it-blue-50 dark:bg-it-blue-900/30 p-2.5 text-card-meta text-it-blue-500">
              <Icon name="notifications" className="text-[16px]" aria-hidden="true" />
              알림톡 발송 완료
            </div>
          )}
        </section>

        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 항목별 리스트 — flat 흰 섹션 (hairline 행) */}
        <section className="bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-7" aria-label="점검 항목">
          <h2 className="pb-1 text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white">
            점검 항목{' '}
            <span className="text-it-blue-500 font-num tabular-nums">
              {inspection.items?.length ?? 0}
            </span>
          </h2>
          {inspection.items && inspection.items.length > 0 ? (
            <div className="flex flex-col">
              {inspection.items.map((item, idx) => {
                const meta = CONDITION_META[item.condition ?? 'good'];
                const isLast = idx === (inspection.items?.length ?? 0) - 1;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      'py-[14px]',
                      !isLast && 'border-b border-it-line dark:border-rink-700',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="rounded-w-pill bg-it-line dark:bg-rink-700 px-2 py-0.5 text-card-meta text-it-ink-700 dark:text-wtext-4">
                        {CATEGORY_LABEL[item.category] ?? item.category}
                      </span>
                      <span className="font-bold text-it-ink-800 dark:text-white truncate flex-1">
                        {item.itemName}
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-w-pill px-2 py-0.5 text-card-meta font-bold',
                          meta.color,
                        )}
                      >
                        <Icon name={meta.icon} className="text-[14px]" aria-hidden="true" />
                        {meta.label}
                      </span>
                    </div>
                    {item.issueDetail && (
                      <p className="mt-2 text-card-body text-it-ink-700 dark:text-wtext-4 whitespace-pre-wrap">
                        {item.issueDetail}
                      </p>
                    )}
                    {resolveImageSrc(item.photoUrl) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolveImageSrc(item.photoUrl)}
                        alt={item.itemName}
                        className="mt-2 w-full max-h-64 object-cover rounded-w-md bg-it-line dark:bg-rink-700"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-card-body text-it-ink-500 dark:text-wtext-4 py-4">
              등록된 항목이 없습니다.
            </p>
          )}
        </section>

        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 종합 메모 + 액션 — flat 흰 섹션 (폼) */}
        <section className="bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-8" aria-label="종합 메모">
          <label className="block text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white mb-3">
            종합 메모
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!canEdit}
            rows={4}
            maxLength={5000}
            className="w-full rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-800 p-3 text-card-body text-it-ink-800 dark:text-white placeholder:text-it-ink-400 focus:outline-none focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20 resize-none transition-colors motion-reduce:transition-none disabled:opacity-70"
            placeholder="자유 메모 (최대 5000자)"
          />

          {/* 액션 */}
          {canEdit && (
            <div className="mt-4 flex flex-col gap-2">
              {inspection.status !== 'completed' && (
                <button
                  type="button"
                  onClick={() => handleStatusChange('completed')}
                  disabled={isSaving}
                  className="w-full h-12 rounded-w-md bg-it-blue-500 text-white text-card-body font-bold transition-colors duration-200 ease-ios motion-reduce:transition-none hover:bg-it-blue-600 active:brightness-95 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  점검 완료 처리
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveNotes}
                disabled={isSaving}
                className="w-full h-12 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 text-card-body font-bold text-it-ink-800 dark:text-white transition-colors motion-reduce:transition-none hover:bg-it-fill dark:hover:bg-rink-700 active:brightness-95 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                메모 저장하기
              </button>
            </div>
          )}
        </section>
      </main>
    </MobileContainer>
  );
}
