'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { useDefaultUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';

// Checklist Items Data
const initialItems = [
  { id: 1, name: '헬멧', icon: 'sports_mma', color: 'text-blue-600 dark:text-blue-400', checked: false },
  { id: 2, name: '스케이트', icon: 'ice_skating', color: 'text-wtext-2 dark:text-rink-100', checked: false },
  { id: 3, name: '스틱', icon: 'sports_hockey', color: 'text-green-600 dark:text-green-400', checked: false },
  { id: 4, name: '장갑', icon: 'back_hand', color: 'text-orange-600 dark:text-orange-400', checked: false },
  { id: 5, name: '보호대', icon: 'shield', color: 'text-red-600 dark:text-red-400', checked: false },
  { id: 6, name: '물통', icon: 'water_bottle', color: 'text-cyan-600 dark:text-cyan-400', checked: false },
];

export default function ChecklistPage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [isAllChecked, setIsAllChecked] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // [2026-05-13 이슈 D8] Flutter Native AppBar 끄고 Web PageAppBar(forceNative) 단일 노출.
  useDefaultUI();

  // 진행률 계산
  const checkedCount = items.filter(item => item.checked).length;
  const progress = (checkedCount / items.length) * 100;

  useEffect(() => {
    if (checkedCount === items.length) {
      setIsAllChecked(true);
      setShowConfetti(true);
      // 3초 후 컨페티 숨기기
      setTimeout(() => setShowConfetti(false), 3000);
    } else {
      setIsAllChecked(false);
      setShowConfetti(false);
    }
  }, [checkedCount, items.length]);

  const toggleItem = (id: number) => {
    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, checked: !item.checked } : item
    ));
  };

  return (
    <MobileContainer hasBottomNav className="bg-wbg dark:bg-rink-900">
      {/* [2026-05-13 이슈 D8] forceNative — App/Web 동일 AppBar 노출. */}
      {/* WCAG AAA: toneVariant='kid' — 64px AppBar + size-12 뒤로가기 + 22px font-extrabold 타이틀. */}
      <PageAppBar title="체크리스트" forceNative toneVariant="kid" titleClassName="text-card-section font-extrabold" />

      <main className="flex-1 min-h-0 overflow-y-auto hide-scrollbar px-5 py-6" role="main" aria-label="준비물 체크리스트">
        {/* Progress Section */}
        <section className="mb-6 rounded-2xl border border-wline-2 bg-white p-5 shadow-sm dark:border-rink-700 dark:bg-rink-800">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-card-meta font-semibold uppercase tracking-wider text-wtext-3 dark:text-rink-300">오늘의 준비물</p>
              <h2 className="mt-0.5 text-card-emphasis font-bold text-wtext-1 dark:text-white">
                {isAllChecked ? "완벽해요, 준비 끝!" : "빠진 물건이 없나요?"}
              </h2>
            </div>
            <div className="flex items-baseline gap-1 tabular-nums">
              <span className="text-2xl font-black text-ice-500 leading-none">{checkedCount}</span>
              <span className="text-card-body font-bold text-wtext-3">/ {items.length}</span>
            </div>
          </div>
          <div
            className="mt-3 h-3 w-full overflow-hidden rounded-w-pill bg-wline-2 dark:bg-rink-700"
            role="progressbar"
            aria-valuenow={checkedCount}
            aria-valuemin={0}
            aria-valuemax={items.length}
          >
            <div
              className="h-full rounded-w-pill bg-ice-500 transition-all duration-500 ease-out motion-reduce:transition-none"
              style={{ width: `${progress}%` }}
            />
          </div>
        </section>

        {/* Checklist Grid */}
        <div className="grid grid-cols-2 gap-3">
          {items.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => toggleItem(item.id)}
              aria-pressed={item.checked}
              aria-label={`${item.name} ${item.checked ? '체크됨' : '체크 안 됨'}`}
              className={cn(
                "relative flex min-h-[140px] flex-col items-center p-5 rounded-2xl border-2 transition-all motion-reduce:transition-none duration-200 active:scale-95",
                item.checked
                  ? "bg-wline-2 dark:bg-rink-800/50 border-transparent opacity-70"
                  : "bg-white dark:bg-rink-800 border-transparent shadow-md hover:-translate-y-1"
              )}
            >
              {/* Checkmark Overlay */}
              {item.checked && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/5 dark:bg-black/20">
                  <div className="flex h-12 w-12 items-center justify-center rounded-w-pill bg-ice-500 shadow-md motion-reduce:animate-none">
                    <Icon name="check" className="text-3xl font-bold text-white" aria-hidden="true" />
                  </div>
                </div>
              )}

              <Icon
                name={item.icon}
                className={cn(
                  "text-6xl mb-3 transition-colors motion-reduce:transition-none",
                  item.checked ? "text-wtext-3 dark:text-rink-300 grayscale" : item.color,
                )}
                aria-hidden="true"
              />
              <span className={cn(
                "text-card-title font-bold transition-colors motion-reduce:transition-none",
                item.checked ? "text-wtext-3 dark:text-rink-300 line-through" : "text-wtext-1 dark:text-white"
              )}>
                {item.name}
              </span>
            </button>
          ))}
        </div>

        {/* Bottom Action — 스크롤 흐름 내부에 배치하여 BottomNav 위 줄무늬 제거 */}
        <div className="mt-6">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={!isAllChecked}
            className={cn(
              "flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl text-card-title font-bold text-white shadow-md transition-all active:scale-[0.98] motion-reduce:transition-none",
              isAllChecked
                ? "bg-ice-500 hover:bg-ice-700"
                : "cursor-not-allowed bg-wline dark:bg-rink-700",
            )}
          >
            {isAllChecked && <Icon name="check_circle" className="text-[22px]" filled aria-hidden="true" />}
            {isAllChecked ? "준비 완료! 출발해요" : "아직 남았어요"}
          </button>
        </div>
      </main>

      {/* Confetti Effect (CSS only for simplicity) — 토큰 ice/flame/mint/sun + flame-100 5색 */}
      {showConfetti && (
        <div
          className="fixed inset-0 pointer-events-none z-50 overflow-hidden motion-reduce:hidden"
          aria-hidden="true"
        >
          {[...Array(20)].map((_, i) => {
            const palette = ['bg-ice-500', 'bg-flame-500', 'bg-mint-500', 'bg-sun-500', 'bg-flame-100'];
            return (
              <div
                key={i}
                className={cn('absolute h-2.5 w-2.5 animate-confetti', palette[i % palette.length])}
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `-5%`,
                  animationDuration: `${Math.random() * 2 + 1}s`,
                  animationDelay: `${Math.random() * 0.5}s`,
                }}
              />
            );
          })}
        </div>
      )}

      <style jsx global>{`
        @keyframes confetti {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        .animate-confetti {
          animation-name: confetti;
          animation-timing-function: ease-out;
          animation-fill-mode: forwards;
        }
      `}</style>
    </MobileContainer>
  );
}