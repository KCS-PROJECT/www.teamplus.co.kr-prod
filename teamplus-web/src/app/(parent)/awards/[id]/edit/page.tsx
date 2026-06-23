'use client';

/**
 * Task #26 C-4 — 수상 이력 수정 페이지 (PARENT)
 *
 * Backend:
 *   GET   /api/v1/awards/player/:id
 *   PATCH /api/v1/awards/player/:id   (ADMIN/DIRECTOR/COACH/PARENT)
 *   POST  /api/v1/files/upload        (multipart)
 *
 * 플로우:
 *   1) id 기반 단건 조회 → form 초기화
 *   2) 사용자 수정 → 신규 파일 선택 시 업로드 → PATCH
 *   3) 성공 시 /awards 목록으로 이동
 */

import { useCallback, useEffect, useId, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { useAward, useAwardMutations } from '@/hooks/useAwards';
import { uploadFile, UploadValidationError, UploadNetworkError } from '@/services/upload.service';
import { AWARD_TYPES, type AwardType } from '@/types/awards';
import { MESSAGES } from '@/lib/messages';
import { resolveImageSrc } from '@/lib/image-url';
import { emitRefresh, REFRESH_KEYS } from '@/lib/refresh-bus';
import { api } from '@/services/api-client';

type FormState = {
  awardName: string;
  awardType: AwardType;
  awardedAt: string;
  description: string;
  season: string;
  awardedBy: string;
  imageUrl: string | null;
  certificateUrl: string | null;
};

function todayIsoDate(): string {
  return new Date().toISOString().split('T')[0];
}

export default function AwardEditPage() {
  // [appbar-harness-v3 / 2026-05-13] 이중 헤더 방지 — Web `<PageAppBar />` 단독 렌더.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
  });

  const router = useRouter();
  const params = useParams<{ id: string }>();
  const awardId = params?.id ?? '';

  const { toast } = useToast();
  const { award, isLoading, errorMessage } = useAward(awardId);
  const { updateAward, isSubmitting } = useAwardMutations();

  usePageReady(!isLoading);

  const awardNameId = useId();
  const awardTypeId = useId();
  const awardedAtId = useId();
  const descriptionId = useId();
  const seasonId = useId();
  const awardedById = useId();

  const [form, setForm] = useState<FormState>({
    awardName: '',
    awardType: 'special',
    awardedAt: todayIsoDate(),
    description: '',
    season: '',
    awardedBy: '',
    imageUrl: null,
    certificateUrl: null,
  });
  const [isInitialized, setIsInitialized] = useState(false);

  // 파일 업로드 상태 (신규 파일 선택 시만 사용)
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageProgress, setImageProgress] = useState(0);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const [certFile, setCertFile] = useState<File | null>(null);
  const [certProgress, setCertProgress] = useState(0);
  const [isUploadingCert, setIsUploadingCert] = useState(false);

  // award 로드 후 form 초기화
  useEffect(() => {
    if (!award || isInitialized) return;
    setForm({
      awardName: award.awardName,
      awardType: (award.awardType as AwardType) ?? 'special',
      awardedAt: award.awardedAt.split('T')[0],
      description: award.description ?? '',
      season: award.season ?? '',
      awardedBy: award.awardedBy ?? '',
      imageUrl: award.imageUrl ?? null,
      certificateUrl: award.certificateUrl ?? null,
    });
    setIsInitialized(true);
  }, [award, isInitialized]);

  // [수정 2026-05-23 Phase C] 사진 선택 즉시 업로드 + PATCH /awards/player/:id.
  //   기존: imageFile 만 staging 후 제출 시점 업로드 → 사용자가 "저장하기" 미클릭 이탈 시 손실.
  //   변경: team/[id]/edit AvatarUploader.onUploaded 패턴과 동일하게 즉시 반영 + refresh 이벤트.
  //         실패 시 preview 만 표시되고 form.imageUrl 은 변경되지 않으므로 submit 시 재시도.
  const handleImageSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      // 즉시 preview 표시 (UX)
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      setImageProgress(0);

      if (!awardId) return;
      setIsUploadingImage(true);
      try {
        const uploaded = await uploadFile(file, {
          category: 'IMAGE',
          refType: 'player_award',
          refId: awardId,
          onProgress: ({ percent }) => setImageProgress(percent),
        });
        // 즉시 PATCH — 폼 저장 전 손실 차단
        const res = await api.patch(`/awards/player/${awardId}`, {
          imageUrl: uploaded.url,
        });
        if (res.success) {
          setForm((prev) => ({ ...prev, imageUrl: uploaded.url }));
          setImageFile(null); // staging 해제 (제출 시점 재업로드 방지)
          emitRefresh(REFRESH_KEYS.AWARDS);
        }
      } catch (err) {
        const msg =
          err instanceof UploadValidationError || err instanceof UploadNetworkError
            ? err.message
            : MESSAGES.awards.uploadImageError;
        toast.error(msg);
      } finally {
        setIsUploadingImage(false);
      }
    },
    [awardId, toast],
  );

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
    setForm((prev) => ({ ...prev, imageUrl: null }));
  }, [imagePreview]);

  const removeCert = useCallback(() => {
    setCertFile(null);
    setCertProgress(0);
    setForm((prev) => ({ ...prev, certificateUrl: null }));
  }, []);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!awardId) return;
      if (!form.awardName.trim()) {
        toast.warning(MESSAGES.awards.nameRequired);
        return;
      }
      if (!form.awardedAt) {
        toast.warning(MESSAGES.awards.dateRequired);
        return;
      }

      // 신규 이미지 업로드
      let nextImageUrl: string | null | undefined = form.imageUrl;
      if (imageFile) {
        try {
          setIsUploadingImage(true);
          const uploaded = await uploadFile(imageFile, {
            category: 'IMAGE',
            refType: 'player_award',
            refId: awardId,
            onProgress: ({ percent }) => setImageProgress(percent),
          });
          nextImageUrl = uploaded.url;
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

      // 신규 상장 업로드
      let nextCertUrl: string | null | undefined = form.certificateUrl;
      if (certFile) {
        try {
          setIsUploadingCert(true);
          const isImage = certFile.type.startsWith('image/');
          const uploaded = await uploadFile(certFile, {
            category: isImage ? 'IMAGE' : 'DOCUMENT',
            refType: 'player_award',
            refId: awardId,
            onProgress: ({ percent }) => setCertProgress(percent),
          });
          nextCertUrl = uploaded.url;
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

      const updated = await updateAward(awardId, {
        awardName: form.awardName.trim(),
        awardType: form.awardType,
        awardedAt: form.awardedAt,
        description: form.description.trim() || undefined,
        season: form.season.trim() || undefined,
        awardedBy: form.awardedBy.trim() || undefined,
        imageUrl: nextImageUrl ?? undefined,
        certificateUrl: nextCertUrl ?? undefined,
      });

      if (!updated) {
        toast.error(MESSAGES.awards.updateError);
        return;
      }

      toast.success(MESSAGES.awards.updated);
      router.replace('/awards');
    },
    [awardId, form, imageFile, certFile, updateAward, router, toast],
  );

  const isBusy = isSubmitting || isUploadingImage || isUploadingCert;

  // 로딩 상태
  if (isLoading) {
    return null;
  }

  // 에러 상태
  if (errorMessage || !award) {
    return (
      <MobileContainer hasBottomNav>
        {/* [Task #7 / 2026-05-14] forceNative — Native WebView 에서도 Web 헤더 노출 (뒤로가기 동선 보존) */}
        <PageAppBar title={MESSAGES.awards.titleEdit} forceNative />
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <div className="flex items-center justify-center size-16 rounded-w-pill bg-wline-2 dark:bg-rink-700 mb-4">
            <Icon
              name="error_outline"
              className="text-3xl text-wtext-3 dark:text-rink-300"
              aria-hidden="true"
            />
          </div>
          <p className="text-card-emphasis font-semibold text-wtext-2 dark:text-rink-100 mb-1">
            {errorMessage ?? MESSAGES.awards.loadError}
          </p>
          <button
            type="button"
            onClick={() => router.back()}
            className="mt-6 min-h-[48px] px-5 rounded-xl bg-ice-500 hover:bg-ice-700 text-white font-semibold text-card-body transition-colors motion-reduce:transition-none active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40"
          >
            {MESSAGES.common.goBack}
          </button>
        </div>
      </MobileContainer>
    );
  }

  const displayImageUrl = imagePreview ?? form.imageUrl;

  return (
    <MobileContainer hasBottomNav>
      {/* [Task #7 / 2026-05-14] forceNative — Native WebView 에서도 Web 헤더 노출.
          원인: PageAppBar.tsx 의 `if (isNative && !forceNative) return null` 분기로 Native 에서 헤더가 사라져
                Flutter Shell AppBar 도 꺼진 상태(showAppBar:false)와 결합해 이중-부재 발생 → 뒤로가기 동선 차단.
          조치: forceNative 단일 노출 (awards/create · review · checkout · stickers 와 동일 표준). */}
      <PageAppBar title={MESSAGES.awards.titleEdit} forceNative />

      {/* [Task #7 / 2026-05-14] 본문 form pb — Android WebView env() 0px 회귀 차단 + FAB 영역 확보.
          이전: pb-28 (112px) 고정 → safe-area 무반영. 또한 액션 영역이 absolute bottom-0 (padding-box 끝 = BottomNav 시작점)
                으로 정확히 ParentBottomNav 위에 겹쳐 표시되는 fixed/sticky positioning 충돌.
          수정: BottomNav(60+safe) + FAB(56+12gap) + 안전 여유 = 6rem(96px) padding 확보. */}
      <form
        onSubmit={handleSubmit}
        className="flex-1 overflow-y-auto hide-scrollbar px-4 pb-[calc(60px+var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px))+6rem)] pt-4 flex flex-col gap-5"
      >
        {/* 수상명 */}
        <div>
          <label
            htmlFor={awardNameId}
            className="block text-card-body font-semibold text-wtext-2 dark:text-rink-100 mb-1.5"
          >
            {MESSAGES.awards.labelAwardName}
            <span className="text-red-500 ml-1" aria-hidden="true">*</span>
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
            className="w-full h-11 px-3.5 rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-wtext-1 dark:text-white text-card-body placeholder:text-wtext-3 dark:placeholder:text-wtext-3 focus:outline-none focus:ring-2 focus:ring-ice-500/30 focus:border-ice-500 transition-colors motion-reduce:transition-none disabled:opacity-60"
          />
        </div>

        {/* 수상 유형 */}
        <div>
          <label
            htmlFor={awardTypeId}
            className="block text-card-body font-semibold text-wtext-2 dark:text-rink-100 mb-1.5"
          >
            {MESSAGES.awards.labelAwardType}
            <span className="text-red-500 ml-1" aria-hidden="true">*</span>
          </label>
          <select
            id={awardTypeId}
            value={form.awardType}
            onChange={(e) => setForm((prev) => ({ ...prev, awardType: e.target.value as AwardType }))}
            required
            aria-required="true"
            disabled={isBusy}
            className="w-full h-11 px-3.5 rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-wtext-1 dark:text-white text-card-body focus:outline-none focus:ring-2 focus:ring-ice-500/30 focus:border-ice-500 transition-colors motion-reduce:transition-none appearance-none disabled:opacity-60"
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
          <label
            htmlFor={awardedAtId}
            className="block text-card-body font-semibold text-wtext-2 dark:text-rink-100 mb-1.5"
          >
            {MESSAGES.awards.labelAwardedAt}
            <span className="text-red-500 ml-1" aria-hidden="true">*</span>
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
            className="w-full h-11 px-3.5 rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-wtext-1 dark:text-white text-card-body focus:outline-none focus:ring-2 focus:ring-ice-500/30 focus:border-ice-500 transition-colors motion-reduce:transition-none disabled:opacity-60"
          />
        </div>

        {/* 설명 */}
        <div>
          <label
            htmlFor={descriptionId}
            className="block text-card-body font-semibold text-wtext-2 dark:text-rink-100 mb-1.5"
          >
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
            className="w-full px-3.5 py-2.5 rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-wtext-1 dark:text-white text-card-body placeholder:text-wtext-3 dark:placeholder:text-wtext-3 focus:outline-none focus:ring-2 focus:ring-ice-500/30 focus:border-ice-500 transition-colors motion-reduce:transition-none resize-none disabled:opacity-60"
          />
        </div>

        {/* 시즌 */}
        <div>
          <label
            htmlFor={seasonId}
            className="block text-card-body font-semibold text-wtext-2 dark:text-rink-100 mb-1.5"
          >
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
            className="w-full h-11 px-3.5 rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-wtext-1 dark:text-white text-card-body placeholder:text-wtext-3 dark:placeholder:text-wtext-3 focus:outline-none focus:ring-2 focus:ring-ice-500/30 focus:border-ice-500 transition-colors motion-reduce:transition-none disabled:opacity-60"
          />
        </div>

        {/* 수여 기관 */}
        <div>
          <label
            htmlFor={awardedById}
            className="block text-card-body font-semibold text-wtext-2 dark:text-rink-100 mb-1.5"
          >
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
            className="w-full h-11 px-3.5 rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-wtext-1 dark:text-white text-card-body placeholder:text-wtext-3 dark:placeholder:text-wtext-3 focus:outline-none focus:ring-2 focus:ring-ice-500/30 focus:border-ice-500 transition-colors motion-reduce:transition-none disabled:opacity-60"
          />
        </div>

        {/* 수상 사진 */}
        <div>
          <p className="block text-card-body font-semibold text-wtext-2 dark:text-rink-100 mb-1.5">
            {MESSAGES.awards.labelImage}
          </p>
          {resolveImageSrc(displayImageUrl) ? (
            <div className="relative rounded-xl overflow-hidden border border-wline dark:border-rink-700 bg-wbg dark:bg-rink-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveImageSrc(displayImageUrl)}
                alt="수상 사진 미리보기"
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
              className="flex flex-col items-center justify-center h-32 rounded-xl border-2 border-dashed border-wline dark:border-rink-700 bg-wbg dark:bg-rink-800 text-wtext-3 dark:text-rink-300 cursor-pointer hover:border-ice-500 hover:text-ice-500 transition-colors motion-reduce:transition-none"
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

        {/* 상장 */}
        <div>
          <p className="block text-card-body font-semibold text-wtext-2 dark:text-rink-100 mb-1.5">
            {MESSAGES.awards.labelCertificate}
          </p>
          {certFile ? (
            <div className="rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 p-3 flex items-center gap-3">
              <div className="flex items-center justify-center size-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 shrink-0">
                <Icon
                  name={certFile.type.startsWith('image/') ? 'image' : 'picture_as_pdf'}
                  size={20}
                  className="text-ice-500"
                  aria-hidden="true"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-card-body font-medium text-wtext-1 dark:text-white truncate">
                  {certFile.name}
                </p>
                <p className="text-card-meta text-wtext-3 dark:text-rink-300 tabular-nums">
                  {(certFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
                {isUploadingCert && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-w-pill bg-wline dark:bg-rink-700 overflow-hidden">
                      <div
                        className="h-full bg-ice-500 transition-all motion-reduce:transition-none"
                        style={{ width: `${certProgress}%` }}
                      />
                    </div>
                    <span className="text-card-meta text-wtext-3 dark:text-rink-300 tabular-nums shrink-0">
                      {certProgress}%
                    </span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={removeCert}
                disabled={isBusy}
                className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-w-pill hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40"
                aria-label={MESSAGES.awards.removeCertificate}
              >
                <Icon name="close" size={20} className="text-wtext-3" aria-hidden="true" />
              </button>
            </div>
          ) : form.certificateUrl ? (
            <div className="rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 p-3 flex items-center gap-3">
              <div className="flex items-center justify-center size-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 shrink-0">
                <Icon name="description" size={20} className="text-ice-500" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <a
                  href={form.certificateUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-card-body font-medium text-ice-500 hover:underline truncate block"
                >
                  기존 상장 보기
                </a>
                <p className="text-card-meta text-wtext-3 dark:text-rink-300">새 파일을 선택하면 교체됩니다.</p>
              </div>
              <button
                type="button"
                onClick={removeCert}
                disabled={isBusy}
                className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-w-pill hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40"
                aria-label={MESSAGES.awards.removeCertificate}
              >
                <Icon name="close" size={20} className="text-wtext-3" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <label
              className="flex flex-col items-center justify-center h-32 rounded-xl border-2 border-dashed border-wline dark:border-rink-700 bg-wbg dark:bg-rink-800 text-wtext-3 dark:text-rink-300 cursor-pointer hover:border-ice-500 hover:text-ice-500 transition-colors motion-reduce:transition-none"
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

        <div className="h-4" />
      </form>

      {/* [Task #7 / 2026-05-14] 하단 고정 액션 — globals.css `.bottom-fab-safe` 표준 유틸 사용.
          이전: `absolute bottom-0 inset-x-0` → MobileContainer padding-box 의 padding-bottom(60+safe)
                시작 지점에 정확히 위치 → ParentBottomNav 와 fixed/sticky positioning 충돌(겹침).
          수정: `fixed bottom-fab-safe left-1/2 -translate-x-1/2 w-full max-w-md px-4 z-40` →
                BottomNav 높이(60px) + var(--safe-area-inset-bottom, env(...)) + 12px gap 자동 계산.
                동일 표준: `(parent)/awards/create/page.tsx:566`, `(parent)/review/page.tsx`,
                `(parent)/children/[childId]/edit/page.tsx`. */}
      <div className="fixed bottom-fab-safe left-1/2 -translate-x-1/2 w-full max-w-md px-4 z-40 flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={isBusy}
          className="h-12 px-5 min-w-[96px] rounded-xl bg-wline-2 dark:bg-rink-800 text-wtext-2 dark:text-rink-100 font-semibold text-card-body hover:bg-wline dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none active:brightness-95 disabled:opacity-60"
        >
          취소
        </button>
        <button
          type="button"
          onClick={(e) => handleSubmit(e as unknown as React.FormEvent)}
          disabled={isBusy}
          className="flex-1 h-12 rounded-xl bg-ice-500 hover:bg-ice-700 disabled:bg-wline disabled:dark:bg-rink-500 text-white font-bold text-card-emphasis shadow-md transition-colors motion-reduce:transition-none active:brightness-95 disabled:active:brightness-100 disabled:shadow-none"
        >
          {isUploadingImage
            ? MESSAGES.awards.uploadingImage
            : isUploadingCert
              ? MESSAGES.awards.uploadingCertificate
              : isSubmitting
                ? MESSAGES.common.saving
                : '저장하기'}
        </button>
      </div>
    </MobileContainer>
  );
}
