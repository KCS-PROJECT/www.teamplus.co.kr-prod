'use client';

import { useState, useEffect } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { cn } from '@/lib/utils';
import { api } from '@/services/api-client';
import { getRarityPill } from '@/lib/rarity-colors';
import { MESSAGES } from '@/lib/messages';

import { usePageReady } from '@/hooks/usePageReady';
import { useDefaultUI } from '@/hooks/useNativeUI';
/**
 * Stickers (뱃지) 화면 — GET /badges/me 연동
 * 뱃지 카테고리: attendance | skill | achievement | special
 */

type StickerType = 'hockey' | 'puck' | 'star' | 'trophy' | 'locked';
type StickerStatus = 'collected' | 'empty' | 'locked';

interface Sticker {
  id: number;
  type: StickerType;
  status: StickerStatus;
  name?: string;
  rarity?: string;
}

interface ApiBadge {
  id: string;
  earnedAt: string;
  badge: {
    id: string;
    name: string;
    category: string;
    rarity: string;
    iconUrl: string | null;
  };
}

interface BadgesResponse {
  badges: ApiBadge[];
  stats: {
    earned: number;
    total: number;
    earnedRate: number;
  };
}

const TOTAL_SLOTS = 12;

function categoryToType(category: string): StickerType {
  switch (category) {
    case 'attendance': return 'hockey';
    case 'skill': return 'star';
    case 'achievement': return 'trophy';
    case 'special': return 'puck';
    default: return 'hockey';
  }
}

// rarity 색상은 lib/rarity-colors.ts SoT 가 담당. 여기서는 import 만.

const typeIcons: Record<StickerType, string> = {
  hockey: 'sports_hockey',
  puck: 'circle',
  star: 'star',
  trophy: 'emoji_events',
  locked: 'lock',
};

function StickerItem({ sticker }: { sticker: Sticker }) {
  if (sticker.status === 'empty') {
    return (
      <div
        className="w-20 h-20 rounded-w-pill border-4 border-dashed border-wline dark:border-rink-700 bg-wbg dark:bg-rink-800/50 flex items-center justify-center relative group cursor-pointer hover:border-ice-500/50 transition-colors motion-reduce:transition-none"
        role="img"
        aria-label={`${sticker.id}번 스티커, 아직 비어있음`}
      >
        <span className="text-wtext-4 dark:text-rink-500 font-black text-2xl" aria-hidden="true">{sticker.id}</span>
      </div>
    );
  }

  if (sticker.status === 'locked') {
    return (
      <div
        className="w-20 h-20 rounded-w-pill bg-wline dark:bg-rink-800 border-4 border-wline dark:border-rink-700 flex items-center justify-center opacity-50"
        role="img"
        aria-label={`${sticker.id}번 스티커, 잠겨있음`}
      >
        <Icon name="lock" className="text-wtext-3 text-2xl" aria-hidden="true" />
      </div>
    );
  }

  const colorClass = getRarityPill(sticker.rarity);

  return (
    <div
      className={cn(
        'w-20 h-20 rounded-w-pill flex items-center justify-center relative shadow-md transform transition-transform motion-reduce:transition-none hover:scale-110 hover:rotate-12 border-4',
        colorClass
      )}
      role="img"
      aria-label={sticker.name ? `${sticker.name} 스티커, 획득함` : `${sticker.id}번 스티커, 획득함`}
      title={sticker.name}
    >
      <div className="absolute top-2 left-2 w-6 h-3 bg-white/40 rounded-w-pill transform -rotate-45" aria-hidden="true" />
      <Icon
        name={typeIcons[sticker.type]}
        className="text-4xl drop-shadow-sm"
        filled={sticker.type !== 'hockey'}
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-2 -right-2 w-7 h-7 bg-white dark:bg-rink-800 rounded-w-pill border-2 border-wline-2 dark:border-rink-700 flex items-center justify-center shadow-sm"
        aria-hidden="true"
      >
        <span className="text-card-meta font-bold text-wtext-3 dark:text-rink-300">{sticker.id}</span>
      </div>
    </div>
  );
}

export default function StickersPage() {
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [stats, setStats] = useState({ earned: 0, total: TOTAL_SLOTS, earnedRate: 0 });
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  // [2026-05-13 이슈 D7] Flutter Native AppBar 끄고 Web PageAppBar(forceNative) 단일 노출.
  useDefaultUI();

  useEffect(() => {
    const load = async () => {
      const res = await api.get<BadgesResponse>('/badges/me');
      if (res.success && res.data) {
        const earned = res.data.badges;
        const earnedStickers: Sticker[] = earned.slice(0, TOTAL_SLOTS).map((b, i) => ({
          id: i + 1,
          type: categoryToType(b.badge.category),
          status: 'collected',
          name: b.badge.name,
          rarity: b.badge.rarity,
        }));

        const remaining = TOTAL_SLOTS - earnedStickers.length;
        const emptyStickers: Sticker[] = Array.from({ length: Math.max(0, remaining) }, (_, i) => ({
          id: earnedStickers.length + i + 1,
          type: 'locked',
          status: i < 3 ? 'empty' : 'locked',
        }));

        setStickers([...earnedStickers, ...emptyStickers]);
        setStats({
          earned: res.data.stats.earned,
          total: Math.max(res.data.stats.total, TOTAL_SLOTS),
          earnedRate: res.data.stats.earnedRate,
        });
      } else {
        // API 없을 시 빈 슬롯으로 표시
        setStickers(Array.from({ length: TOTAL_SLOTS }, (_, i) => ({
          id: i + 1,
          type: 'locked',
          status: 'locked',
        })));
      }
      setIsLoading(false);
    };
    load();
  }, []);

  const collectedCount = stickers.filter((s) => s.status === 'collected').length;
  const progressPercent = stats.total > 0 ? (stats.earned / stats.total) * 100 : 0;

  return (
    <MobileContainer hasBottomNav className="bg-wbg dark:bg-rink-900">
      {/* [2026-05-13 이슈 D7] forceNative — App/Web 동일 AppBar. Flutter Native AppBar 는 useDefaultUI 가 끄므로 이중 헤더 없음. */}
      {/* WCAG AAA: toneVariant='kid' — 64px AppBar + size-12 뒤로가기 + 22px font-extrabold 타이틀. */}
      <PageAppBar title="칭찬 스티커" forceNative toneVariant="kid" titleClassName="text-card-section font-extrabold" />

      <main className="flex-1 px-5 py-6 overflow-y-auto pb-30" role="main" aria-label="스티커 컬렉션">
        {/* 상태 카드 */}
        <section className="relative mb-6 overflow-hidden rounded-2xl border border-wline-2 bg-white p-6 shadow-sm dark:border-rink-700 dark:bg-rink-800">
          <div className="relative z-10">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-card-meta font-semibold uppercase tracking-wider text-wtext-3 dark:text-rink-300">내 스티커</p>
                <h2 className="text-card-emphasis font-bold text-wtext-2 dark:text-rink-100">지금까지 모은 스티커</h2>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ice-500/10">
                <Icon name="emoji_events" className="text-xl text-ice-500" filled aria-hidden="true" />
              </div>
            </div>

            <div className="mb-4 flex items-end justify-center gap-2" aria-live="polite">
              {isLoading ? (
                <div className="h-10 w-10 animate-spin rounded-w-pill border-[3px] border-ice-500/30 border-t-primary motion-reduce:animate-none" aria-label={MESSAGES.loading.inProgress} />
              ) : (
                <>
                  <span className="text-5xl font-black text-ice-500 tabular-nums leading-none">{collectedCount}</span>
                  <span className="pb-1 text-xl font-bold text-wtext-3 tabular-nums">/ {TOTAL_SLOTS}</span>
                </>
              )}
            </div>

            <div className="h-3 w-full overflow-hidden rounded-w-pill bg-wline-2 dark:bg-rink-700" role="progressbar" aria-valuenow={Math.round(progressPercent)} aria-valuemin={0} aria-valuemax={100}>
              <div
                className="h-full rounded-w-pill bg-ice-500 transition-all duration-1000 ease-out motion-reduce:transition-none"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-card-body font-medium text-wtext-3 dark:text-rink-300">
              <Icon name="card_giftcard" className="text-[16px] text-ice-500" aria-hidden="true" />
              {TOTAL_SLOTS - collectedCount > 0
                ? `${TOTAL_SLOTS - collectedCount}개만 더 모으면 선물을 받을 수 있어요`
                : '모든 스티커를 모았어요! 선물을 확인해보세요'}
            </p>
          </div>
        </section>

        {/* 스티커 보드 */}
        <section
          className="relative rounded-2xl border border-amber-200/60 bg-amber-50 p-6 shadow-inner dark:border-rink-700 dark:bg-rink-800/60"
          aria-label="스티커 수집 보드"
        >
          <div
            className="pointer-events-none absolute inset-0 rounded-2xl opacity-[0.04] dark:opacity-[0.08]"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'20\' height=\'20\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Ccircle cx=\'10\' cy=\'10\' r=\'1\' fill=\'%23000\'/%3E%3C/svg%3E")', backgroundSize: '20px 20px' }}
            aria-hidden="true"
          />
          <div className="relative z-10 grid grid-cols-3 place-items-center gap-x-4 gap-y-8">
            {stickers.map((sticker) => (
              <StickerItem key={sticker.id} sticker={sticker} />
            ))}
            <div className="col-span-3 mt-4 flex w-full justify-center border-t-2 border-dashed border-amber-200/80 pt-4 dark:border-rink-700">
              <div className="rounded-w-pill border border-amber-100 bg-white px-6 py-2 shadow-sm dark:border-rink-700 dark:bg-rink-800">
                <span className="text-card-meta font-bold uppercase tracking-widest text-amber-600 dark:text-ice-500">최종 목표</span>
              </div>
            </div>
            <div className="col-span-3">
              <div className="group relative flex h-28 w-28 rotate-3 cursor-pointer items-center justify-center rounded-3xl border-4 border-white bg-ice-500 shadow-md transition-transform hover:scale-105 motion-reduce:transition-none dark:border-rink-700">
                <Icon name="card_giftcard" className="text-6xl text-white drop-shadow-md group-hover:animate-bounce motion-reduce:animate-none" filled aria-hidden="true" />
                <div className="absolute -top-3 -right-3 rounded-w-pill bg-amber-400 px-3 py-1 text-card-meta font-black text-white shadow-md animate-bounce motion-reduce:animate-none">
                  SECRET
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </MobileContainer>
  );
}
