'use client';

import { useState, useEffect } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { usePageReady } from '@/hooks/usePageReady';
import { useDefaultUI } from '@/hooks/useNativeUI';
import { apiRequest } from '@/services/api-client';
import { resolveImageSrc } from '@/lib/image-url';

// Badge data type
interface Badge {
  id: string;
  name: string;
  iconUrl: string | null;
  isUnlocked: boolean;
  description?: string | null;
  rarity: string;
  earnedAt?: string;
}

const RARITY_EMOJI: Record<string, string> = {
  legendary: '🏆', epic: '💜', rare: '💎', uncommon: '⭐', common: '🥇',
};

// Badge Card Component for children (WCAG AAA — 72x72dp minimum touch target, 18px+ fonts)
function BadgeCard({ badge }: { badge: Badge }) {
  if (!badge.isUnlocked) {
    return (
      <div
        className="bg-white dark:bg-rink-800 rounded-3xl border-2 border-wline dark:border-rink-700 p-6 flex flex-col items-center min-h-[200px]"
        role="group"
        aria-label="아직 받지 못한 뱃지, 출석하면 받을 수 있어요"
      >
        <div className="w-24 h-24 bg-wline-2 dark:bg-rink-700 rounded-2xl flex items-center justify-center border-2 border-dashed border-wline dark:border-rink-700">
          <svg className="w-12 h-12 text-wtext-3 dark:text-rink-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <span className="mt-4 text-xl font-black text-wtext-3 dark:text-rink-300 tracking-tight" aria-hidden="true">???</span>
      </div>
    );
  }

  const emoji = RARITY_EMOJI[badge.rarity] ?? '🎖️';
  const ariaLabel = badge.description
    ? `${badge.name} 뱃지, 획득함, ${badge.description}`
    : `${badge.name} 뱃지, 획득함`;

  return (
    <div
      className="bg-white dark:bg-rink-800 rounded-3xl border-2 border-ice-500 p-6 flex flex-col items-center min-h-[200px] relative"
      role="group"
      aria-label={ariaLabel}
    >
      <div className="w-24 h-24 bg-wbg dark:bg-rink-700 rounded-2xl flex items-center justify-center border-2 border-dashed border-ice-500/40 overflow-hidden">
        {resolveImageSrc(badge.iconUrl) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img loading="lazy" decoding="async" src={resolveImageSrc(badge.iconUrl)} alt="" aria-hidden="true" className="w-20 h-20 object-contain" />
        ) : (
          <span className="text-6xl" aria-hidden="true">{emoji}</span>
        )}
      </div>
      <span className="mt-4 text-xl font-black text-ice-500 tracking-tight text-center">{badge.name}</span>
      {badge.description && (
        <span className="mt-1 text-card-title font-semibold text-wtext-2 dark:text-rink-100 text-center line-clamp-2">{badge.description}</span>
      )}
      <div
        className="absolute top-3 right-3 w-8 h-8 bg-yellow-400 rounded-w-pill flex items-center justify-center shadow-md"
        aria-hidden="true"
      >
        <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      </div>
    </div>
  );
}

export default function BadgesPage() {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  useDefaultUI();

  useEffect(() => {
    const fetchBadges = async () => {
      setIsLoading(true);
      try {
        const res = await apiRequest<{
          badgeCount: number;
          badges: { id: string; name: string; iconUrl: string | null; description: string | null; rarity: string; earnedAt: string }[];
        }>({
          method: 'GET',
          url: '/users/me/badges',
          retry: false,
        });
        if (res.success && res.data) {
          setBadges(
            res.data.badges.map((b) => ({
              id: b.id,
              name: b.name,
              iconUrl: b.iconUrl,
              isUnlocked: true,
              description: b.description,
              rarity: b.rarity,
              earnedAt: b.earnedAt,
            }))
          );
        }
      } finally {
        setIsLoading(false);
      }
    };
    fetchBadges();
  }, []);

  const unlockedCount = badges.length;

  return (
    <MobileContainer hasBottomNav>
      {/* [2026-05-13 이슈 D6] forceNative — App/Web 모두 동일 PageAppBar 노출 보장.
          useDefaultUI 가 Flutter Native AppBar 를 showAppBar:false 로 끄므로 이중 헤더 없음. */}
      {/* WCAG AAA: variant='default' + toneVariant='kid' — 64px AppBar + size-12 뒤로가기 + 22px font-extrabold 타이틀. */}
      <PageAppBar title="뱃지 컬렉션" forceNative toneVariant="kid" titleClassName="text-card-section font-extrabold" />

      {/* Main Content */}
      <main className="px-5 py-6 pb-30" role="main" aria-label="뱃지 컬렉션">
        {/* Title Section */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-28 h-28 bg-yellow-400 rounded-3xl flex items-center justify-center mb-5 shadow-md rotate-6">
            <Icon name="star" filled className="text-6xl text-white" aria-hidden="true" />
          </div>
          <h1 className="text-4xl font-black text-wtext-1 dark:text-white mb-3 tracking-tight">내가 모은 뱃지</h1>
          <div
            className="inline-flex items-center px-6 py-3 bg-white dark:bg-rink-800 border-2 border-ice-500 rounded-w-pill min-h-[48px]"
            role="status"
            aria-live="polite"
            aria-label={`현재까지 ${unlockedCount}개 뱃지 획득`}
          >
            <span className="text-xl font-black text-ice-500 tabular-nums tracking-tight">총 {unlockedCount}개 획득!</span>
          </div>

          {/* 독려 메시지 — 아동 친화 톤 (WCAG AAA 유지: 18px+ 폰트) */}
          {!isLoading && unlockedCount > 0 && (
            <p className="mt-4 text-card-title font-bold text-wtext-2 dark:text-rink-100 text-center">
              <span role="img" aria-label="응원">🎉</span> 계속 출석해서 더 많은 뱃지를 모아봐요!
            </p>
          )}
        </div>

        {/* Badge Grid - 2 columns for child-friendly touch targets */}
        {isLoading ? null : badges.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-4">
            <span className="text-7xl" aria-hidden="true">🥇</span>
            <p className="text-2xl font-black text-wtext-2 dark:text-rink-100 tracking-tight">아직 뱃지가 없어요!</p>
            <p className="text-card-title font-semibold text-wtext-3 dark:text-rink-300">출석하면 뱃지를 받을 수 있어요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {badges.map((badge) => (
              <BadgeCard key={badge.id} badge={badge} />
            ))}
          </div>
        )}
      </main>

    </MobileContainer>
  );
}
