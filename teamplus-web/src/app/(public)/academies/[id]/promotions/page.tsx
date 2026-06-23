'use client';

import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useAcademyDetail } from '@/hooks/useAcademy';
import { usePromotions, type LessonType, type AcademyPromotion } from '@/hooks/usePromotions';
import { PromotionCard } from '@/components/academy/PromotionCard';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { usePageReady } from '@/hooks/usePageReady';

type LessonTypeFilter = 'ALL' | LessonType;

const LESSON_TYPE_TABS: Array<{ key: LessonTypeFilter; label: string }> = [
  { key: 'ALL', label: MESSAGES.promotion.lessonTypeAll },
  { key: 'PRIVATE', label: MESSAGES.promotion.lessonType.PRIVATE },
  { key: 'GROUP', label: MESSAGES.promotion.lessonType.GROUP },
  { key: 'GAME_LESSON', label: MESSAGES.promotion.lessonType.GAME_LESSON },
  { key: 'FUN', label: MESSAGES.promotion.lessonType.FUN },
];

/**
 * PublicAcademyPromotionsPage — 특정 오픈클래스의 광고 목록 (공개)
 * Route: /academies/[id]/promotions
 *
 * - 인증 불필요 (public layout)
 * - clubId = academyId 필터로 해당 오픈클래스 광고만 노출
 * - 레슨 유형 탭(Chip) 필터
 */
export default function PublicAcademyPromotionsPage() {
  const params = useParams();
  const academyId = typeof params?.id === 'string' ? params.id : null;

  const { academy, isLoading: isAcademyLoading } = useAcademyDetail(academyId);
  const { navigate } = useNavigation();

  const [selectedType, setSelectedType] = useState<LessonTypeFilter>('ALL');

  const filters = useMemo(
    () => ({
      clubId: academyId ?? undefined,
      lessonType: selectedType === 'ALL' ? undefined : selectedType,
      page: 1,
      limit: 20,
    }),
    [academyId, selectedType],
  );

  const { promotions, pagination, isLoading, error } = usePromotions(filters);

  // v18 (2026-05-20, audit §4 C #9): academy + promotions 둘 다 도착 후 ready.
  usePageReady(!isAcademyLoading && !isLoading);

  const pageTitle = academy?.name
    ? `${academy.name} · ${MESSAGES.promotion.title}`
    : MESSAGES.promotion.title;

  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle: MESSAGES.promotion.title,
    showBackButton: true,
    showBottomNav: true,
    isDataLoaded: !isAcademyLoading && !isLoading,
  });

  const handlePromotionPress = useCallback(
    (promotion: AcademyPromotion) => {
      navigate(`/promotions/${promotion.id}`);
    },
    [navigate],
  );

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title={pageTitle} />

      <main className="flex-1 overflow-y-auto hide-scrollbar pb-6">
        {/* 필터 탭 (Chip) */}
        <div className="sticky top-0 z-10 bg-wbg dark:bg-rink-900 px-4 pt-3 pb-2">
          <div
            role="tablist"
            aria-label={MESSAGES.promotion.title}
            className="flex gap-2 overflow-x-auto hide-scrollbar pb-1"
          >
            {LESSON_TYPE_TABS.map(({ key, label }) => {
              const active = key === selectedType;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedType(key)}
                  className={cn(
                    'shrink-0 px-3 h-9 rounded-w-pill text-card-meta font-semibold border transition-colors motion-reduce:transition-none',
                    active
                      ? 'bg-ice-500 text-white border-ice-500'
                      : 'bg-white dark:bg-rink-800 text-wtext-2 dark:text-rink-100 border-wline dark:border-rink-700 hover:border-ice-500 hover:text-ice-500',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 카운트 */}
        {!isLoading && !error && promotions.length > 0 && (
          <div className="px-4 pt-2 pb-1 flex items-center justify-between">
            <span className="text-card-meta text-wtext-3 dark:text-rink-300">
              {MESSAGES.promotion.listCount(pagination.total)}
            </span>
          </div>
        )}

        {/* 리스트 */}
        {isLoading ? null : error ? (
          <div className="flex flex-col items-center justify-center px-6 py-20">
            <Icon
              name="error_outline"
              className="text-4xl text-wtext-4 dark:text-rink-500 mb-3"
              aria-hidden="true"
            />
            <p className="text-card-body text-wtext-3 dark:text-rink-300 text-center">{error}</p>
          </div>
        ) : promotions.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-20">
            <div className="w-16 h-16 rounded-w-pill bg-wline-2 dark:bg-rink-800 flex items-center justify-center mb-4">
              <Icon
                name="campaign"
                className="text-3xl text-wtext-3 dark:text-rink-300"
                aria-hidden="true"
              />
            </div>
            <p className="text-card-body text-wtext-3 dark:text-rink-300 text-center">
              {MESSAGES.promotion.empty}
            </p>
          </div>
        ) : (
          <div className="px-4 pt-2 pb-8 space-y-3">
            {promotions.map((promotion) => (
              <PromotionCard
                key={promotion.id}
                promotion={promotion}
                onPress={handlePromotionPress}
              />
            ))}
          </div>
        )}
      </main>
    </MobileContainer>
  );
}
