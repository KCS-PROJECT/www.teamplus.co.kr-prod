'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { NavLink, useNavigation } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { resolveImageSrc } from '@/lib/image-url';

const GlobalMenu = dynamic(() => import('@/components/layout/GlobalMenu').then(mod => ({ default: mod.GlobalMenu })), { ssr: false });

interface ClassFavoriteItem {
  id: string;
  title: string;
  subtitle?: string;
  academy: string;
  level: string;
  levelColor: string;
  time: string;
  location: string;
  price: number;
  rating: number;
  reviewCount: number;
  imageUrl?: string;
  status: 'recruiting' | 'closing_soon' | 'closed';
  addedAt: string;
}

const initialFavorites: ClassFavoriteItem[] = [
  {
    id: '1',
    title: '토요 유아 기초반',
    subtitle: '즐겁게 배우는 아이스하키 첫걸음',
    academy: 'ICE TIME ACADEMY',
    level: '입문',
    levelColor: 'bg-emerald-500',
    time: '토요일 09:00-10:30',
    location: '제1 아이스링크 A',
    price: 150000,
    rating: 4.9,
    reviewCount: 128,
    status: 'recruiting',
    addedAt: '2026-01-15',
  },
  {
    id: '2',
    title: '주말 초등 실전반',
    subtitle: '기본기를 탄탄하게, 실전 감각 UP',
    academy: 'ICE TIME ACADEMY',
    level: '실전',
    levelColor: 'bg-orange-500',
    time: '일요일 14:00-15:20',
    location: '제2 아이스링크',
    price: 180000,
    rating: 4.7,
    reviewCount: 85,
    status: 'closing_soon',
    addedAt: '2026-01-12',
  },
  {
    id: '3',
    title: '성인 취미 하키반',
    subtitle: '처음 시작하는 성인을 위한 클래스',
    academy: 'ICE TIME ACADEMY',
    level: '취미',
    levelColor: 'bg-purple-500',
    time: '수요일 20:00-21:30',
    location: '제1 아이스링크 B',
    price: 200000,
    rating: 4.8,
    reviewCount: 62,
    status: 'recruiting',
    addedAt: '2026-01-10',
  },
];

function FavoriteClassCard({
  item,
  isSelected,
  onSelect,
  onRemove,
}: {
  item: ClassFavoriteItem;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="p-4 bg-white dark:bg-rink-800 border-b border-wline-2 dark:border-rink-700 last:border-b-0">
      <div className="flex gap-3">
        {/* Checkbox */}
        <button type="button" onClick={onSelect} className="flex-shrink-0 mt-1">
          <div
            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors motion-reduce:transition-none ${
              isSelected
                ? 'bg-ice-500 border-ice-500'
                : 'border-wline dark:border-rink-700'
            }`}
          >
            {isSelected && <Icon name="check" className="text-white text-w-small" />}
          </div>
        </button>

        {/* Image */}
        <NavLink href={`/classes/${item.id}`} className="flex-shrink-0">
          <div className="w-20 h-20 bg-wline-2 dark:bg-rink-700 rounded-xl flex items-center justify-center overflow-hidden">
            {resolveImageSrc(item.imageUrl) ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={resolveImageSrc(item.imageUrl)}
                alt={item.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <Icon name="ice_skating" className="text-3xl text-wtext-3" />
            )}
          </div>
        </NavLink>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <NavLink href={`/classes/${item.id}`} className="flex-1 min-w-0">
              {/* Academy & Status */}
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] text-ice-500 font-semibold">
                  {item.academy}
                </span>
                {item.status === 'recruiting' && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                    모집중
                  </span>
                )}
                {item.status === 'closing_soon' && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
                    마감임박
                  </span>
                )}
                {item.status === 'closed' && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-wline-2 dark:bg-rink-700 text-wtext-3">
                    마감
                  </span>
                )}
              </div>
              {/* Title */}
              <h3 className="text-w-small font-bold text-wtext-1 dark:text-white line-clamp-1">
                {item.title}
              </h3>
            </NavLink>
            {/* Remove Button */}
            <button type="button"               onClick={onRemove}
              className="w-7 h-7 flex items-center justify-center rounded-w-pill hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none flex-shrink-0 -mr-1"
            >
              <Icon name="close" className="text-wtext-3 text-w-body-lg" />
            </button>
          </div>

          {/* Schedule & Location */}
          <div className="flex items-center gap-1 mt-1.5 text-w-caption text-wtext-3 dark:text-rink-300">
            <Icon name="schedule" className="text-[14px]" />
            <span className="truncate">{item.time}</span>
          </div>

          {/* Price & Rating */}
          <div className="flex items-center justify-between mt-2">
            <span className="text-w-small font-bold text-wtext-1 dark:text-white">
              {item.price.toLocaleString()}원
              <span className="text-[10px] font-normal text-wtext-3 ml-0.5">
                /월
              </span>
            </span>
            <div className="flex items-center gap-1">
              <Icon name="star" filled className="text-amber-400 text-[14px]" />
              <span className="text-w-caption font-semibold text-wtext-2 dark:text-rink-100">
                {item.rating}
              </span>
              <span className="text-[10px] text-wtext-3">
                ({item.reviewCount})
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ClassFavoritesPage() {
  // [appbar-harness-v2] 찜한 수업 — Status bar + AppBar 명시.
  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle: '찜한 수업',
    showBottomNav: false,
    showBackButton: true,
  });
  usePageReady(true); // 즉시 ready — 정적 mock 데이터 기반

  const { back } = useNavigation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [favorites, setFavorites] = useState<ClassFavoriteItem[]>(initialFavorites);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  const handleSelectAll = () => {
    if (selectedItems.length === favorites.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(favorites.map((item) => item.id));
    }
  };

  const handleSelectItem = (id: string) => {
    if (selectedItems.includes(id)) {
      setSelectedItems(selectedItems.filter((itemId) => itemId !== id));
    } else {
      setSelectedItems([...selectedItems, id]);
    }
  };

  const handleRemoveItem = (id: string) => {
    setFavorites(favorites.filter((item) => item.id !== id));
    setSelectedItems(selectedItems.filter((itemId) => itemId !== id));
  };

  const handleRemoveSelected = () => {
    if (selectedItems.length === 0) return;
    setFavorites(favorites.filter((item) => !selectedItems.includes(item.id)));
    setSelectedItems([]);
  };

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar title="찜한 수업" />

      {/* Selection Bar */}
      {favorites.length > 0 && (
        <div className="sticky top-14 z-10 flex items-center justify-between px-4 py-2 bg-wbg dark:bg-rink-800/50 border-b border-wline dark:border-rink-800">
          <button type="button"               onClick={handleSelectAll}
            className="flex items-center gap-2 text-w-small text-wtext-2 dark:text-rink-300"
          >
            <div
              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors motion-reduce:transition-none ${
                selectedItems.length === favorites.length
                  ? 'bg-ice-500 border-ice-500'
                  : 'border-wline dark:border-rink-700'
              }`}
            >
              {selectedItems.length === favorites.length && (
                <Icon name="check" className="text-white text-w-small" />
              )}
            </div>
            전체선택 ({selectedItems.length}/{favorites.length})
          </button>
          <button type="button"               onClick={handleRemoveSelected}
            className="text-w-small text-red-500 font-medium disabled:opacity-50"
            disabled={selectedItems.length === 0}
          >
            선택삭제
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {favorites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4">
            <div className="w-20 h-20 bg-wline-2 dark:bg-rink-800 rounded-w-pill flex items-center justify-center mb-4">
              <Icon name="favorite_border" className="text-4xl text-wtext-3" />
            </div>
            <h3 className="text-w-title font-semibold text-wtext-1 dark:text-white mb-2">
              찜한 수업이 없습니다
            </h3>
            <p className="text-wtext-3 dark:text-rink-300 text-center mb-6">
              관심 있는 수업을 찜해보세요
            </p>
            <NavLink href="/classes">
              <Button variant="primary">수업 둘러보기</Button>
            </NavLink>
          </div>
        ) : (
          <div className="bg-white dark:bg-rink-800">
            {favorites.map((item) => (
              <FavoriteClassCard
                key={item.id}
                item={item}
                isSelected={selectedItems.includes(item.id)}
                onSelect={() => handleSelectItem(item.id)}
                onRemove={() => handleRemoveItem(item.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom Action Bar */}
      {favorites.length > 0 && selectedItems.length > 0 && (
        <div className="sticky bottom-0 bg-white dark:bg-rink-900 border-t border-wline dark:border-rink-800 px-4 py-3 pb-safe">
          <NavLink
            href="/payment/select"
            className="w-full flex items-center justify-center gap-2 bg-ice-500 hover:bg-ice-500/90 text-white font-bold py-3.5 rounded-xl shadow-md active:brightness-95 transition-all motion-reduce:transition-none"
          >
            <span>선택 수업 신청하기 ({selectedItems.length})</span>
            <Icon name="arrow_forward" className="text-w-title" />
          </NavLink>
        </div>
      )}
      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </MobileContainer>
  );
}
