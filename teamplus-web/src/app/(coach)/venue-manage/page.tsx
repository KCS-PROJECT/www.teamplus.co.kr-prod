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

      <main className="flex-1 overflow-y-auto">
        {/* 상단 서브타이틀 */}
        <div className="px-5 pt-5 pb-3">
          <p className="text-card-body font-semibold text-wtext-3 dark:text-rink-300">
            {subtitle}
          </p>
        </div>

        {/* 검색 */}
        <div className="px-5 pb-5">
          <label htmlFor="venue-manage-search" className="sr-only">
            {MESSAGES.venue.searchPlaceholder}
          </label>
          <div className="relative">
            <Icon
              name="search"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-wtext-3 text-[20px]"
              aria-hidden="true"
            />
            <input
              id="venue-manage-search"
              type="search"
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={MESSAGES.venue.searchPlaceholder}
              className="w-full bg-white dark:bg-rink-800 rounded-xl pl-10 pr-4 py-3 text-card-body text-wtext-1 dark:text-white placeholder-wtext-3 shadow-sm border border-wline dark:border-rink-700 focus:outline-none focus:ring-2 focus:ring-ice-500"
            />
          </div>
        </div>

        {/* 에러 */}
        {error ? (
          <div className="mx-5 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-4 mb-4 text-card-body text-red-700 dark:text-red-300 flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={refresh}
              className="text-card-meta font-bold underline"
            >
              {MESSAGES.venue.retry}
            </button>
          </div>
        ) : null}

        {/* 목록 */}
        <div className="px-5 pb-6" aria-busy={isLoading}>
          {isLoading ? (
            <div
              className="py-16 flex items-center justify-center text-wtext-3 text-card-body"
              role="status"
              aria-live="polite"
            >
              {MESSAGES.venue.loading}
            </div>
          ) : venues.length === 0 ? (
            <div
              className="py-16 flex flex-col items-center justify-center text-wtext-3"
              role="status"
            >
              <Icon name="stadium" className="text-[48px] mb-2" aria-hidden="true" />
              <p className="text-card-body mb-3">{MESSAGES.venue.empty}</p>
              {permissions.canCreate ? (
                <button
                  type="button"
                  onClick={openCreate}
                  className="text-card-meta font-bold text-ice-500 dark:text-blue-300 underline focus-visible:ring-2 focus-visible:ring-ice-500 focus:outline-none rounded"
                >
                  {MESSAGES.venue.manage.addButton}
                </button>
              ) : null}
            </div>
          ) : (
            <ul
              className="space-y-3 list-none"
              role="list"
              aria-label={`구장 ${venues.length}건`}
            >
              {venues.map((venue) => (
              <li key={venue.id} role="listitem">
              <button
                type="button"
                onClick={() => openEdit(venue)}
                aria-label={`${venue.name} 구장 편집하기, ${venue.address ?? MESSAGES.venue.noAddress}`}
                className="w-full bg-white dark:bg-rink-800 rounded-xl shadow-md border border-wline-2 dark:border-rink-700 p-4 flex items-center gap-4 text-left hover:shadow-md transition-shadow active:bg-wbg dark:active:bg-rink-700 focus-visible:ring-2 focus-visible:ring-ice-500 focus:outline-none"
              >
                <div className="relative h-16 w-16 rounded-lg bg-wline-2 dark:bg-rink-700 shrink-0 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolveImageSrc(venue.imageUrl) ?? FALLBACK_THUMB}
                    alt={`${venue.name} 섬네일`}
                    className="absolute inset-0 size-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="text-card-emphasis font-bold text-wtext-1 dark:text-white truncate">
                      {venue.name}
                    </h3>
                    <VenueStatusBadge status={venue.status} size="sm" />
                  </div>
                  <p className="text-card-body text-wtext-3 dark:text-rink-300 truncate">
                    {venue.address ?? MESSAGES.venue.noAddress}
                  </p>
                </div>
                <Icon
                  name="chevron_right"
                  className="text-wtext-4 dark:text-rink-300 text-[22px]"
                  aria-hidden="true"
                />
              </button>
              </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      {/* FAB — 구장 등록 */}
      {permissions.canCreate && (
        <button
          type="button"
          onClick={openCreate}
          className="fixed right-5 bottom-24 z-10 flex items-center justify-center w-14 h-14 rounded-w-pill bg-ice-500 text-white shadow-lg hover:bg-ice-700 active:scale-95 transition-all"
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
      />
    </MobileContainer>
  );
}
