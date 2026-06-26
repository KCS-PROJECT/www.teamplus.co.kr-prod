'use client';

/**
 * /venue-manage — 구장 관리 페이지 (ADMIN / DIRECTOR / COACH / ACADEMY_DIRECTOR)
 *
 * 목업 기반 (구장 관리 및 설정 (웹)):
 *  - 헤더: 구장 관리 + 등록된 구장 {n}개 + 등록 버튼
 *  - 검색 입력
 *  - 목록 (섬네일 + 이름 + 상태 배지 + 주소)
 *  - 편집 바텀시트(VenueFormSheet) → 등록/수정/삭제
 *
 * 위치 선택 이유:
 *    단일 호출로 보장 → layout ↔ page 훅 중복 회피
 *  - 기존 `(admin)/venue-manage` 는 admin 단독 제한이라 요구사항과 충돌하므로 제거
 */

import { useCallback, useMemo, useState } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import {
  useVenues,
  useVenuePermissions,
  useVenueMutations,
} from '@/hooks/useVenues';
import { venueService } from '@/services/venueService';
import { VenueFormSheet, VenueStatusBadge } from '@/components/venue';
import type { Venue, VenuePayload } from '@/types/venue';
import type { VenueUploadResult } from '@/components/venue/VenueFormSheet';
import { resolveImageSrc } from '@/lib/image-url';

const FALLBACK_THUMB =
  'https://images.unsplash.com/photo-1515703407324-5f753afd8be8?w=200&h=200&fit=crop';

export default function VenueManagePage() {
  // [AppBar 보장 2026-05-12] iPhone/Android 실기/시뮬에서 AppBar safe-area 가
  //   항상 보이도록 Native AppBar 활성. Web 환경에서는 DOM PageAppBar 가 자동 표시.
  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle: MESSAGES.venue.manageTitle,
    showBackButton: true,
    showBottomNav: true,
  });

  const { venues, isLoading, error, refresh, setParams } = useVenues({ limit: 30 });
  const permissions = useVenuePermissions();

  usePageReady(!isLoading);

  const [searchTerm, setSearchTerm] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<'create' | 'edit'>('create');
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const mutations = useVenueMutations(refresh);

  const totalCount = venues.length;

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchTerm(value);
      setParams((prev) => ({ ...prev, search: value || undefined, page: 1 }));
    },
    [setParams],
  );

  const openCreate = useCallback(() => {
    setSheetMode('create');
    setEditingVenue(null);
    setSaveError(null);
    setSheetOpen(true);
  }, []);

  const openEdit = useCallback((venue: Venue) => {
    setSheetMode('edit');
    setEditingVenue(venue);
    setSaveError(null);
    setSheetOpen(true);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setEditingVenue(null);
    setSaveError(null);
  }, []);

  const handleSave = useCallback(
    async (payload: VenuePayload) => {
      setSaveError(null);
      if (sheetMode === 'create') {
        const result = await mutations.createVenue(payload);
        if (result.ok) {
          if (typeof window !== 'undefined') {
            window.alert(MESSAGES.venue.result.created);
          }
          closeSheet();
        } else {
          setSaveError(result.message);
        }
      } else if (editingVenue) {
        const result = await mutations.updateVenue(editingVenue.id, payload);
        if (result.ok) {
          if (typeof window !== 'undefined') {
            window.alert(MESSAGES.venue.result.updated);
          }
          closeSheet();
        } else {
          setSaveError(result.message);
        }
      }
    },
    [sheetMode, editingVenue, mutations, closeSheet],
  );

  const handleDelete = useCallback(async () => {
    if (!editingVenue) return;
    const result = await mutations.deleteVenue(editingVenue.id);
    if (result.ok) {
      if (typeof window !== 'undefined') {
        window.alert(MESSAGES.venue.result.deleted);
      }
      closeSheet();
    } else {
      setSaveError(result.message);
    }
  }, [editingVenue, mutations, closeSheet]);

  /**
   * 이미지 업로드 핸들러 (edit 모드 전용)
   * - create 모드에서는 구장 ID 가 없으므로 선제 저장을 먼저 안내
   */
  const handleUploadImage = useCallback(
    async (file: File): Promise<VenueUploadResult> => {
      if (!editingVenue) {
        return {
          ok: false,
          message: MESSAGES.venue.result.imageUploadRequiresSave,
        };
      }
      const response = await venueService.uploadImage(editingVenue.id, file);
      if (response.success && response.data) {
        // 목록 최신화 + 수정 중인 venue 객체도 최신 imageUrl 로 갱신
        refresh();
        setEditingVenue((prev) =>
          prev ? { ...prev, imageUrl: response.data?.imageUrl ?? prev.imageUrl } : prev,
        );
        return { ok: true, imageUrl: response.data.imageUrl ?? undefined };
      }
      return {
        ok: false,
        message:
          response.error?.message ?? MESSAGES.venue.result.imageUploadError,
      };
    },
    [editingVenue, refresh],
  );

  const subtitle = useMemo(
    () => MESSAGES.venue.manage.totalCount(totalCount),
    [totalCount],
  );

  return (
    <MobileContainer hasBottomNav={true}>
      <PageAppBar title={MESSAGES.venue.manageTitle} />

      <main
        className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck hide-scrollbar !pb-8"
        role="main"
        aria-label={MESSAGES.venue.manageTitle}
      >
        {/* 검색 — flat 흰 섹션 (서브타이틀 + 입력) */}
        <section className="bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-4" aria-label="구장 검색">
          <p className="mb-3 text-card-body font-semibold text-it-ink-500 dark:text-wtext-4">
            {subtitle}
          </p>
          <label htmlFor="venue-manage-search" className="sr-only">
            {MESSAGES.venue.searchPlaceholder}
          </label>
          <div className="relative">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-it-ink-400 dark:text-wtext-4 text-[20px]"
              aria-hidden="true"
            />
            <input
              id="venue-manage-search"
              type="search"
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={MESSAGES.venue.searchPlaceholder}
              className="w-full h-12 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-800 pl-11 pr-4 text-[15px] font-semibold text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-wtext-3 outline-none transition-colors duration-150 ease-ios motion-reduce:transition-none focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20"
            />
          </div>
        </section>

        {/* 에러 */}
        {error ? (
          <>
            <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
            <section className="bg-it-surface dark:bg-it-blue-950 px-5 py-4">
              <div className="flex items-center justify-between gap-2 rounded-w-md bg-it-red-500/10 border-[1.5px] border-it-red-500/30 p-3.5 text-card-body text-it-red-500">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={refresh}
                  className="shrink-0 text-card-meta font-bold underline underline-offset-2"
                >
                  {MESSAGES.venue.retry}
                </button>
              </div>
            </section>
          </>
        ) : null}

        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 목록 — flat 흰 섹션 (hairline 행) */}
        <section className="bg-it-surface dark:bg-it-blue-950 px-5 pt-2 pb-7" aria-busy={isLoading} aria-label="구장 목록">
          {isLoading ? null : venues.length === 0 ? (
            <div
              className="py-16 flex flex-col items-center justify-center"
              role="status"
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-w-pill bg-it-fill dark:bg-rink-700">
                <Icon name="stadium" className="text-[28px] text-it-ink-400 dark:text-wtext-4" aria-hidden="true" />
              </div>
              <p className="text-card-body font-medium text-it-ink-700 dark:text-wtext-4 mb-3">
                {MESSAGES.venue.empty}
              </p>
              {permissions.canCreate ? (
                <button
                  type="button"
                  onClick={openCreate}
                  className="text-card-meta font-bold text-it-blue-500 transition-colors motion-reduce:transition-none hover:text-it-blue-600 underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-it-blue-500 focus:outline-none rounded"
                >
                  {MESSAGES.venue.manage.addButton}
                </button>
              ) : null}
            </div>
          ) : (
            <ul
              className="flex flex-col list-none"
              role="list"
              aria-label={`구장 ${venues.length}건`}
            >
              {venues.map((venue, idx) => {
                const isLast = idx === venues.length - 1;
                return (
                  <li key={venue.id} role="listitem">
                    <button
                      type="button"
                      onClick={() => openEdit(venue)}
                      aria-label={`${venue.name} 구장 편집하기, ${venue.address ?? MESSAGES.venue.noAddress}`}
                      style={{ animationDelay: `${Math.min(idx * 40, 280)}ms` }}
                      className={cn(
                        'w-full py-[14px] flex items-center gap-4 text-left transition-colors duration-150 ease-ios motion-reduce:transition-none active:brightness-95 focus-visible:ring-2 focus-visible:ring-it-blue-500 focus:outline-none',
                        !isLast && 'border-b border-it-line dark:border-rink-700',
                      )}
                    >
                      <div className="relative h-16 w-16 rounded-w-md bg-it-line dark:bg-rink-700 shrink-0 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={resolveImageSrc(venue.imageUrl) ?? FALLBACK_THUMB}
                          alt={`${venue.name} 섬네일`}
                          className="absolute inset-0 size-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <h3 className="text-[15.5px] font-bold tracking-[-0.01em] text-it-ink-800 dark:text-white truncate">
                            {venue.name}
                          </h3>
                          <VenueStatusBadge status={venue.status} size="sm" iceTheme />
                        </div>
                        <p className="text-card-body text-it-ink-500 dark:text-wtext-4 truncate">
                          {venue.address ?? MESSAGES.venue.noAddress}
                        </p>
                      </div>
                      <Icon
                        name="chevron_right"
                        className="text-it-ink-400 dark:text-wtext-4 text-[22px] shrink-0"
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      {/* FAB — 구장 등록 */}
      {permissions.canCreate && (
        <button
          type="button"
          onClick={openCreate}
          className="fixed right-5 bottom-24 z-10 flex items-center justify-center w-14 h-14 rounded-w-pill bg-it-blue-500 text-white shadow-lg hover:bg-it-blue-600 active:scale-95 transition-all motion-reduce:transition-none"
          aria-label={MESSAGES.venue.manage.addButton}
        >
          <Icon name="add" className="text-[28px]" aria-hidden="true" />
        </button>
      )}

      {/* 바텀시트 */}
      <VenueFormSheet
        open={sheetOpen}
        mode={sheetMode}
        initial={editingVenue}
        isSaving={mutations.isSaving}
        error={saveError ?? mutations.mutationError}
        onClose={closeSheet}
        onSave={handleSave}
        onDelete={permissions.canDelete ? handleDelete : undefined}
        canDelete={permissions.canDelete}
        onUploadImage={sheetMode === 'edit' ? handleUploadImage : undefined}
        iceTheme
      />
    </MobileContainer>
  );
}
