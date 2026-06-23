'use client';

/**
 * 장비 점검 리포트 신규 작성 (코치/감독)
 *
 * - 팀 선택 (listManagedTeams)
 * - 항목 동적 추가/삭제 (category, itemName, condition, issueDetail, photoUrl)
 * - critical condition 시 issueDetail 필수
 * - submit 후 /equipment-inspection/[id] 이동
 *
 * Backend: POST /api/v1/equipment-inspections
 */

import { useCallback, useEffect, useState } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useNavigation } from '@/components/ui/NavLink';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { listManagedTeams, type TeamListItem } from '@/services/team.service';
import {
  equipmentInspectionService,
  type InspectionCondition,
  type InspectionCategory,
  type InspectionItemPayload,
} from '@/services/equipment-inspection.service';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { resolveImageSrc } from '@/lib/image-url';

const CATEGORIES: Array<{ value: InspectionCategory; label: string }> = [
  { value: 'helmet', label: '헬멧' },
  { value: 'skate', label: '스케이트' },
  { value: 'pad', label: '패드' },
  { value: 'stick', label: '스틱' },
  { value: 'goal', label: '골대' },
  { value: 'ice', label: '링크/얼음' },
  { value: 'other', label: '기타' },
];

const CONDITIONS: Array<{ value: InspectionCondition; label: string }> = [
  { value: 'good', label: '양호' },
  { value: 'minor_issue', label: '경미한 이상' },
  { value: 'critical', label: '심각한 이상' },
  { value: 'replaced', label: '교체 완료' },
];

interface DraftItem extends InspectionItemPayload {
  /** 클라이언트 측 임시 id — React key */
  _draftId: string;
}

function newDraftItem(): DraftItem {
  return {
    _draftId: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    category: 'helmet',
    itemName: '',
    condition: 'good',
    issueDetail: '',
    photoUrl: '',
  };
}

export default function NewEquipmentInspectionPage() {
  const { navigate } = useNavigation();
  const { toast } = useToast();
  const [teams, setTeams] = useState<TeamListItem[]>([]);
  const [teamId, setTeamId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<DraftItem[]>([newDraftItem()]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  usePageReady(true);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await listManagedTeams();
      if (cancelled) return;
      if (res.success && res.data) {
        setTeams(res.data);
        if (res.data.length > 0) setTeamId(res.data[0].id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateItem = useCallback(
    <K extends keyof InspectionItemPayload>(
      draftId: string,
      key: K,
      value: InspectionItemPayload[K],
    ) => {
      setItems((prev) =>
        prev.map((it) =>
          it._draftId === draftId ? { ...it, [key]: value } : it,
        ),
      );
    },
    [],
  );

  const addItem = useCallback(() => {
    setItems((prev) => [...prev, newDraftItem()]);
  }, []);

  const removeItem = useCallback((draftId: string) => {
    setItems((prev) =>
      prev.length > 1 ? prev.filter((it) => it._draftId !== draftId) : prev,
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!teamId) {
      toast.error(MESSAGES.coach.equipment.teamRequired);
      return;
    }

    // 검증 — 각 항목 itemName 비어있지 않음
    const emptyName = items.find((it) => !it.itemName.trim());
    if (emptyName) {
      toast.error(MESSAGES.coach.equipment.itemNameRequired);
      return;
    }

    // critical/minor_issue 인 경우 issueDetail 필수
    const missingDetail = items.find(
      (it) =>
        (it.condition === 'critical' || it.condition === 'minor_issue') &&
        !it.issueDetail?.trim(),
    );
    if (missingDetail) {
      toast.error(
        `"${missingDetail.itemName}" 항목의 이상 상세를 입력해주세요.`,
      );
      return;
    }

    setIsSubmitting(true);
    const res = await equipmentInspectionService.create({
      teamId,
      notes: notes.trim() || undefined,
      items: items.map((it) => ({
        category: it.category,
        itemName: it.itemName.trim(),
        condition: it.condition,
        issueDetail: it.issueDetail?.trim() || undefined,
        photoUrl: it.photoUrl?.trim() || undefined,
      })),
    });
    setIsSubmitting(false);

    if (res.success && res.data) {
      toast.success(MESSAGES.save.success);
      navigate(`/coach-equipment-inspection/${res.data.id}`);
    } else {
      toast.error(res.error?.message ?? MESSAGES.error.network);
    }
  }, [teamId, items, notes, navigate, toast]);

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar title="새 점검 시작" forceNative />

      <main className="flex-1 overflow-y-auto px-4 pt-3 pb-24 hide-scrollbar">
        {/* 팀 선택 */}
        <section className="rounded-w-md bg-wsurface dark:bg-rink-800 border border-wline dark:border-rink-700 p-3">
          <label className="block text-card-body font-bold text-wtext-1 dark:text-white mb-2">
            팀 선택
          </label>
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="w-full rounded-w-md border border-wline dark:border-rink-700 bg-wbg dark:bg-rink-900 px-3 py-2 text-card-body"
          >
            {teams.length === 0 ? (
              <option value="">관리 중인 팀이 없습니다</option>
            ) : (
              teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name ?? '팀'}
                </option>
              ))
            )}
          </select>
        </section>

        {/* 점검 항목 */}
        <div className="mt-5 flex items-center justify-between">
          <h2 className="text-card-title font-extrabold text-wtext-1 dark:text-white">
            점검 항목 ({items.length})
          </h2>
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-1 rounded-w-pill bg-ice-50 dark:bg-ice-500/15 px-3 py-1 text-card-body font-bold text-ice-500"
          >
            <Icon name="add" className="text-[16px]" aria-hidden="true" />
            항목 추가
          </button>
        </div>

        <ul className="mt-2 space-y-2">
          {items.map((item, idx) => (
            <li
              key={item._draftId}
              className="rounded-w-md bg-wsurface dark:bg-rink-800 border border-wline dark:border-rink-700 p-3 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-card-meta text-wtext-3">#{idx + 1}</span>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(item._draftId)}
                    className="rounded-w-pill px-2 py-0.5 text-card-meta text-flame-500 font-bold"
                  >
                    삭제
                  </button>
                )}
              </div>

              {/* 카테고리 + 상태 */}
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={item.category}
                  onChange={(e) =>
                    updateItem(
                      item._draftId,
                      'category',
                      e.target.value as InspectionCategory,
                    )
                  }
                  className="rounded-w-md border border-wline dark:border-rink-700 bg-wbg dark:bg-rink-900 px-2 py-2 text-card-body"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <select
                  value={item.condition}
                  onChange={(e) =>
                    updateItem(
                      item._draftId,
                      'condition',
                      e.target.value as InspectionCondition,
                    )
                  }
                  className={cn(
                    'rounded-w-md border px-2 py-2 text-card-body font-bold',
                    item.condition === 'critical'
                      ? 'border-flame-500 text-flame-500 bg-flame-100 dark:bg-flame-500/20'
                      : item.condition === 'minor_issue'
                        ? 'border-sun-500 text-sun-500 bg-sun-100 dark:bg-sun-500/20'
                        : 'border-wline dark:border-rink-700 bg-wbg dark:bg-rink-900',
                  )}
                >
                  {CONDITIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* itemName */}
              <input
                type="text"
                value={item.itemName}
                onChange={(e) =>
                  updateItem(item._draftId, 'itemName', e.target.value)
                }
                placeholder="항목명 (예: 헬멧 #5)"
                maxLength={200}
                className="w-full rounded-w-md border border-wline dark:border-rink-700 bg-wbg dark:bg-rink-900 px-3 py-2 text-card-body"
              />

              {/* issueDetail — condition != good 시만 표시 */}
              {item.condition !== 'good' && item.condition !== 'replaced' && (
                <textarea
                  value={item.issueDetail ?? ''}
                  onChange={(e) =>
                    updateItem(item._draftId, 'issueDetail', e.target.value)
                  }
                  placeholder="이상 상세를 입력해주세요"
                  rows={2}
                  maxLength={2000}
                  className="w-full rounded-w-md border border-flame-100 dark:border-flame-500/30 bg-flame-100/30 dark:bg-flame-500/10 px-3 py-2 text-card-body"
                />
              )}

              {/* 사진 업로드 — 직접 URL 입력 폐기, multipart 통합 (2026-05-14) */}
              <PhotoUploadField
                value={item.photoUrl ?? ''}
                onChange={(url) =>
                  updateItem(item._draftId, 'photoUrl', url)
                }
              />
            </li>
          ))}
        </ul>

        {/* 종합 메모 */}
        <section className="mt-5">
          <h2 className="mb-2 text-card-title font-extrabold text-wtext-1 dark:text-white">
            종합 메모
          </h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="자유 메모 (선택)"
            rows={3}
            maxLength={5000}
            className="w-full rounded-w-md bg-wsurface dark:bg-rink-800 border border-wline dark:border-rink-700 p-3 text-card-body"
          />
        </section>

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || teams.length === 0}
          className="mt-6 w-full rounded-w-md bg-ice-500 py-3 text-white font-bold disabled:opacity-60"
        >
          {isSubmitting ? '저장 중…' : '점검 등록하기'}
        </button>

        <p className="mt-3 text-card-meta text-wtext-3 text-center">
          심각한 이상(critical)이 포함되면 코치/감독에게 알림톡이 자동 발송됩니다.
        </p>
      </main>
    </MobileContainer>
  );
}

/**
 * 사진 업로드 필드 — 파일 선택 → multipart 업로드 → photoUrl 반환
 *
 * URL 직접 입력 패턴(보안/UX 모두 취약)을 폐기하고 backend `/upload/photo`
 * 엔드포인트로 통합. 미리보기 + 제거 + 진행 상태 표시.
 */
function PhotoUploadField({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);

  const handleSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      // 클라이언트 사전 검증 — 10MB
      if (file.size > 10 * 1024 * 1024) {
        toast.error(MESSAGES.coach.equipment.fileSizeExceed);
        e.target.value = '';
        return;
      }
      if (!/^image\//.test(file.type)) {
        toast.error(MESSAGES.coach.equipment.imageOnly);
        e.target.value = '';
        return;
      }

      setIsUploading(true);
      const res = await equipmentInspectionService.uploadPhoto(file);
      setIsUploading(false);
      // input 초기화 — 동일 파일 재선택 가능
      e.target.value = '';

      if (res.success && res.data?.imageUrl) {
        onChange(res.data.imageUrl);
      } else {
        toast.error(res.error?.message ?? MESSAGES.error.network);
      }
    },
    [onChange, toast],
  );

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-w-md border border-wline dark:border-rink-700 bg-wbg dark:bg-rink-900 p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resolveImageSrc(value)}
          alt="점검 사진"
          className="h-16 w-16 rounded-w-md object-cover bg-wline-2 dark:bg-rink-700"
        />
        <div className="flex-1 min-w-0">
          <p className="text-card-meta text-wtext-3 truncate">{value}</p>
        </div>
        <button
          type="button"
          onClick={() => onChange('')}
          className="rounded-w-pill bg-flame-100 dark:bg-flame-500/20 px-3 py-1 text-card-meta font-bold text-flame-500"
        >
          제거
        </button>
      </div>
    );
  }

  return (
    <label
      className={cn(
        'flex w-full items-center justify-center gap-2 rounded-w-md border border-dashed border-wline dark:border-rink-700 bg-wbg dark:bg-rink-900 px-3 py-3 text-card-body text-wtext-2 dark:text-rink-100 cursor-pointer transition-colors hover:bg-wline-2/40 dark:hover:bg-rink-700/40',
        isUploading && 'opacity-60 cursor-progress',
      )}
    >
      <Icon name="image" className="text-[18px] text-wtext-3" aria-hidden="true" />
      <span>{isUploading ? '업로드 중…' : '사진 첨부 (선택)'}</span>
      <input
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif"
        onChange={handleSelect}
        disabled={isUploading}
        className="sr-only"
      />
    </label>
  );
}
