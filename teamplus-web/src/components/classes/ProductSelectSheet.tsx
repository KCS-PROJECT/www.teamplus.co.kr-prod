'use client';

import { useEffect, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { useNativeScrim } from '@/hooks/useNativeScrim';

export interface ProductSheetItem {
  id: string;
  productName: string;
  price: number;
  sessionsPerMonth?: number;
  feeType?: string;
  feePerSession?: number | null;
}

interface ProductSelectSheetProps {
  isOpen: boolean;
  onClose: () => void;
  products: ProductSheetItem[];
  onConfirm: (productId: string) => void;
}

const FEE_TYPE_META: Record<string, { icon: string; label: string; description: string }> = {
  MONTHLY_FIXED: {
    icon: 'calendar_month',
    label: '정기권',
    description: '주 단위 정기 결제',
  },
  PER_SESSION: {
    icon: 'confirmation_number',
    label: '횟수제',
    description: '원하는 횟수만큼 결제',
  },
  PER_GAME: {
    icon: 'sports_hockey',
    label: '경기당',
    description: '경기별 결제',
  },
};

function getFeeMeta(feeType?: string) {
  return FEE_TYPE_META[feeType ?? ''] ?? {
    icon: 'payments',
    label: '일반',
    description: '단일 결제',
  };
}

function buildSummary(product: ProductSheetItem): string {
  const parts: string[] = [];
  const meta = getFeeMeta(product.feeType);
  parts.push(meta.description);
  if (product.sessionsPerMonth && product.sessionsPerMonth > 0) {
    parts.push(`월 ${product.sessionsPerMonth}회`);
  }
  return parts.join(' · ');
}

function formatPriceLabel(product: ProductSheetItem): string {
  if (product.feeType === 'PER_SESSION' && product.feePerSession) {
    return `${Number(product.feePerSession).toLocaleString('ko-KR')}원 / 회`;
  }
  return `${product.price.toLocaleString('ko-KR')}원`;
}

export function ProductSelectSheet({
  isOpen,
  onClose,
  products,
  onConfirm,
}: ProductSelectSheetProps) {
  const [selectedId, setSelectedId] = useState<string>('');

  // [SPEC_POPUP_FULLSCREEN_DIM] Flutter native status bar dim — Sheet 패턴.
  // 2026-05-16: BottomSheet 류는 `bottom: false` — 시트 카드가 화면 하단까지 차지.
  //   SoT: docs/Design/MODAL_DIM_POLICY.md
  useNativeScrim(isOpen, '#73141826', { bottom: false });

  // 시트 열릴 때마다 첫 상품으로 선택 초기화
  useEffect(() => {
    if (isOpen && products.length > 0) {
      setSelectedId(products[0].id);
    }
  }, [isOpen, products]);

  const handleConfirm = () => {
    if (!selectedId) return;
    onConfirm(selectedId);
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={MESSAGES.class.selectProductTitle}
      footer={
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!selectedId}
          className="w-full h-12 rounded-xl bg-ice-500 hover:bg-ice-700 text-white font-bold text-base transition-colors disabled:bg-wline dark:disabled:bg-rink-700 disabled:text-wtext-3 disabled:cursor-not-allowed"
        >
          다음
        </button>
      }
    >
      <p className="text-sm text-wtext-3 dark:text-rink-300 mb-4">
        {MESSAGES.class.selectProductDescription}
      </p>
      <div role="radiogroup" aria-label={MESSAGES.class.selectProductTitle} className="flex flex-col gap-3">
        {products.map((product) => {
          const isSelected = selectedId === product.id;
          const meta = getFeeMeta(product.feeType);
          return (
            <label
              key={product.id}
              className={cn(
                'flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors',
                isSelected
                  ? 'border-ice-500 bg-ice-500/5 dark:bg-ice-500/10'
                  : 'border-wline dark:border-rink-700 bg-white dark:bg-rink-800 hover:border-ice-500/40',
              )}
            >
              <input
                type="radio"
                name="product"
                value={product.id}
                checked={isSelected}
                onChange={() => setSelectedId(product.id)}
                className="sr-only"
              />
              {/* 라디오 인디케이터 */}
              <div
                className={cn(
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                  isSelected
                    ? 'border-ice-500 bg-ice-500'
                    : 'border-wline dark:border-rink-700',
                )}
                aria-hidden="true"
              >
                {isSelected && <div className="w-2 h-2 bg-white rounded-full" />}
              </div>

              {/* 아이콘 */}
              <div
                className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                  isSelected
                    ? 'bg-ice-500/10 dark:bg-ice-500/20 text-ice-500'
                    : 'bg-wline-2 dark:bg-rink-700 text-wtext-3 dark:text-rink-300',
                )}
                aria-hidden="true"
              >
                <Icon name={meta.icon} className="text-xl" />
              </div>

              {/* 상품 정보 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={cn(
                    'text-card-meta font-bold px-1.5 py-0.5 rounded',
                    isSelected
                      ? 'bg-ice-500/10 text-ice-500'
                      : 'bg-wline-2 dark:bg-rink-700 text-wtext-3 dark:text-rink-300',
                  )}>
                    {meta.label}
                  </span>
                </div>
                <p className="text-sm font-bold text-wtext-1 dark:text-white truncate">
                  {product.productName}
                </p>
                <p className="text-xs text-wtext-3 dark:text-rink-300 mt-0.5 truncate">
                  {buildSummary(product)}
                </p>
              </div>

              {/* 가격 */}
              <div className="text-right shrink-0">
                <p className={cn(
                  'text-base font-bold tabular-nums',
                  isSelected ? 'text-ice-500' : 'text-wtext-1 dark:text-white',
                )}>
                  {formatPriceLabel(product)}
                </p>
              </div>
            </label>
          );
        })}
      </div>
    </BottomSheet>
  );
}

export default ProductSelectSheet;
