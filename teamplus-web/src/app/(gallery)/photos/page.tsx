'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNavigation } from '@/components/ui/NavLink';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { PhotoTile } from '@/components/shared/PhotoTile';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';

import { usePageReady } from '@/hooks/usePageReady';
import { useDefaultUI } from '@/hooks/useNativeUI';
type TabType = 'all' | 'class' | 'match';

interface Photo {
  id: string;
  src: string;
  alt: string;
  date: string;
  takenAt: Date;
  category: 'class' | 'match';
}

interface MonthGroup {
  month: string;
  year: number;
  monthNum: number;
  photos: Photo[];
}

/** 월별로 사진 그룹화 */
function groupPhotosByMonth(photos: Photo[]): MonthGroup[] {
  const groups: Map<string, MonthGroup> = new Map();

  photos.forEach((photo) => {
    const [year, month] = photo.date.split('.').slice(0, 2);
    const key = `${year}-${month}`;

    if (!groups.has(key)) {
      groups.set(key, {
        month: `${year}년 ${parseInt(month)}월`,
        year: parseInt(year),
        monthNum: parseInt(month),
        photos: [],
      });
    }
    groups.get(key)?.photos.push(photo);
  });

  return Array.from(groups.values()).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.monthNum - a.monthNum;
  });
}

const FILTER_TABS: { key: TabType; label: string }[] = [
  { key: 'all', label: MESSAGES.gallery.tabAll },
  { key: 'class', label: MESSAGES.gallery.tabClass },
  { key: 'match', label: MESSAGES.gallery.tabMatch },
];

// 카테고리별 accent dot (summary·선택 인디케이터)
const CATEGORY_DOT: Record<'class' | 'match', string> = {
  class: 'bg-blue-500',
  match: 'bg-rose-500',
};

export default function PhotoGalleryPage() {
  const { toast } = useToast();
  const { navigate } = useNavigation();
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  // [2026-05-13 이슈 D11] Flutter Native AppBar 끄고 Web PageAppBar(forceNative) 단일 노출.
  useDefaultUI();

  useEffect(() => {
    const load = async () => {
      try {
      const res = await api.get<
        | { data?: { id: string; imageUrl?: string; src?: string; alt?: string; caption?: string; createdAt?: string; category?: string }[] }
        | { id: string; imageUrl?: string; src?: string; alt?: string; caption?: string; createdAt?: string; category?: string }[]
      >('/gallery/photos');
      if (res.success && res.data) {
        const raw = Array.isArray(res.data)
          ? res.data
          : (res.data as { data?: unknown[] }).data ?? [];
        setPhotos(
          (raw as { id: string; imageUrl?: string; src?: string; alt?: string; caption?: string; createdAt?: string; category?: string }[]).map((p) => {
            const dt = p.createdAt ? new Date(p.createdAt) : new Date();
            return {
              id: p.id,
              src: p.imageUrl ?? p.src ?? '',
              alt: p.alt ?? p.caption ?? '',
              date: `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`,
              takenAt: dt,
              category: (p.category === 'match' ? 'match' : 'class') as Photo['category'],
            };
          })
        );
      }
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, []);

  const filteredPhotos = photos.filter((photo) => {
    if (activeTab === 'all') return true;
    return photo.category === activeTab;
  });

  const monthGroups = groupPhotosByMonth(filteredPhotos);

  const handlePhotoToggle = (id: string) => {
    if (!isSelectMode) {
      // 뷰어 진입
      const photo = photos.find((p) => p.id === id);
      if (photo) navigate(`/photos/${id}`);
      return;
    }
    setSelectedPhotos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectMode = () => {
    if (isSelectMode) setSelectedPhotos(new Set());
    setIsSelectMode(!isSelectMode);
  };

  const handleDownloadSelected = useCallback(async () => {
    const photosToDownload = photos.filter((p) => selectedPhotos.has(p.id));
    if (photosToDownload.length === 0) return;

    toast.success(MESSAGES.gallery.downloadStart(photosToDownload.length));

    for (const photo of photosToDownload) {
      try {
        const response = await fetch(photo.src, { mode: 'cors' });
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `photo-${photo.id}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      } catch {
        window.open(photo.src, '_blank');
      }
    }
  }, [photos, selectedPhotos, toast]);

  // 카테고리별 카운트 (summary stats + filter tab counts)
  const classCount = photos.filter(p => p.category === 'class').length;
  const matchCount = photos.filter(p => p.category === 'match').length;
  const counts: Record<TabType, number> = {
    all: photos.length,
    class: classCount,
    match: matchCount,
  };

  return (
    <MobileContainer hasBottomNav={true}>
      {/* [2026-05-13 이슈 D11] forceNative — App/Web 동일 AppBar 노출. useDefaultUI 가 Flutter AppBar 끔. */}
      <PageAppBar title="포토 갤러리" forceNative />

      {/* Body — 에디토리얼 아카이브 */}
      <main
        className="flex-1 overflow-y-auto hide-scrollbar relative"
        role="main"
        aria-label="포토 갤러리"
      >
        {isLoading ? null : photos.length > 0 ? (
          <>
            {/* ─── Summary stats — hero number ─── */}
            <section className="px-4 pt-6 pb-5" aria-label="갤러리 요약">
              <div className="flex items-baseline gap-1.5">
                <span className="text-w-display font-bold tracking-[-0.03em] tabular-nums leading-none text-wtext-1 dark:text-white">
                  {photos.length}
                </span>
                <span className="text-card-body font-medium text-wtext-3 dark:text-rink-300 tracking-tight">
                  장의 기록
                </span>
              </div>
              <div className="mt-3 flex items-center gap-3 text-card-meta text-wtext-3 dark:text-rink-300">
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <span className={cn('w-1.5 h-1.5 rounded-w-pill', CATEGORY_DOT.class)} aria-hidden="true" />
                  <span className="font-medium">수업</span>
                  <span className="font-bold text-wtext-2 dark:text-rink-100">{classCount}</span>
                </span>
                <span className="text-wtext-4 dark:text-wtext-2 select-none" aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <span className={cn('w-1.5 h-1.5 rounded-w-pill', CATEGORY_DOT.match)} aria-hidden="true" />
                  <span className="font-medium">경기</span>
                  <span className="font-bold text-wtext-2 dark:text-rink-100">{matchCount}</span>
                </span>
              </div>
            </section>

            {/* ─── Filter tabs — 인라인 에디토리얼 underline (sticky) ─── */}
            <nav
              className="sticky top-0 z-20 px-4 flex items-center gap-6 h-11 bg-wbg dark:bg-rink-900 border-b border-wline dark:border-rink-800"
              role="tablist"
              aria-label="갤러리 필터"
            >
              {FILTER_TABS.map((tab) => {
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      'relative inline-flex items-baseline gap-1.5 h-full text-card-body font-semibold whitespace-nowrap transition-colors motion-reduce:transition-none focus:outline-none focus-visible:text-ice-500 dark:focus-visible:text-blue-400',
                      active
                        ? 'text-wtext-1 dark:text-white'
                        : 'text-wtext-3 dark:text-rink-300 hover:text-wtext-2 dark:hover:text-rink-100',
                    )}
                  >
                    <span className="tracking-tight">{tab.label}</span>
                    <span
                      className={cn(
                        'text-card-meta font-bold tabular-nums tracking-tight',
                        active ? 'text-ice-500 dark:text-blue-400' : 'text-wtext-3 dark:text-rink-300',
                      )}
                    >
                      {counts[tab.key]}
                    </span>
                    {active && (
                      <span
                        className="absolute inset-x-0 -bottom-px h-[2px] bg-ice-500 dark:bg-blue-400 rounded-w-pill"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </nav>

            {/* ─── Month groups — 아카이브 스타일 ─── */}
            {monthGroups.length > 0 ? (
              <div className="pt-2">
                {monthGroups.map((group) => (
                  <section key={group.month} className="mb-6 last:mb-0" aria-label={group.month}>
                    {/* Month header — "04 · 2026" archive marker */}
                    <header className="flex items-end justify-between gap-3 px-4 pt-4 pb-3">
                      <div className="flex items-baseline gap-2">
                        <span className="text-w-h2 font-bold tracking-[-0.03em] tabular-nums leading-none text-wtext-1 dark:text-white">
                          {String(group.monthNum).padStart(2, '0')}
                        </span>
                        <span className="text-wtext-4 dark:text-wtext-2 select-none text-card-meta" aria-hidden="true">·</span>
                        <span className="text-card-meta font-semibold text-wtext-3 dark:text-rink-300 tracking-[0.14em] uppercase">
                          {group.year}
                        </span>
                      </div>
                      <span className="text-card-meta font-medium text-wtext-3 dark:text-rink-300 tabular-nums tracking-tight">
                        {MESSAGES.gallery.photoCountLabel(group.photos.length)}
                      </span>
                    </header>

                    {/* 3-col grid — 4px gap for curated breathing */}
                    <div className="grid grid-cols-3 gap-1">
                      {group.photos.map((photo) => (
                        <PhotoTile
                          key={photo.id}
                          photoUrl={photo.src}
                          caption={photo.alt}
                          takenAt={photo.takenAt}
                          selectable={isSelectMode}
                          selected={selectedPhotos.has(photo.id)}
                          onToggleSelect={() => handlePhotoToggle(photo.id)}
                          onClick={() => handlePhotoToggle(photo.id)}
                          className="rounded-none"
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              // 필터 결과만 empty (전체는 photos.length > 0)
              <div className="flex flex-col items-center justify-center py-20 px-5 text-center">
                <Icon
                  name="filter_alt_off"
                  className="text-[38px] text-wtext-4 dark:text-wtext-2 mb-4"
                  aria-hidden="true"
                />
                <p className="text-card-body font-semibold text-wtext-2 dark:text-rink-100 tracking-tight mb-1">
                  해당 분류의 사진이 없습니다
                </p>
                <p className="text-card-meta text-wtext-3 dark:text-rink-300">
                  다른 탭을 선택해 보세요
                </p>
              </div>
            )}
          </>
        ) : (
          // 전체 empty state — 절제된 타이포그래피
          <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
            <Icon
              name="photo_library"
              className="text-[44px] text-wtext-4 dark:text-wtext-2 mb-5"
              aria-hidden="true"
            />
            <h2 className="text-card-title font-bold text-wtext-2 dark:text-rink-100 tracking-tight mb-2">
              {MESSAGES.gallery.emptyPhotos}
            </h2>
            <p className="text-card-meta text-wtext-3 dark:text-rink-300 leading-[1.6] max-w-[260px]">
              수업과 경기 순간이 쌓이면
              <br />
              이곳에 월별로 정리됩니다
            </p>
          </div>
        )}

        {/* BottomNav 여백 */}
        <div className="h-24" />
      </main>

      {/* Selection Action Bar — [2026-05-13 이슈 D12] FAB 위로 위치 조정.
          기존 `bottom-[104px]` (104px 고정) → iOS 환경(safe-area-inset-bottom~34px)에서 BottomNav 와
          시각적으로 겹쳐 보이는 회귀. 정합: calc(BottomNav 72 + gap 16 + FAB 56 + gap 8 + safe-area). */}
      {isSelectMode && selectedPhotos.size > 0 && (
        <div
          className="fixed left-0 right-0 px-4 z-40"
          style={{
            bottom:
              'calc(72px + 16px + 56px + 8px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))',
          }}
        >
          <div className="bg-white dark:bg-rink-800 rounded-xl shadow-md border border-wline dark:border-rink-700 p-4">
            <div className="flex items-center justify-between">
              <span className="text-card-body font-medium text-wtext-2 dark:text-rink-100">
                {MESSAGES.chat.selectedCount(selectedPhotos.size)}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDownloadSelected}
                  className="px-4 py-2 bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 rounded-lg text-card-body font-medium hover:bg-wline dark:hover:bg-rink-500 transition-colors motion-reduce:transition-none flex items-center"
                >
                  <Icon name="download" className="text-card-title mr-1" aria-hidden="true" />
                  {MESSAGES.gallery.saveLabel}
                </button>
                <button
                  type="button"
                  className="px-4 py-2 bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 rounded-lg text-card-body font-medium hover:bg-wline dark:hover:bg-rink-500 transition-colors motion-reduce:transition-none flex items-center"
                >
                  <Icon name="share" className="text-card-title mr-1" aria-hidden="true" />
                  {MESSAGES.gallery.shareLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FAB — 선택 모드 진입/취소 (상태별 색상·아이콘 전환).
          [2026-05-13 이슈 D12] 위치 정합 — gift 페이지와 동일한 calc 식 사용.
          기존 `bottom-24` (96px 고정) → iOS safe-area=34px 환경에서 BottomNav 와 거리감 부족.
          정합: calc(72 + 16 + safe-area) = 88px + safe-area. */}
      <button
        type="button"
        onClick={toggleSelectMode}
        className={cn(
          'fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-w-pill shadow-md transition-colors active:brightness-95 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900',
          isSelectMode
            ? 'bg-rink-800 hover:bg-rink-900 text-white focus-visible:ring-ice-500/30 dark:bg-rink-700 dark:hover:bg-rink-500'
            : 'bg-ice-500 hover:bg-ice-700 text-white focus-visible:ring-ice-500'
        )}
        style={{
          bottom:
            'calc(72px + 16px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))',
        }}
        aria-label={isSelectMode ? MESSAGES.gallery.cancelMode : MESSAGES.gallery.selectMode}
        aria-pressed={isSelectMode}
      >
        <Icon
          name={isSelectMode ? 'close' : 'check_box'}
          className="text-[26px]"
          aria-hidden="true"
        />
      </button>

    </MobileContainer>
  );
}
