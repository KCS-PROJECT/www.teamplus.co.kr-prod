'use client';

import { Suspense, useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { useToast } from '@/components/ui/Toast';
import { useNavigation } from '@/components/ui/NavLink';
import { api } from '@/services/api-client';
import { AcademyForm, AcademyFormData } from '@/components/academy/AcademyForm';
import { PromotionForm, PromotionFormData } from '@/components/academy/PromotionForm';
import { usePromotionMutations } from '@/hooks/usePromotions';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';

type CreateTab = 'info' | 'promotion';

/* ────────────────────────────────────────────
   Inner - useSearchParams는 Suspense 내부에서 사용
   ──────────────────────────────────────────── */

function AcademyCreateInner() {
  const searchParams = useSearchParams();
  const editAcademyId = searchParams?.get('edit') ?? null;
  const initialTabParam = searchParams?.get('tab');
  const isEditMode = !!editAcademyId;

  const { toast } = useToast();
  const { back } = useNavigation();
  const { createPromotion, isSubmitting: isPromotionSubmitting } = usePromotionMutations();

  const pageTitle = isEditMode ? '오픈클래스 수정' : '오픈클래스 등록';

  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle: pageTitle,
    showBottomNav: false,
  });

  // 탭 상태 (수정 모드에서는 탭 UI 숨김: 오픈클래스 정보만)
  const defaultTab: CreateTab = useMemo(() => {
    if (isEditMode) return 'info';
    return initialTabParam === 'promotion' ? 'promotion' : 'info';
  }, [isEditMode, initialTabParam]);

  const [activeTab, setActiveTab] = useState<CreateTab>(defaultTab);

  // 수정 모드: 기존 데이터 로딩
  const [initialData, setInitialData] = useState<Partial<AcademyFormData> | undefined>(undefined);
  const [isLoadingData, setIsLoadingData] = useState(isEditMode);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdAcademyId, setCreatedAcademyId] = useState<string | null>(null);

  usePageReady(!isLoadingData);

  const fetchAcademyData = useCallback(async () => {
    if (!editAcademyId) return;
    setIsLoadingData(true);
    try {
      const res = await api.get<Record<string, unknown>>(`/academies/${editAcademyId}`);
      if (res.success && res.data) {
        const d = res.data;
        setInitialData({
          name: (d.name ?? '') as string,
          description: (d.description ?? '') as string,
          region: (d.region ?? '') as string,
          contactPhone: (d.contactPhone ?? '') as string,
          contactEmail: (d.contactEmail ?? '') as string,
        });
      }
    } catch {
      toast.error(MESSAGES.error.general);
    } finally {
      setIsLoadingData(false);
    }
  }, [editAcademyId, toast]);

  useEffect(() => {
    if (isEditMode) fetchAcademyData();
  }, [isEditMode, fetchAcademyData]);

  const handleAcademySubmit = useCallback(async (data: AcademyFormData) => {
    setIsSubmitting(true);
    try {
      if (isEditMode && editAcademyId) {
        const res = await api.put(`/academies/${editAcademyId}`, data);
        if (res.success) {
          toast.success(MESSAGES.academy.updated);
          back();
        } else {
          toast.error(MESSAGES.error.general);
        }
      } else {
        const res = await api.post<{ id: string }>('/academies', data);
        if (res.success) {
          toast.success(MESSAGES.academy.created);
          const newId = res.data?.id ?? null;
          if (newId) {
            setCreatedAcademyId(newId);
          }
          back();
        } else {
          // 감독 1인당 1개 정책 위반(409) 등 백엔드 사유 메시지를 그대로 노출.
          toast.error(res.error?.message || MESSAGES.error.general);
        }
      }
    } catch {
      toast.error(MESSAGES.error.general);
    } finally {
      setIsSubmitting(false);
    }
  }, [isEditMode, editAcademyId, toast, back]);

  const handlePromotionSubmit = useCallback(
    async (data: PromotionFormData) => {
      // 광고 생성 시 academyId가 있으면 clubId로 설정
      const payload: PromotionFormData = createdAcademyId
        ? { ...data, clubId: createdAcademyId }
        : data;
      const result = await createPromotion(payload);
      if (result) {
        toast.success(MESSAGES.promotion.created);
        back();
      } else {
        toast.error(MESSAGES.error.general);
      }
    },
    [createdAcademyId, createPromotion, toast, back],
  );

  const TAB_LIST: Array<{ key: CreateTab; label: string }> = [
    { key: 'info', label: MESSAGES.promotion.tabInfo },
    { key: 'promotion', label: MESSAGES.promotion.tabPromotion },
  ];

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar title={pageTitle} />

      <main className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck pb-30">
        {/* 폼 콘텐츠 — flat 흰 섹션 (mt-2 회색 갭). 탭은 흰 면 위 it-blue 밑줄형. */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 py-5">
        {/* 탭 UI: 신규 등록 모드에서만 노출 */}
        {!isEditMode && (
          <div
            role="tablist"
            aria-label={pageTitle}
            className="flex gap-2 mb-4 border-b border-it-line dark:border-rink-700"
          >
            {TAB_LIST.map(({ key, label }) => {
              const active = key === activeTab;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(key)}
                  className={cn(
                    'flex-1 h-10 text-card-body font-semibold transition-colors motion-reduce:transition-none border-b-2 -mb-px',
                    active
                      ? 'text-it-blue-500 border-it-blue-500'
                      : 'text-it-ink-400 dark:text-rink-300 border-transparent hover:text-it-ink-800 dark:hover:text-rink-100',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {isLoadingData ? (
          <div
            className="flex items-center justify-center py-20"
            role="status"
            aria-live="polite"
            aria-label="오픈클래스 정보를 불러오는 중"
          >
            <div
              className="w-8 h-8 border-2 border-it-blue-500 border-t-transparent rounded-w-pill animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span className="sr-only">오픈클래스 정보를 불러오는 중입니다</span>
          </div>
        ) : activeTab === 'info' ? (
          <AcademyForm
            mode={isEditMode ? 'edit' : 'create'}
            initialData={initialData}
            onSubmit={handleAcademySubmit}
            isSubmitting={isSubmitting}
            iceTheme
          />
        ) : (
          <PromotionForm
            mode="create"
            academyId={createdAcademyId ?? undefined}
            onSubmit={handlePromotionSubmit}
            isSubmitting={isPromotionSubmitting}
            iceTheme
          />
        )}
        </section>
      </main>
    </MobileContainer>
  );
}

/* ────────────────────────────────────────────
   Page Export - Suspense 경계로 useSearchParams 보호
   ──────────────────────────────────────────── */

export default function AcademyCreatePage() {
  return (
    <Suspense fallback={
      <MobileContainer hasBottomNav={false}>
        <PageAppBar title="오픈클래스" />
        <div
          className="flex items-center justify-center py-20"
          role="status"
          aria-live="polite"
        >
          <div
            className="w-8 h-8 border-2 border-it-blue-500 border-t-transparent rounded-w-pill animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          <span className="sr-only">로딩 중</span>
        </div>
      </MobileContainer>
    }>
      <AcademyCreateInner />
    </Suspense>
  );
}
