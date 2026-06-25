'use client';

/**
 * Task #26 C-4 — 수상 이력 등록 페이지 (PARENT)
 *
 * Backend:
 *   POST /api/v1/awards/player       (ADMIN/DIRECTOR/COACH/PARENT)
 *   POST /api/v1/files/upload        (multipart; category=IMAGE|DOCUMENT)
 *
 * 플로우:
 *   1) 자녀 선택 (팀 승인된 자녀만 허용 — memberId = TeamMember.id 필요)
 *   2) 수상 정보 입력
 *   3) 사진 업로드(선택) → 상장 업로드(선택) → POST /awards/player
 *   4) 성공 시 /awards 목록으로 이동
 */

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { useChildren } from '@/hooks/useChildren';
import { useAwardMutations } from '@/hooks/useAwards';
import { uploadFile, UploadValidationError, UploadNetworkError } from '@/services/upload.service';
import { AWARD_TYPES, type AwardType } from '@/types/awards';
import { MESSAGES } from '@/lib/messages';
import { resolveImageSrc } from '@/lib/image-url';

type FormState = {
  memberId: string;
  awardName: string;
  awardType: AwardType;
  awardedAt: string;
  description: string;
  season: string;
  awardedBy: string;
};

/** 입력 필드 공통 스타일 (ICETIMES — it-fill + 1.5px it-line-strong + it-blue 포커스) */
const INPUT_CLASS =
  'w-full rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-800 px-3.5 py-3 text-[15px] font-medium text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-wtext-3 outline-none transition-colors duration-150 ease-ios motion-reduce:transition-none focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20 disabled:opacity-60';

/** 라벨 공통 스타일 (ICETIMES — it-ink-800 bold) */
const LABEL_CLASS = 'mb-1.5 block text-card-body font-bold text-it-ink-800 dark:text-white';

function todayIsoDate(): string {
  return new Date().toISOString().split('T')[0];
}

export default function AwardCreatePage() {
  // [Task #7 / 2026-05-14] App 상단바 미표시 회귀 해소.
  //   원인: showAppBar:false + <PageAppBar/> (forceNative 없음) → PageAppBar.tsx:234
  //         `if (isNative && !forceNative) return null` 로 Native 에서 헤더가 사라짐.
  //         Flutter Shell AppBar 도 꺼져 있으니 이중-부재 → 뒤로가기 동선 차단.
  //   조치: useNativeUI showAppBar:false 유지(이중 헤더 방지) + <PageAppBar forceNative/>
  //         단일 노출 패턴 (review · checkout · stickers 와 동일 표준).
  //         BottomNav 는 (parent) 레이아웃의 ParentBottomNav 가 그리므로 Web 은 표시 유지.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
    isDataLoaded: true,
  });

  const router = useRouter();
  const searchParams = useSearchParams();
  const presetChildId = searchParams.get('childId') ?? '';

  const { toast } = useToast();
  const { children, isLoading: isChildrenLoading } = useChildren();
  const { createAward, isSubmitting } = useAwardMutations();

  usePageReady(!isChildrenLoading);

  // 팀에 승인된 자녀만 수상 이력 등록 가능 (memberId 필수)
  const eligibleChildren = useMemo(
    () => children.filter((c) => !!c.memberId),
    [children],
  );

  const childSelectId = useId();
  const awardNameId = useId();
  const awardTypeId = useId();
  const awardedAtId = useId();
  const descriptionId = useId();
  const seasonId = useId();
  const awardedById = useId();

  const [form, setForm] = useState<FormState>({
    memberId: '',
    awardName: '',
    awardType: 'special',
    awardedAt: todayIsoDate(),
    description: '',
    season: '',
    awardedBy: '',
  });

  // 파일 업로드 상태
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageProgress, setImageProgress] = useState(0);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const [certFile, setCertFile] = useState<File | null>(null);
  const [certProgress, setCertProgress] = useState(0);
  const [isUploadingCert, setIsUploadingCert] = useState(false);

  // 초기 자녀 선택 (presetChildId → 첫 번째 eligibleChild)
  useEffect(() => {
    if (form.memberId) return;
    if (eligibleChildren.length === 0) return;

    if (presetChildId) {
      const preset = eligibleChildren.find((c) => c.id === presetChildId);
      if (preset?.memberId) {
        setForm((prev) => ({ ...prev, memberId: preset.memberId! }));
        return;
      }
    }

    const first = eligibleChildren[0];
    if (first.memberId) {
      setForm((prev) => ({ ...prev, memberId: first.memberId! }));
    }
  }, [eligibleChildren, presetChildId, form.memberId]);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setImageProgress(0);
  }, []);

  const handleCertSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCertFile(file);
    setCertProgress(0);
  }, []);

  const removeImage = useCallback(() => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
    setImageProgress(0);
  }, [imagePreview]);

  const removeCert = useCallback(() => {
    setCertFile(null);
    setCertProgress(0);
  }, []);

  // cleanup object URL
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // 필수 검증
      if (!form.memberId) {
        toast.warning(MESSAGES.awards.childRequired);
        return;
      }
      if (!form.awardName.trim()) {
        toast.warning(MESSAGES.awards.nameRequired);
        return;
      }
      if (!form.awardedAt) {
        toast.warning(MESSAGES.awards.dateRequired);
        return;
      }

      // 1) 이미지 업로드 (있을 경우)
      let imageUrl: string | undefined;
      if (imageFile) {
        try {
          setIsUploadingImage(true);
          const uploaded = await uploadFile(imageFile, {
            category: 'IMAGE',
            refType: 'player_award',
            onProgress: ({ percent }) => setImageProgress(percent),
          });
          imageUrl = uploaded.url;
        } catch (err) {
          const msg =
            err instanceof UploadValidationError || err instanceof UploadNetworkError
              ? err.message
              : MESSAGES.awards.uploadImageError;
          toast.error(msg);
          setIsUploadingImage(false);
          return;
        } finally {
          setIsUploadingImage(false);
        }
      }

      // 2) 상장 업로드 (있을 경우)
      let certificateUrl: string | undefined;
      if (certFile) {
        try {
          setIsUploadingCert(true);
          const isImage = certFile.type.startsWith('image/');
          const uploaded = await uploadFile(certFile, {
            category: isImage ? 'IMAGE' : 'DOCUMENT',
            refType: 'player_award',
            onProgress: ({ percent }) => setCertProgress(percent),
          });
          certificateUrl = uploaded.url;
        } catch (err) {
          const msg =
            err instanceof UploadValidationError || err instanceof UploadNetworkError
              ? err.message
              : MESSAGES.awards.uploadCertError;
          toast.error(msg);
          setIsUploadingCert(false);
          return;
        } finally {
          setIsUploadingCert(false);
        }
      }

      // 3) 수상 이력 생성
      const created = await createAward({
        memberId: form.memberId,
        awardName: form.awardName.trim(),
        awardType: form.awardType,
        awardedAt: form.awardedAt,
        description: form.description.trim() || undefined,
        season: form.season.trim() || undefined,
        awardedBy: form.awardedBy.trim() || undefined,
        imageUrl,
        certificateUrl,
      });

      if (!created) {
        toast.error(MESSAGES.awards.createError);
        return;
      }

      toast.success(MESSAGES.awards.created);
      router.replace('/awards');
    },
    [form, imageFile, certFile, createAward, router, toast],
  );

  const isBusy = isSubmitting || isUploadingImage || isUploadingCert;
  const hasEligibleChildren = eligibleChildren.length > 0;

  return (
    <MobileContainer hasBottomNav>
      {/* [Task #7 / 2026-05-14] forceNative — Native WebView 에서도 Web 헤더가 노출되어 뒤로가기 동선 보존. */}
      <PageAppBar title={MESSAGES.awards.titleCreate} forceNative />

      {/* [Task #7 / 2026-05-14] 본문 form pb — Android WebView env() 0px 회귀 차단.
          이전: env(safe-area-inset-bottom) 단독 → Android WebView 에서 0px 평가되어 BottomNav+FAB(168px) 영역에 마지막 필드가 가려짐.
          수정: var(--safe-area-inset-bottom, env(...)) — Native Bridge 주입값 우선, env() 폴백.
          6rem(96px) = FAB 높이(56) + gap(12) + 안전 여유(28). */}
      {/* [ICETIMES flat] main = 회색 캔버스 + full-bleed 흰 섹션 (카드 박스 제거).
          폼 입력은 INPUT_CLASS(it-fill + 1.5px it-line-strong), 라벨 it-ink-800, 필수표시 it-red. */}
      <form
        onSubmit={handleSubmit}
        className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck pb-[calc(60px+var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px))+6rem)]"
      >
        {/* 자녀 없을 때 안내 */}
        {!isChildrenLoading && !hasEligibleChildren && (
          <div className="mx-5 mt-3 rounded-w-md bg-it-blue-50 dark:bg-it-blue-900/30 border-[1.5px] border-it-blue-500/30 p-4 flex items-start gap-3">
            <Icon
              name="info"
              size={20}
              className="text-it-blue-500 mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <div className="flex-1">
              <p className="text-card-body font-semibold text-it-ink-800 dark:text-it-blue-100">
                {MESSAGES.awards.needTeamMembership}
              </p>
              <p className="text-card-meta text-it-ink-500 dark:text-it-blue-200 mt-1">
                {MESSAGES.awards.noChildren}
              </p>
            </div>
          </div>
        )}

        {/* 그룹 1: 수상 정보 — 흰 섹션 */}
        <section className="mt-3 bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-6 space-y-5">
          {/* 자녀 선택 */}
          <div>
            <label htmlFor={childSelectId} className={LABEL_CLASS}>
              {MESSAGES.awards.labelChild}
              <span className="text-it-red-500 ml-1" aria-hidden="true">*</span>
            </label>
            <select
              id={childSelectId}
              value={form.memberId}
              onChange={(e) => setForm((prev) => ({ ...prev, memberId: e.target.value }))}
              disabled={isChildrenLoading || !hasEligibleChildren || isBusy}
              required
              aria-required="true"
              className={`${INPUT_CLASS} h-12 appearance-none`}
            >
              <option value="" disabled>
                {MESSAGES.awards.selectChild}
              </option>
              {eligibleChildren.map((c) => (
                <option key={c.id} value={c.memberId ?? ''}>
                  {c.name}
                  {c.club ? ` · ${c.club}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* 수상명 */}
          <div>
            <label htmlFor={awardNameId} className={LABEL_CLASS}>
              {MESSAGES.awards.labelAwardName}
              <span className="text-it-red-500 ml-1" aria-hidden="true">*</span>
            </label>
            <input
              id={awardNameId}
              type="text"
              value={form.awardName}
              onChange={(e) => setForm((prev) => ({ ...prev, awardName: e.target.value }))}
              placeholder={MESSAGES.awards.placeholderAwardName}
              maxLength={200}
              required
              aria-required="true"
              disabled={isBusy}
              className={INPUT_CLASS}
            />
          </div>

          {/* 수상 유형 */}
          <div>
            <label htmlFor={awardTypeId} className={LABEL_CLASS}>
              {MESSAGES.awards.labelAwardType}
              <span className="text-it-red-500 ml-1" aria-hidden="true">*</span>
            </label>
            <select
              id={awardTypeId}
              value={form.awardType}
              onChange={(e) => setForm((prev) => ({ ...prev, awardType: e.target.value as AwardType }))}
              required
              aria-required="true"
              disabled={isBusy}
              className={`${INPUT_CLASS} h-12 appearance-none`}
            >
              {AWARD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {MESSAGES.awards.typeLabel[t] ?? t}
                </option>
              ))}
            </select>
          </div>

          {/* 수상일 */}
          <div>
            <label htmlFor={awardedAtId} className={LABEL_CLASS}>
              {MESSAGES.awards.labelAwardedAt}
              <span className="text-it-red-500 ml-1" aria-hidden="true">*</span>
            </label>
            <input
              id={awardedAtId}
              type="date"
              value={form.awardedAt}
              onChange={(e) => setForm((prev) => ({ ...prev, awardedAt: e.target.value }))}
              required
              aria-required="true"
              max={todayIsoDate()}
              disabled={isBusy}
              className={INPUT_CLASS}
            />
          </div>

          {/* 수상 설명 */}
          <div>
            <label htmlFor={descriptionId} className={LABEL_CLASS}>
              {MESSAGES.awards.labelDescription}
            </label>
            <textarea
              id={descriptionId}
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder={MESSAGES.awards.placeholderDescription}
              maxLength={2000}
              rows={4}
              disabled={isBusy}
              className={`${INPUT_CLASS} resize-none`}
            />
          </div>

          {/* 시즌 */}
          <div>
            <label htmlFor={seasonId} className={LABEL_CLASS}>
              {MESSAGES.awards.labelSeason}
            </label>
            <input
              id={seasonId}
              type="text"
              value={form.season}
              onChange={(e) => setForm((prev) => ({ ...prev, season: e.target.value }))}
              placeholder={MESSAGES.awards.placeholderSeason}
              maxLength={20}
              disabled={isBusy}
              className={INPUT_CLASS}
            />
          </div>

          {/* 수여 기관 */}
          <div>
            <label htmlFor={awardedById} className={LABEL_CLASS}>
              {MESSAGES.awards.labelAwardedBy}
            </label>
            <input
              id={awardedById}
              type="text"
              value={form.awardedBy}
              onChange={(e) => setForm((prev) => ({ ...prev, awardedBy: e.target.value }))}
              placeholder={MESSAGES.awards.placeholderAwardedBy}
              maxLength={100}
              disabled={isBusy}
              className={INPUT_CLASS}
            />
          </div>
        </section>

        {/* 그룹 2: 첨부 — 흰 섹션 */}
        <section className="mt-2 bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-6 space-y-5">
          {/* 수상 사진 */}
          <div>
            <p className={LABEL_CLASS}>{MESSAGES.awards.labelImage}</p>
            {resolveImageSrc(imagePreview) ? (
              <div className="relative rounded-w-md overflow-hidden border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveImageSrc(imagePreview)}
                  alt="선택한 수상 사진 미리보기"
                  className="w-full h-48 object-cover"
                />
                {isUploadingImage && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white">
                    <p className="text-card-body font-semibold mb-2">
                      {MESSAGES.awards.uploadingImage}
                    </p>
                    <div className="w-3/4 h-1.5 rounded-w-pill bg-white/30 overflow-hidden">
                      <div
                        className="h-full bg-white transition-all motion-reduce:transition-none"
                        style={{ width: `${imageProgress}%` }}
                      />
                    </div>
                    <p className="text-card-meta mt-1 tabular-nums">{imageProgress}%</p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={removeImage}
                  disabled={isBusy}
                  className="absolute top-2 right-2 flex min-h-[48px] min-w-[48px] items-center justify-center rounded-w-pill bg-black/60 text-white hover:bg-black/80 transition-colors motion-reduce:transition-none disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                  aria-label={MESSAGES.awards.removeImage}
                >
                  <Icon name="close" size={20} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <label
                className="flex flex-col items-center justify-center h-32 rounded-w-md border-2 border-dashed border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-800 text-it-ink-400 dark:text-rink-300 cursor-pointer hover:border-it-blue-500 hover:text-it-blue-500 transition-colors motion-reduce:transition-none"
              >
                <Icon name="add_a_photo" size={28} aria-hidden="true" />
                <span className="text-card-meta mt-2">이미지 선택 (JPEG/PNG/WebP · 10MB)</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="sr-only"
                  onChange={handleImageSelect}
                  disabled={isBusy}
                />
              </label>
            )}
          </div>

          {/* 상장 PDF/이미지 */}
          <div>
            <p className={LABEL_CLASS}>{MESSAGES.awards.labelCertificate}</p>
            {certFile ? (
              <div className="rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-800 p-3 flex items-center gap-3">
                <div className="flex items-center justify-center size-10 rounded-[10px] bg-it-blue-50 dark:bg-it-blue-900/30 shrink-0">
                  <Icon
                    name={certFile.type.startsWith('image/') ? 'image' : 'picture_as_pdf'}
                    size={20}
                    className="text-it-blue-500"
                    aria-hidden="true"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-card-body font-medium text-it-ink-900 dark:text-white truncate">
                    {certFile.name}
                  </p>
                  <p className="text-card-meta text-it-ink-500 dark:text-rink-300 tabular-nums">
                    {(certFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  {isUploadingCert && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-w-pill bg-it-line dark:bg-rink-700 overflow-hidden">
                        <div
                          className="h-full bg-it-blue-500 transition-all motion-reduce:transition-none"
                          style={{ width: `${certProgress}%` }}
                        />
                      </div>
                      <span className="text-card-meta text-it-ink-500 dark:text-rink-300 tabular-nums shrink-0">
                        {certProgress}%
                      </span>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={removeCert}
                  disabled={isBusy}
                  className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-w-pill hover:bg-it-line dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40"
                  aria-label={MESSAGES.awards.removeCertificate}
                >
                  <Icon name="close" size={20} className="text-it-ink-400" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <label
                className="flex flex-col items-center justify-center h-32 rounded-w-md border-2 border-dashed border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-800 text-it-ink-400 dark:text-rink-300 cursor-pointer hover:border-it-blue-500 hover:text-it-blue-500 transition-colors motion-reduce:transition-none"
              >
                <Icon name="upload_file" size={28} aria-hidden="true" />
                <span className="text-card-meta mt-2">파일 선택 (PDF/이미지 · 20MB)</span>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={handleCertSelect}
                  disabled={isBusy}
                />
              </label>
            )}
          </div>
        </section>

        <div className="h-4" />
      </form>

      {/* [Task #7 / 2026-05-14] 하단 고정 액션 — globals.css `.bottom-fab-safe` 표준 유틸 사용.
          이전: `absolute bottom-0 inset-x-0` → MobileContainer padding-box 의 최하단(= viewport bottom) 으로
                계산되어 Web (parent) layout 의 ParentBottomNav (`fixed` 60+safe) 위에 정확히 겹침.
          수정: `fixed bottom-fab-safe left-1/2 -translate-x-1/2 w-full max-w-md px-4 z-40` →
                BottomNav 높이(60px) + var(--safe-area-inset-bottom, env(...)) + 12px gap 자동 계산.
                동일 표준: `(parent)/review/page.tsx:387`, `(parent)/children/[childId]/edit/page.tsx:424`. */}
      <div className="fixed bottom-fab-safe left-1/2 -translate-x-1/2 w-full max-w-md px-4 z-40 flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={isBusy}
          className="h-12 px-5 min-w-[96px] rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 text-it-ink-800 dark:text-rink-100 font-bold text-card-body hover:bg-it-fill dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none active:brightness-95 disabled:opacity-60"
        >
          취소
        </button>
        <button
          type="button"
          onClick={(e) => handleSubmit(e as unknown as React.FormEvent)}
          disabled={isBusy || !hasEligibleChildren}
          className="flex-1 h-12 rounded-w-md bg-it-blue-500 hover:bg-it-blue-600 disabled:bg-it-line disabled:dark:bg-rink-500 text-white font-bold text-card-emphasis shadow-sh-blue transition-colors motion-reduce:transition-none active:brightness-95 disabled:active:brightness-100 disabled:shadow-none"
        >
          {isUploadingImage
            ? MESSAGES.awards.uploadingImage
            : isUploadingCert
              ? MESSAGES.awards.uploadingCertificate
              : isSubmitting
                ? MESSAGES.common.processing
                : '등록하기'}
        </button>
      </div>
    </MobileContainer>
  );
}
