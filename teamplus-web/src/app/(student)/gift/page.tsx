'use client';

import { useState } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { useDefaultUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';

interface Gift {
  id: number;
  name: string;
  description: string;
  icon: string;
  bgColor: string;
  expiresAt: string;
  isNew: boolean;
  isUsed: boolean;
}

const gifts: Gift[] = [
  {
    id: 1,
    name: '아이스크림',
    description: '편의점 기프티콘',
    icon: 'icecream',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    expiresAt: '~24.12.31',
    isNew: true,
    isUsed: false
  },
  {
    id: 2,
    name: '편의점 상품권',
    description: '3,000원 권',
    icon: 'store',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    expiresAt: '~24.11.15',
    isNew: false,
    isUsed: false
  },
  {
    id: 3,
    name: '문구점 이용권',
    description: '5,000원 권',
    icon: 'palette',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    expiresAt: '만료됨',
    isNew: false,
    isUsed: true
  },
];

// Tab type
type TabType = 'coupon' | 'badge';

export default function ChildGiftPage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  const [activeTab, setActiveTab] = useState<TabType>('coupon');
  const [isRevealed, setIsRevealed] = useState(false);

  // [2026-05-13 이슈 D9/D10] Flutter Native AppBar 끄고 Web PageAppBar(forceNative) 단일 노출.
  //  reveal/storage 두 분기 모두 동일 PageAppBar 사용.
  useDefaultUI();

  // Gift reveal view
  if (!isRevealed) {
    return (
      <MobileContainer hasBottomNav={false} className="bg-wbg dark:bg-rink-900">
        {/* [2026-05-13 이슈 D9] forceNative — App/Web 동일 AppBar. */}
        {/* WCAG AAA: toneVariant='kid' — 64px AppBar + size-12 뒤로가기 + 22px font-extrabold 타이틀. */}
        <PageAppBar title="선물·리워드" forceNative toneVariant="kid" titleClassName="text-card-section font-extrabold" />

        {/* 스크롤 가능한 본문 — confetti 배경 장식은 내부에 relative 배치 */}
        <main className="flex-1 overflow-y-auto hide-scrollbar relative">
          {/* Decorative Background Elements */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            {/* Confetti shapes */}
            <div className="absolute left-[10%] top-[15%] h-4 w-4 rounded-w-pill bg-ice-500/40 opacity-80" />
            <div className="absolute left-[5%] top-[22%] h-3 w-3 rotate-12 rounded bg-amber-400 opacity-80" />
            <div className="absolute left-[20%] top-[18%] h-0 w-0 -rotate-[15deg] border-l-[8px] border-r-[8px] border-b-[14px] border-transparent border-b-primary opacity-70" />
            <div className="absolute left-[15%] top-[25%] h-2 w-2 rounded-w-pill bg-amber-300 opacity-80" />

            <div className="absolute right-[12%] top-[12%] h-5 w-5 rounded-w-pill bg-ice-500/30 opacity-80" />
            <div className="absolute right-[8%] top-[20%] h-4 w-4 rotate-45 rounded bg-ice-500/40 opacity-80" />
            <div className="absolute right-[22%] top-[16%] h-0 w-0 rotate-[10deg] border-l-[8px] border-r-[8px] border-b-[14px] border-transparent border-b-amber-400 opacity-70" />

            <div className="absolute bottom-[30%] left-[8%] h-3 w-3 rounded-w-pill bg-ice-500/50 opacity-80" />
            <div className="absolute bottom-[35%] right-[10%] h-2 w-2 rotate-12 rounded bg-amber-400 opacity-80" />
          </div>

          {/* Main Content */}
          <div className="relative z-10 mx-auto flex w-full max-w-md flex-col items-center px-6 pt-6 pb-6">
            {/* Header Text */}
            <div className="mb-6 text-center">
              <span className="mb-3 inline-flex items-center gap-1.5 rounded-w-pill bg-ice-500/10 px-3 py-1 text-card-meta font-bold text-ice-500">
                <Icon name="auto_awesome" className="text-[14px]" filled aria-hidden="true" />
                SPECIAL REWARD
              </span>
              <h1 className="text-w-h1 font-extrabold leading-[1.2] tracking-tight text-wtext-1 dark:text-white">
                와아, 다 모았어요!
                <br />
                <span className="text-ice-500">정말 멋져요</span>
              </h1>
              <p className="mt-3 text-card-emphasis font-medium text-wtext-3 dark:text-rink-300">
                스티커 10개를 완성해서 선물이 도착했어요
              </p>
            </div>

            {/* Hero Assembly */}
            <div className="relative flex aspect-[4/5] max-h-[400px] w-full flex-col items-center justify-center">
              {/* Glow Effect */}
              <div className="absolute top-[10%] h-64 w-64 rounded-w-pill bg-ice-500/5 dark:bg-ice-500/10" aria-hidden="true" />

              {/* Reward Item */}
              <div className="relative z-20 -mb-8 translate-y-4 transform">
                <div className="rounded-3xl border border-wline-2 bg-white p-4 shadow-md dark:border-rink-700 dark:bg-rink-800">
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex h-36 w-36 items-center justify-center">
                      <Icon
                        name="icecream"
                        className="text-[100px] text-pink-400"
                        filled
                        weight={600}
                        aria-hidden="true"
                      />
                    </div>
                    <div className="pb-2 text-center">
                      <span className="mb-1 block text-card-meta font-bold uppercase tracking-widest text-ice-500">
                        REWARD
                      </span>
                      <h3 className="text-xl font-bold text-wtext-1 dark:text-white">
                        아이스크림 쿠폰
                      </h3>
                    </div>
                  </div>
                </div>

                {/* Star Badge */}
                <div className="absolute -right-4 -top-4 flex h-12 w-12 items-center justify-center rounded-w-pill border-4 border-white bg-ice-500 text-white shadow-md dark:border-rink-900">
                  <Icon name="star" className="text-[24px]" filled aria-hidden="true" />
                </div>
              </div>

              {/* Gift Box */}
              <div className="relative z-10 mt-4 flex h-52 w-52 items-center justify-center">
                <Icon
                  name="featured_seasonal_and_gifts"
                  className="text-[160px] text-amber-500"
                  filled
                  weight={600}
                  aria-hidden="true"
                />
              </div>
            </div>

            {/* Bottom Action — 본문 흐름에 포함시켜 스크롤과 함께 이동 */}
            <div className="relative z-20 mt-8 w-full">
              <button
                type="button"
                onClick={() => setIsRevealed(true)}
                aria-label="내 보관함 열기"
                className="flex min-h-[72px] w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-ice-500 text-white shadow-md transition-colors hover:bg-ice-700 active:brightness-95 motion-reduce:transition-none"
              >
                <Icon name="inventory_2" className="text-[22px]" filled aria-hidden="true" />
                <span className="text-card-title font-bold">내 보관함 가기</span>
              </button>
              <p className="mt-4 text-center text-card-body font-medium text-wtext-3 dark:text-rink-300">
                보관함에서 언제든지 다시 확인할 수 있어요
              </p>
            </div>
          </div>
        </main>
      </MobileContainer>
    );
  }

  // Gift Storage View
  return (
    <MobileContainer hasBottomNav className="bg-wbg dark:bg-rink-900">
      {/* [2026-05-13 이슈 D10] forceNative — 보관함 화면도 App/Web 동일 AppBar. */}
      {/* WCAG AAA: toneVariant='kid' — 64px AppBar + size-12 뒤로가기 + 22px font-extrabold 타이틀. */}
      <PageAppBar title="선물·리워드" forceNative toneVariant="kid" titleClassName="text-card-section font-extrabold" />

      {/* Tabs */}
      <div className="z-20 w-full bg-wbg px-5 pb-4 pt-4 dark:bg-rink-900" role="tablist" aria-label="보관함 탭">
        <div className="flex gap-1.5 rounded-2xl bg-wline-2 p-1.5 dark:bg-rink-800">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'coupon'}
            onClick={() => setActiveTab('coupon')}
            className={cn(
              'flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 transition-all duration-200 motion-reduce:transition-none',
              activeTab === 'coupon'
                ? 'bg-ice-500 text-white shadow-sm'
                : 'text-wtext-3 hover:text-wtext-2 dark:text-rink-300 dark:hover:text-rink-100'
            )}
          >
            <Icon name="confirmation_number" className="text-[20px]" filled aria-hidden="true" />
            <span className="text-card-emphasis font-bold tracking-tight">내 쿠폰</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'badge'}
            onClick={() => setActiveTab('badge')}
            className={cn(
              'flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 transition-all duration-200 motion-reduce:transition-none',
              activeTab === 'badge'
                ? 'bg-ice-500 text-white shadow-sm'
                : 'text-wtext-3 hover:text-wtext-2 dark:text-rink-300 dark:hover:text-rink-100'
            )}
          >
            <Icon name="military_tech" className="text-[20px]" filled aria-hidden="true" />
            <span className="text-card-emphasis font-bold tracking-tight">내 뱃지</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-5 pb-30 pt-2" role="main" aria-label="내 보관함">
        <div className="grid grid-cols-2 gap-3">
          {gifts.map((gift) => (
            <article
              key={gift.id}
              className={cn(
                'group relative flex cursor-pointer flex-col items-center overflow-hidden rounded-2xl border border-wline-2 bg-white p-3 shadow-sm transition-all duration-200 active:brightness-95 motion-reduce:transition-none dark:border-rink-700 dark:bg-rink-800',
                gift.isUsed && 'opacity-75'
              )}
              role="group"
              aria-label={`${gift.name} 쿠폰, ${gift.description}, ${gift.isUsed ? '사용 완료' : `사용기한 ${gift.expiresAt}`}${gift.isNew ? ', 새 쿠폰' : ''}`}
            >
              {/* Icon Area */}
              <div
                className={cn(
                  'relative mb-3 flex aspect-square w-full items-center justify-center rounded-xl',
                  gift.bgColor
                )}
              >
                <Icon
                  name={gift.icon}
                  className={cn(
                    'z-10 text-[60px] transition-transform duration-300 motion-reduce:transition-none',
                    gift.icon === 'icecream' && 'text-pink-400',
                    gift.icon === 'store' && 'text-orange-500',
                    gift.icon === 'palette' && 'text-emerald-500',
                    !gift.isUsed && 'group-hover:scale-110 group-hover:rotate-6'
                  )}
                  filled
                  aria-hidden="true"
                />

                {/* NEW Badge */}
                {gift.isNew && (
                  <span className="absolute left-2 top-2 z-20 rounded-w-pill bg-ice-500 px-2 py-0.5 text-card-meta font-black text-white shadow-sm">
                    NEW
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="w-full text-center">
                <h3 className="mb-0.5 truncate text-card-title font-extrabold tracking-tight text-wtext-1 dark:text-white">
                  {gift.name}
                </h3>
                <p className="mb-2.5 truncate text-card-meta font-medium text-wtext-3 dark:text-rink-300">
                  {gift.description}
                </p>
                <div className="w-full rounded-lg border border-wline-2 bg-wbg py-1.5 dark:border-rink-700 dark:bg-rink-700">
                  <p className="mb-0.5 text-card-meta font-bold text-wtext-3 dark:text-rink-300">사용기간</p>
                  <p className={cn(
                    'text-card-body font-black tabular-nums',
                    gift.isUsed ? 'text-wtext-3 dark:text-rink-300' : 'text-ice-500'
                  )}>
                    {gift.expiresAt}
                  </p>
                </div>
              </div>

              {/* Used Overlay */}
              {gift.isUsed && (
                <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-white/60 dark:bg-rink-900/60">
                  <div className="-rotate-12 rounded-w-pill bg-rink-800 px-3 py-1 text-card-meta font-bold text-white">
                    사용완료
                  </div>
                </div>
              )}
            </article>
          ))}

          {/* Empty Slot */}
          <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-wline bg-wbg/50 p-4 text-center dark:border-rink-700 dark:bg-rink-800/50">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-w-pill bg-ice-500/10">
              <Icon name="redeem" className="text-[28px] text-ice-500" aria-hidden="true" />
            </div>
            <p className="text-card-body font-bold leading-relaxed text-wtext-3 dark:text-rink-300">
              스티커를 더 모아
              <br />
              선물을 채워보세요
            </p>
          </div>
        </div>

        <div className="mt-6 pb-4 text-center">
          <p className="inline-flex items-center justify-center gap-1 rounded-w-pill bg-wline-2 px-3 py-1.5 text-card-meta font-medium text-wtext-3 dark:bg-rink-800 dark:text-rink-300">
            <Icon name="info" className="text-[14px]" aria-hidden="true" />
            쿠폰은 매장에서 직접 보여주세요
          </p>
        </div>
      </main>

      {/* FAB — BottomNav(약 64px) + safe-area-inset-bottom 위로 띄움 */}
      {/* WCAG AAA: 72×72dp 터치타겟 보장. */}
      <div
        className="fixed right-4 z-40"
        style={{
          bottom:
            'calc(72px + 16px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))',
        }}
      >
        <button
          type="button"
          className="flex min-h-[72px] min-w-[72px] h-[72px] w-[72px] items-center justify-center rounded-w-pill border-4 border-white bg-ice-500 text-white shadow-md transition-transform hover:bg-ice-700 active:brightness-95 motion-reduce:transition-none dark:border-rink-800 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-flame-500 focus-visible:ring-offset-2"
          aria-label="QR 코드로 출석 체크하기"
        >
          <Icon name="qr_code_scanner" className="text-[28px] font-bold" filled aria-hidden="true" />
        </button>
      </div>
    </MobileContainer>
  );
}
