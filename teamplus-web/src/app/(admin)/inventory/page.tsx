'use client';

import { useMemo, useState } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { usePageReady } from '@/hooks/usePageReady';

// 기능/API 연동 전까지 사용되는 데모용 샘플 (추후 API 연동 시 교체)
interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  stock: number;
  threshold: number;
  unit: string;
}

type StockFilter = 'all' | 'low' | 'out';

const SAMPLE_ITEMS: InventoryItem[] = [
  { id: 'i1', name: '아이스하키 스틱 (Junior)', sku: 'HS-J-101', category: '스틱', stock: 24, threshold: 10, unit: '개' },
  { id: 'i2', name: '아이스하키 퍽 (경기용)', sku: 'PK-M-002', category: '퍽', stock: 6, threshold: 20, unit: '개' },
  { id: 'i3', name: '골키퍼 마스크', sku: 'GK-MS-03', category: '보호구', stock: 0, threshold: 5, unit: '개' },
  { id: 'i4', name: '연습용 저지 (L)', sku: 'JS-L-201', category: '유니폼', stock: 48, threshold: 15, unit: '벌' },
];

const FILTERS: { key: StockFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'low', label: '재고 부족' },
  { key: 'out', label: '품절' },
];

function getStockStatus(stock: number, threshold: number): {
  tone: 'ok' | 'low' | 'out';
  label: string;
  badge: string;
  numberColor: string;
} {
  if (stock === 0) {
    return {
      tone: 'out',
      label: '품절',
      badge: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
      numberColor: 'text-red-600 dark:text-red-400',
    };
  }
  if (stock <= threshold) {
    return {
      tone: 'low',
      label: '재고 부족',
      badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
      numberColor: 'text-amber-600 dark:text-amber-400',
    };
  }
  return {
    tone: 'ok',
    label: '양호',
    badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    numberColor: 'text-wtext-1 dark:text-white',
  };
}

export default function InventoryPage() {
  const [filter, setFilter] = useState<StockFilter>('all');

  // 추후 API 연동 시 apiRequest로 교체
  const items = SAMPLE_ITEMS;

  usePageReady(true);

  const summary = useMemo(() => {
    const total = items.length;
    const low = items.filter((i) => i.stock > 0 && i.stock <= i.threshold).length;
    const out = items.filter((i) => i.stock === 0).length;
    return { total, low, out };
  }, [items]);

  const visibleItems = useMemo(() => {
    return items.filter((i) => {
      if (filter === 'low') return i.stock > 0 && i.stock <= i.threshold;
      if (filter === 'out') return i.stock === 0;
      return true;
    });
  }, [items, filter]);

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="재고 관리" />

      <main className="flex-1 overflow-y-auto px-5 pt-5 pb-28">
        {/* Hero */}
        <section className="mb-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ice-500 mb-2">
            Inventory
          </p>
          <h2 className="text-2xl font-black text-wtext-1 dark:text-white leading-tight tracking-tight">
            재고 현황
          </h2>
          <p className="mt-2 text-card-body font-medium text-wtext-3 dark:text-rink-300">
            상품 수량을 점검하고 부족한 재고를 한눈에 확인하세요.
          </p>
        </section>

        {/* 요약 카드 */}
        <section aria-label="재고 요약" className="mb-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-wtext-3 dark:text-rink-300">
              전체 상품
            </p>
            <p className="mt-1 text-2xl font-black text-wtext-1 dark:text-white text-right tabular-nums">
              {summary.total}
            </p>
          </div>
          <div className="rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-wtext-3 dark:text-rink-300">
              부족
            </p>
            <p className="mt-1 text-2xl font-black text-amber-600 dark:text-amber-400 text-right tabular-nums">
              {summary.low}
            </p>
          </div>
          <div className="rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-wtext-3 dark:text-rink-300">
              품절
            </p>
            <p className="mt-1 text-2xl font-black text-red-600 dark:text-red-400 text-right tabular-nums">
              {summary.out}
            </p>
          </div>
        </section>

        {/* 필터 */}
        <section aria-label="재고 상태 필터" className="mb-5">
          <div className="flex gap-2 overflow-x-auto hide-scrollbar">
            {FILTERS.map(({ key, label }) => {
              const count =
                key === 'all' ? summary.total :
                key === 'low' ? summary.low :
                summary.out;
              const active = filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-w-pill px-4 text-card-body font-bold transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900 ${
                    active
                      ? 'bg-ice-500 text-white shadow-sm'
                      : 'bg-white dark:bg-rink-800 text-wtext-2 dark:text-rink-100 border border-wline dark:border-rink-700 hover:bg-wbg dark:hover:bg-rink-700'
                  }`}
                  aria-pressed={active}
                >
                  {label}
                  <span
                    className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-w-pill text-[11px] font-bold tabular-nums ${
                      active ? 'bg-white/20 text-white' : 'bg-wline-2 dark:bg-rink-700 text-wtext-3 dark:text-rink-300'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 안내 배너 */}
        <div className="mb-5 rounded-xl border border-ice-500/20 bg-ice-500/5 dark:bg-ice-500/10 p-4 flex gap-3">
          <Icon
            name="info"
            className="text-[20px] text-ice-500 shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-card-body font-bold text-ice-500">샘플 데이터로 미리 보는 재고 관리</p>
            <p className="mt-1 text-card-meta font-medium text-wtext-2 dark:text-rink-300 leading-relaxed">
              실제 API 연동이 준비되면 이 화면에서 상품 재고를 실시간으로 확인하고 관리할 수 있습니다.
            </p>
          </div>
        </div>

        {/* 상품 목록 */}
        <section aria-labelledby="inventory-heading">
          <div className="mb-3 flex items-end justify-between">
            <h3
              id="inventory-heading"
              className="text-card-title font-bold text-wtext-1 dark:text-white tracking-tight"
            >
              상품 목록
              <span className="ml-2 text-card-body font-semibold text-wtext-3 dark:text-rink-300 tabular-nums">
                {visibleItems.length}개
              </span>
            </h3>
          </div>

          {visibleItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-wline dark:border-rink-700 bg-white dark:bg-rink-800 p-10 text-center shadow-sm">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-w-pill bg-wline-2 dark:bg-rink-700">
                <Icon
                  name="inventory_2"
                  className="text-[28px] text-wtext-3 dark:text-rink-300"
                  aria-hidden="true"
                />
              </div>
              <p className="mt-4 text-card-emphasis font-bold text-wtext-2 dark:text-rink-100">
                해당 조건의 상품이 없습니다.
              </p>
              <p className="mt-1 text-card-body font-medium text-wtext-3 dark:text-rink-300">
                다른 필터를 선택해 확인해보세요.
              </p>
            </div>
          ) : (
            <ul className="space-y-3" aria-label="상품 재고 목록">
              {visibleItems.map((item) => {
                const s = getStockStatus(item.stock, item.threshold);
                return (
                  <li
                    key={item.id}
                    className={`bg-white dark:bg-rink-800 rounded-xl p-5 border shadow-sm hover:shadow-md transition-shadow motion-reduce:transition-none ${
                      s.tone === 'out'
                        ? 'border-red-200 dark:border-red-900/40'
                        : s.tone === 'low'
                        ? 'border-amber-200 dark:border-amber-900/40'
                        : 'border-wline dark:border-rink-700'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`size-12 shrink-0 rounded-xl flex items-center justify-center ${
                          s.tone === 'out'
                            ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                            : s.tone === 'low'
                            ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                            : 'bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100'
                        }`}
                        aria-hidden="true"
                      >
                        <Icon name="inventory_2" className="text-[24px]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-card-emphasis font-bold text-wtext-1 dark:text-white leading-snug line-clamp-2">
                          {item.name}
                        </h4>
                        <div className="mt-1 flex items-center gap-2 text-card-meta font-semibold text-wtext-3 dark:text-rink-300">
                          <span className="inline-flex items-center rounded-md bg-wline-2 dark:bg-rink-700 px-2 py-0.5 text-[10px] font-bold text-wtext-2 dark:text-rink-100">
                            {item.category}
                          </span>
                          <span className="text-wtext-4 dark:text-rink-500" aria-hidden="true">·</span>
                          <span className="tabular-nums">{item.sku}</span>
                        </div>
                      </div>
                      <span
                        className={`inline-flex shrink-0 items-center rounded-w-pill px-2.5 py-1 text-[11px] font-bold ${s.badge}`}
                      >
                        {s.label}
                      </span>
                    </div>

                    <div className="mt-4 pt-4 border-t border-wline-2 dark:border-rink-700 flex items-baseline justify-between gap-3">
                      <span className="text-[11px] font-semibold text-wtext-3 dark:text-rink-300">
                        재고 수량 <span className="text-wtext-3 dark:text-rink-300">(최소 {item.threshold}{item.unit})</span>
                      </span>
                      <span className="flex items-baseline gap-1 text-right">
                        <span className={`text-2xl font-black tabular-nums ${s.numberColor}`}>
                          {item.stock.toLocaleString('ko-KR')}
                        </span>
                        <span className="text-card-body font-bold text-wtext-3 dark:text-rink-300">
                          {item.unit}
                        </span>
                      </span>
                    </div>

                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        className="flex-1 h-11 inline-flex items-center justify-center gap-1 rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 px-4 text-card-body font-bold text-wtext-2 dark:text-rink-100 hover:bg-wbg dark:hover:bg-rink-700 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
                      >
                        <Icon name="edit" className="text-[16px]" aria-hidden="true" />
                        수정하기
                      </button>
                      <button
                        type="button"
                        className="flex-1 h-11 inline-flex items-center justify-center gap-1 rounded-xl bg-ice-500 px-4 text-card-body font-bold text-white shadow-sm hover:bg-ice-700 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
                      >
                        <Icon name="add" className="text-[16px]" aria-hidden="true" />
                        입고하기
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </MobileContainer>
  );
}
