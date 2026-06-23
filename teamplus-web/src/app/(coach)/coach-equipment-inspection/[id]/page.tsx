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
      'bg-emerald-50 text-mint-500 dark:bg-emerald-900/30 dark:text-mint-500',
    icon: 'check_circle',
  },
  minor_issue: {
    label: '경미한 이상',
    color:
      'bg-sun-100 text-sun-500 dark:bg-sun-500/20 dark:text-sun-500',
    icon: 'warning',
  },
  critical: {
    label: '심각한 이상',
    color:
      'bg-flame-100 text-flame-500 dark:bg-flame-500/20 dark:text-flame-100',
    icon: 'error',
  },
  replaced: {
    label: '교체 완료',
    color:
      'bg-ice-50 text-ice-500 dark:bg-ice-500/25 dark:text-ice-500',
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
        <main className="flex-1 flex items-center justify-center text-wtext-3">
          불러오는 중…
        </main>
      </MobileContainer>
    );
  }

  if (!inspection) {
    return (
      <MobileContainer hasBottomNav={false}>
        <PageAppBar title="장비 점검" forceNative />
        <main className="flex-1 flex flex-col items-center justify-center gap-2 px-6">
          <p className="text-card-title text-wtext-3">
            점검 리포트를 찾을 수 없습니다.
          </p>
          <button
            type="button"
            onClick={() => navigate('/coach-equipment-inspection')}
            className="rounded-w-md bg-ice-500 px-4 py-2 text-white font-bold"
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

      <main className="flex-1 overflow-y-auto px-4 pt-3 pb-24 hide-scrollbar">
        {/* 헤더 정보 */}
        <section className="rounded-w-xl bg-wsurface dark:bg-rink-800 border border-wline dark:border-rink-700 p-4">
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'rounded-w-pill px-2 py-0.5 text-card-meta font-bold',
                inspection.status === 'issue_found'
                  ? 'bg-flame-100 text-flame-500 dark:bg-flame-500/20 dark:text-flame-100'
                  : inspection.status === 'completed'
                    ? 'bg-emerald-50 text-mint-500 dark:bg-emerald-900/30 dark:text-mint-500'
                    : 'bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-100',
              )}
            >
              {STATUS_LABEL[inspection.status]}
            </span>
            <span className="text-card-meta text-wtext-3 tabular-nums">
              {formatDateTime(inspection.inspectedAt)}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-card-body">
            <div>
              <p className="text-wtext-3">팀</p>
              <p className="font-bold text-wtext-1 dark:text-white">
                {inspection.team?.name ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-wtext-3">점검자</p>
              <p className="font-bold text-wtext-1 dark:text-white">
                {inspection.inspector?.firstName ?? '—'}
              </p>
            </div>
          </div>
          {inspection.notified && inspection.status === 'issue_found' && (
            <div className="mt-3 flex items-center gap-2 rounded-w-md bg-ice-50 dark:bg-ice-500/15 p-2 text-card-meta text-ice-500">
              <Icon name="notifications" className="text-[16px]" aria-hidden="true" />
              알림톡 발송 완료
            </div>
          )}
        </section>

        {/* 항목별 리스트 */}
        <h2 className="mt-5 mb-2 text-card-title font-extrabold text-wtext-1 dark:text-white">
          점검 항목 ({inspection.items?.length ?? 0})
        </h2>
        {inspection.items && inspection.items.length > 0 ? (
          <ul className="space-y-2">
            {inspection.items.map((item) => {
              const meta = CONDITION_META[item.condition ?? 'good'];
              return (
                <li
                  key={item.id}
                  className="rounded-w-md bg-wsurface dark:bg-rink-800 border border-wline dark:border-rink-700 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded-w-pill bg-wline-2 dark:bg-rink-700 px-2 py-0.5 text-card-meta text-wtext-2 dark:text-rink-100">
                      {CATEGORY_LABEL[item.category] ?? item.category}
                    </span>
                    <span className="font-bold text-wtext-1 dark:text-white truncate flex-1">
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
                    <p className="mt-2 text-card-body text-wtext-2 dark:text-rink-100 whitespace-pre-wrap">
                      {item.issueDetail}
                    </p>
                  )}
                  {resolveImageSrc(item.photoUrl) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolveImageSrc(item.photoUrl)}
                      alt={item.itemName}
                      className="mt-2 w-full max-h-64 object-cover rounded-w-md"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-card-body text-wtext-3 py-4">
            등록된 항목이 없습니다.
          </p>
        )}

        {/* 종합 메모 */}
        <h2 className="mt-5 mb-2 text-card-title font-extrabold text-wtext-1 dark:text-white">
          종합 메모
        </h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={!canEdit}
          rows={4}
          maxLength={5000}
          className="w-full rounded-w-md bg-wsurface dark:bg-rink-800 border border-wline dark:border-rink-700 p-3 text-card-body text-wtext-1 dark:text-white"
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
                className="w-full rounded-w-md bg-ice-500 py-3 text-white font-bold disabled:opacity-60"
              >
                점검 완료 처리
              </button>
            )}
            <button
              type="button"
              onClick={handleSaveNotes}
              disabled={isSaving}
              className="w-full rounded-w-md bg-wsurface dark:bg-rink-800 border border-wline dark:border-rink-700 py-3 font-bold text-wtext-1 dark:text-white disabled:opacity-60"
            >
              메모 저장하기
            </button>
          </div>
        )}
      </main>
    </MobileContainer>
  );
}
