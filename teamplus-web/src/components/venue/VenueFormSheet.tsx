'use client';

/**
 * VenueFormSheet — 구장 등록/수정 바텀시트 폼
 *
 * 목업 2 (구장 관리 및 설정) 기반.
 * - 히어로 이미지 + **실제 파일 업로드** (jpeg/png/webp, ≤5MB, 백엔드 multer 연동)
 * - 운영 상태 토글 (active / maintenance / closed)
 * - 구장명·전화·주소·오픈·마감·시설 안내
 * - Sticky bottom 저장 버튼
 * - 접근성: form 라벨/aria 필수, 버튼 min-height 44px
 *
 * 컨트롤 패턴:
 * - 폼 필드 — 완전 제어 (value/onChange), 상위 페이지에서 상태 관리
 * - 이미지 업로드 — `onUploadImage` 콜백이 제공되면 실시간 업로드, 반환된 URL 을 로컬 미리보기에 반영
 *   (`onUploadImage` 미제공 시 로컬 ObjectURL 미리보기만 표시, save 시 URL 을 페이로드에 포함하지 않음)
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { Icon } from '@/components/ui/Icon';
import { useNativeScrim } from '@/hooks/useNativeScrim';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { VENUE_IMAGE_ACCEPTED_MIMES, VENUE_IMAGE_MAX_BYTES } from '@/services/venueService';
import {
  FACILITY_META,
  type Venue,
  type VenueAmenity,
  type VenuePayload,
  type VenueStatus,
} from '@/types/venue';

const RINK_SIZE_OPTIONS = ['NHL', 'International', 'Olympic', 'Custom'] as const;

export interface VenueUploadResult {
  ok: boolean;
  imageUrl?: string;
  message?: string;
}

export interface VenueFormSheetProps {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: Venue | null;
  isSaving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (payload: VenuePayload) => void | Promise<void>;
  /** 삭제 버튼 표시 (edit 모드 + canDelete=true 일 때만) */
  onDelete?: () => void | Promise<void>;
  canDelete?: boolean;
  /** 상태 변경용 별도 토글 버튼 커스텀 렌더 */
  statusExtraSlot?: ReactNode;
  /**
   * 실제 이미지 업로드 핸들러 (멀티파트)
   * - 제공 시: File 을 받아 서버 업로드 후 { ok: true, imageUrl } 반환
   * - 미제공 시: 파일 input 은 로컬 미리보기 전용
   */
  onUploadImage?: (file: File) => Promise<VenueUploadResult>;
  /**
   * [ICETIMES Phase 2] flat 테마. 기본 false = 기존 스타일 1:1 보존(회귀 0).
   *   true 시 입력=it-fill+1.5px(it-line-strong), 포커스=it-blue, CTA=it-blue 로 통일.
   */
  iceTheme?: boolean;
}

// ICETIMES flat 입력 컨테이너 — it-fill 배경 + 1.5px it-line-strong + it-blue 포커스.
const ICE_INPUT =
  'border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-800 text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-wtext-3 focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20';
// 기존 입력 — wbg 배경 + wline + ice 포커스.
const BASE_INPUT =
  'border border-wline dark:border-rink-700 bg-wbg dark:bg-rink-800 text-wtext-1 dark:text-white focus:ring-2 focus:ring-ice-500';

const STATUS_OPTIONS: { value: VenueStatus; label: string }[] = [
  { value: 'active', label: MESSAGES.venue.status.active },
  { value: 'maintenance', label: MESSAGES.venue.status.maintenance },
  { value: 'closed', label: MESSAGES.venue.status.closed },
];

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1515703407324-5f753afd8be8?w=800&h=400&fit=crop';

function parseHours(value: Venue['operatingHours']) {
  if (!value) return { open: '09:00', close: '22:00' };
  return {
    open: value.open ?? '09:00',
    close: value.close ?? '22:00',
  };
}

export function VenueFormSheet({
  open,
  mode,
  initial,
  isSaving = false,
  error,
  onClose,
  onSave,
  onDelete,
  canDelete = false,
  statusExtraSlot,
  onUploadImage,
  iceTheme = false,
}: VenueFormSheetProps) {
  // 입력 비주얼 — iceTheme 면 it-* flat, 아니면 기존 wbg/ice. (구조·로직 동일)
  const inputCls = iceTheme ? ICE_INPUT : BASE_INPUT;
  // [2026-05-12 → 2026-05-16 v2] 네이티브 status bar 영역만 dim — Sheet 패턴.
  //   BottomSheet 류는 `bottom: false` — 시트 카드가 화면 하단까지 차지.
  //   SoT: docs/Design/MODAL_DIM_POLICY.md
  useNativeScrim(open, undefined, { bottom: false });

  // ids for a11y
  const nameId = useId();
  const phoneId = useId();
  const addressId = useId();
  const addressDetailId = useId();
  const openId = useId();
  const closeId = useId();
  const descriptionId = useId();
  const capacityId = useId();
  const hourlyRateId = useId();
  const latitudeId = useId();
  const longitudeId = useId();

  // local form state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [addressDetail, setAddressDetail] = useState('');
  const [openTime, setOpenTime] = useState('09:00');
  const [closeTime, setCloseTime] = useState('22:00');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [status, setStatus] = useState<VenueStatus>('active');
  const [amenities, setAmenities] = useState<VenueAmenity[]>([]);
  const [rinkSize, setRinkSize] = useState<string>('');
  const [capacity, setCapacity] = useState<string>('');
  const [hourlyRate, setHourlyRate] = useState<string>('');
  const [latitude, setLatitude] = useState<string>('');
  const [longitude, setLongitude] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  // SSR 안전: document.body 는 클라이언트에서만 접근
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ─── Open/Close 애니메이션 ──────────────────────
  // open=false 가 되어도 즉시 unmount 하지 않고, 하강 애니메이션(300ms) 재생 후 언마운트
  const [shouldRender, setShouldRender] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const CLOSE_DURATION = 300; // tailwind sheet-down 0.3s 와 일치

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      setIsExiting(false);
      return;
    }
    if (shouldRender) {
      setIsExiting(true);
      const t = setTimeout(() => {
        setShouldRender(false);
        setIsExiting(false);
      }, CLOSE_DURATION);
      return () => clearTimeout(t);
    }
  }, [open, shouldRender]);
  const [isUploading, setIsUploading] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // initial prefill on open
  useEffect(() => {
    if (!open) return;
    if (initial && mode === 'edit') {
      setName(initial.name ?? '');
      setPhone(initial.phone ?? '');
      setAddress(initial.address ?? '');
      setAddressDetail(initial.addressDetail ?? '');
      const hours = parseHours(initial.operatingHours);
      setOpenTime(hours.open);
      setCloseTime(hours.close);
      setDescription(initial.description ?? '');
      setImageUrl(initial.imageUrl ?? '');
      setStatus(initial.status);
      setAmenities(Array.isArray(initial.amenities) ? initial.amenities : []);
      setRinkSize(initial.rinkSize ?? '');
      setCapacity(initial.capacity != null ? String(initial.capacity) : '');
      setHourlyRate(
        initial.hourlyRate != null ? String(initial.hourlyRate) : '',
      );
      setLatitude(
        initial.latitude != null && initial.latitude !== ''
          ? String(initial.latitude)
          : '',
      );
      setLongitude(
        initial.longitude != null && initial.longitude !== ''
          ? String(initial.longitude)
          : '',
      );
    } else {
      setName('');
      setPhone('');
      setAddress('');
      setAddressDetail('');
      setOpenTime('09:00');
      setCloseTime('22:00');
      setDescription('');
      setImageUrl('');
      setStatus('active');
      setAmenities([]);
      setRinkSize('');
      setCapacity('');
      setHourlyRate('');
      setLatitude('');
      setLongitude('');
    }
    setFormError(null);
  }, [open, initial, mode]);

  const toggleAmenity = useCallback((key: VenueAmenity) => {
    setAmenities((prev) =>
      prev.includes(key) ? prev.filter((a) => a !== key) : [...prev, key],
    );
  }, []);

  const heroSrc = useMemo(() => {
    if (localPreview) return localPreview;
    if (imageUrl) return imageUrl;
    return FALLBACK_IMAGE;
  }, [localPreview, imageUrl]);

  // localPreview 가 해제되지 않고 남아있으면 메모리 누수 → unmount/close 시 정리
  useEffect(() => {
    return () => {
      if (localPreview && localPreview.startsWith('blob:')) {
        URL.revokeObjectURL(localPreview);
      }
    };
  }, [localPreview]);

  const handleSave = useCallback(async () => {
    // 기본 유효성
    if (!name.trim()) {
      setFormError(MESSAGES.venue.validation.nameRequired);
      return;
    }
    if (name.length > 100) {
      setFormError(MESSAGES.venue.validation.nameMaxLength);
      return;
    }
    const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!timeRe.test(openTime) || !timeRe.test(closeTime)) {
      setFormError(MESSAGES.venue.validation.timeInvalid);
      return;
    }

    // 숫자 필드 유효성
    let capacityValue: number | null = null;
    if (capacity.trim()) {
      const parsed = Number(capacity.trim());
      if (!Number.isFinite(parsed) || parsed < 1) {
        setFormError(MESSAGES.venue.validation.capacityInvalid);
        return;
      }
      capacityValue = Math.floor(parsed);
    }

    let hourlyRateValue: number | null = null;
    if (hourlyRate.trim()) {
      const parsed = Number(hourlyRate.trim());
      if (!Number.isFinite(parsed) || parsed < 0) {
        setFormError(MESSAGES.venue.validation.hourlyRateInvalid);
        return;
      }
      hourlyRateValue = Math.floor(parsed);
    }

    // 위도: -90 ~ 90
    let latitudeValue: number | null = null;
    if (latitude.trim()) {
      const parsed = Number(latitude.trim());
      if (!Number.isFinite(parsed) || parsed < -90 || parsed > 90) {
        setFormError('위도는 -90 ~ 90 사이의 숫자여야 합니다.');
        return;
      }
      latitudeValue = parsed;
    }

    // 경도: -180 ~ 180
    let longitudeValue: number | null = null;
    if (longitude.trim()) {
      const parsed = Number(longitude.trim());
      if (!Number.isFinite(parsed) || parsed < -180 || parsed > 180) {
        setFormError('경도는 -180 ~ 180 사이의 숫자여야 합니다.');
        return;
      }
      longitudeValue = parsed;
    }

    // 위·경도는 함께 입력되어야 함 (지도 좌표 정합성)
    if ((latitudeValue === null) !== (longitudeValue === null)) {
      setFormError('위도와 경도는 함께 입력해주세요.');
      return;
    }

    const payload: VenuePayload = {
      name: name.trim(),
      phone: phone.trim() || null,
      address: address.trim() || null,
      addressDetail: addressDetail.trim() || null,
      operatingHours: { open: openTime, close: closeTime },
      description: description.trim() || null,
      imageUrl: imageUrl.trim() || null,
      status,
      amenities: amenities.length > 0 ? amenities : null,
      rinkSize: rinkSize || null,
      capacity: capacityValue,
      hourlyRate: hourlyRateValue,
      latitude: latitudeValue,
      longitude: longitudeValue,
    };
    setFormError(null);
    await onSave(payload);
  }, [
    name,
    phone,
    address,
    addressDetail,
    openTime,
    closeTime,
    description,
    imageUrl,
    status,
    amenities,
    rinkSize,
    capacity,
    hourlyRate,
    latitude,
    longitude,
    onSave,
  ]);

  const handlePickImage = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      // input 재선택 허용을 위해 value 즉시 초기화
      e.target.value = '';

      // 클라이언트 선제 검증 (백엔드도 동일 룰 유지)
      if (!(VENUE_IMAGE_ACCEPTED_MIMES as readonly string[]).includes(file.type)) {
        setFormError(MESSAGES.venue.validation.imageMime);
        return;
      }
      if (file.size > VENUE_IMAGE_MAX_BYTES) {
        setFormError(MESSAGES.venue.validation.imageSize);
        return;
      }

      // 로컬 미리보기 즉시 반영
      const preview = URL.createObjectURL(file);
      if (localPreview && localPreview.startsWith('blob:')) {
        URL.revokeObjectURL(localPreview);
      }
      setLocalPreview(preview);
      setFormError(null);

      // onUploadImage 제공 시 실제 서버 업로드
      if (onUploadImage) {
        setIsUploading(true);
        const result = await onUploadImage(file);
        setIsUploading(false);
        if (result.ok && result.imageUrl) {
          setImageUrl(result.imageUrl);
          // 서버 URL 이 확정되면 로컬 blob 해제
          if (preview.startsWith('blob:')) {
            URL.revokeObjectURL(preview);
          }
          setLocalPreview(null);
        } else {
          setFormError(result.message ?? MESSAGES.venue.result.imageUploadError);
        }
      }
    },
    [localPreview, onUploadImage],
  );

  const handleDelete = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (!window.confirm(MESSAGES.venue.result.deleteConfirm)) return;
    await onDelete?.();
  }, [onDelete]);

  if (!shouldRender || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="venue-form-sheet-title"
    >
      {/* 오버레이 — 부드러운 페이드 인/아웃 */}
      <button
        type="button"
        onClick={onClose}
        className={cn(
          'absolute inset-0 bg-black/40 motion-reduce:animate-none',
          isExiting ? 'animate-overlay-out' : 'animate-overlay-in',
        )}
        aria-label={MESSAGES.venue.actions.close}
      />

      {/* 시트 본체 — 하단에서 슬라이드 업/다운 */}
      <div
        className={cn(
          'relative w-full max-w-md bg-white dark:bg-rink-900 rounded-t-3xl shadow-md flex flex-col max-h-[92vh] motion-reduce:animate-none',
          isExiting ? 'animate-sheet-down' : 'animate-sheet-up',
        )}
      >
        {/* 핸들 */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="h-1.5 w-12 bg-wline dark:bg-rink-500 rounded-full" />
        </div>

        {/* 시트 헤더 */}
        <div className="relative px-5 pb-3 flex items-center border-b border-wline-2 dark:border-rink-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="text-wtext-3 dark:text-rink-300 hover:text-wtext-1 dark:hover:text-white flex items-center gap-1 py-2 text-sm font-medium"
          >
            <Icon name="close" className="text-[20px]" aria-hidden="true" />
            {MESSAGES.venue.actions.cancel}
          </button>
          <h2
            id="venue-form-sheet-title"
            className="absolute left-1/2 -translate-x-1/2 text-base font-bold text-wtext-1 dark:text-white pointer-events-none"
          >
            {mode === 'create' ? MESSAGES.venue.actions.create : MESSAGES.venue.manage.editButton}
          </h2>
        </div>

        {/* 스크롤 컨테이너 */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* 히어로 이미지 */}
          <div className="relative w-full h-52 bg-wline-2 dark:bg-rink-800">
            <Image
              src={heroSrc}
              alt={MESSAGES.venue.form.imageAlt(name)}
              fill
              sizes="(max-width: 448px) 100vw, 448px"
              className="object-cover"
              unoptimized
            />
            {isUploading ? (
              <div
                className="absolute inset-0 flex items-center justify-center bg-black/50"
                role="status"
                aria-live="polite"
              >
                <div className={cn(
                  'bg-white dark:bg-rink-900 rounded-lg px-4 py-2 text-sm font-semibold shadow-md flex items-center gap-2',
                  iceTheme ? 'text-it-blue-500' : 'text-ice-500',
                )}>
                  <Icon
                    name="progress_activity"
                    className="text-[18px] animate-spin"
                    aria-hidden="true"
                  />
                  {MESSAGES.venue.result.uploading}
                </div>
              </div>
            ) : null}
            <button
              type="button"
              onClick={handlePickImage}
              disabled={isUploading}
              className="absolute bottom-4 right-4 bg-white text-wtext-1 rounded-lg px-3 py-2 text-xs font-semibold shadow flex items-center gap-1.5 disabled:opacity-60 border border-wline"
            >
              <Icon name="photo_camera" className="text-[16px]" aria-hidden="true" />
              {MESSAGES.venue.actions.changePhoto}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={VENUE_IMAGE_ACCEPTED_MIMES.join(',')}
              className="sr-only"
              aria-hidden="true"
              tabIndex={-1}
              onChange={handleFileChange}
            />
          </div>

          <div className="p-5 space-y-7">
            {/* 운영 상태 */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-wtext-2 dark:text-rink-100">
                  {MESSAGES.venue.form.sectionStatus}
                </label>
                <div className="flex items-center bg-wline-2 dark:bg-rink-800 rounded-lg p-1">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setStatus(opt.value)}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-xs font-bold transition-colors',
                        status === opt.value
                          ? cn(
                              'bg-white dark:bg-rink-700 shadow-sm',
                              iceTheme ? 'text-it-blue-500' : 'text-ice-500',
                            )
                          : 'text-wtext-3 hover:text-wtext-1 dark:hover:text-white',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {statusExtraSlot}
            </section>

            {/* 기본 정보 */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-wtext-2 dark:text-rink-100">
                {MESSAGES.venue.form.sectionBasic}
              </h3>
              <div className="space-y-1.5">
                <label htmlFor={nameId} className="text-xs text-wtext-3 dark:text-rink-300">
                  {MESSAGES.venue.form.nameLabel}
                </label>
                <input
                  id={nameId}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={MESSAGES.venue.form.namePlaceholder}
                  className={cn(
                    'w-full rounded-lg px-4 py-3 text-sm focus:outline-none',
                    inputCls,
                  )}
                  required
                  aria-required="true"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor={phoneId} className="text-xs text-wtext-3 dark:text-rink-300">
                  {MESSAGES.venue.form.phoneLabel}
                </label>
                <div className="relative">
                  <Icon
                    name="call"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-wtext-3 text-[18px]"
                    aria-hidden="true"
                  />
                  <input
                    id={phoneId}
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={MESSAGES.venue.form.phonePlaceholder}
                    className={cn(
                      'w-full rounded-lg pl-10 pr-4 py-3 text-sm focus:outline-none',
                      inputCls,
                    )}
                  />
                </div>
              </div>
            </section>

            {/* 위치 */}
            <section className="space-y-3">
              <label
                htmlFor={addressId}
                className="block text-sm font-semibold text-wtext-2 dark:text-rink-100"
              >
                {MESSAGES.venue.form.sectionLocation}
              </label>
              <input
                id={addressId}
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={MESSAGES.venue.form.addressPlaceholder}
                className={cn(
                  'w-full rounded-lg px-4 py-3 text-sm focus:outline-none',
                  inputCls,
                )}
              />
              <input
                id={addressDetailId}
                type="text"
                value={addressDetail}
                onChange={(e) => setAddressDetail(e.target.value)}
                placeholder={MESSAGES.venue.form.addressDetailPlaceholder}
                className={cn(
                  'w-full rounded-lg px-4 py-3 text-sm focus:outline-none',
                  inputCls,
                )}
                aria-label={MESSAGES.venue.form.addressDetailLabel}
              />
            </section>

            {/* 지도 좌표 (위도·경도) */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-wtext-2 dark:text-rink-100">
                지도 좌표
                <span className="ml-1 text-xs font-normal text-wtext-3">(선택)</span>
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor={latitudeId} className="text-xs text-wtext-3 dark:text-rink-300">
                    위도 (Latitude)
                  </label>
                  <input
                    id={latitudeId}
                    type="text"
                    inputMode="decimal"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    placeholder="37.566535"
                    aria-describedby={`${latitudeId}-hint`}
                    className={cn(
                      'w-full rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none',
                      inputCls,
                    )}
                  />
                  <p id={`${latitudeId}-hint`} className="text-card-meta text-wtext-3">
                    -90 ~ 90
                  </p>
                </div>
                <div className="space-y-1">
                  <label htmlFor={longitudeId} className="text-xs text-wtext-3 dark:text-rink-300">
                    경도 (Longitude)
                  </label>
                  <input
                    id={longitudeId}
                    type="text"
                    inputMode="decimal"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    placeholder="126.977969"
                    aria-describedby={`${longitudeId}-hint`}
                    className={cn(
                      'w-full rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none',
                      inputCls,
                    )}
                  />
                  <p id={`${longitudeId}-hint`} className="text-card-meta text-wtext-3">
                    -180 ~ 180
                  </p>
                </div>
              </div>
              <p className="flex items-start gap-1.5 text-card-meta text-wtext-3 dark:text-rink-300">
                <Icon name="info" className="text-sm shrink-0 mt-0.5" aria-hidden="true" />
                <span>지도에서 정확한 위치 표시를 위해 사용됩니다. 위도와 경도는 함께 입력해주세요.</span>
              </p>
            </section>

            {/* 운영 시간 */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-wtext-2 dark:text-rink-100">
                {MESSAGES.venue.form.sectionHours}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor={openId} className="text-xs text-wtext-3 dark:text-rink-300">
                    {MESSAGES.venue.form.openLabel}
                  </label>
                  <input
                    id={openId}
                    type="time"
                    value={openTime}
                    onChange={(e) => setOpenTime(e.target.value || '00:00')}
                    className={cn(
                      'w-full rounded-lg px-3 py-2 text-sm focus:outline-none',
                      inputCls,
                    )}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor={closeId} className="text-xs text-wtext-3 dark:text-rink-300">
                    {MESSAGES.venue.form.closeLabel}
                  </label>
                  <input
                    id={closeId}
                    type="time"
                    value={closeTime}
                    onChange={(e) => setCloseTime(e.target.value || '00:00')}
                    className={cn(
                      'w-full rounded-lg px-3 py-2 text-sm focus:outline-none',
                      inputCls,
                    )}
                  />
                </div>
              </div>
            </section>

            {/* 보유 시설 선택 */}
            <section className="space-y-3" aria-labelledby="venue-form-amenities">
              <h3
                id="venue-form-amenities"
                className="text-sm font-semibold text-wtext-2 dark:text-rink-100"
              >
                {MESSAGES.venue.form.amenitiesLabel}
              </h3>
              <p className="text-xs text-wtext-3 dark:text-rink-300">
                {MESSAGES.venue.form.amenitiesHint}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {FACILITY_META.map((meta) => {
                  const selected = amenities.includes(meta.key);
                  const label = MESSAGES.venue.facilities[meta.labelKey];
                  return (
                    <button
                      key={meta.key}
                      type="button"
                      onClick={() => toggleAmenity(meta.key)}
                      aria-pressed={selected}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors min-h-[44px]',
                        selected
                          ? iceTheme
                            ? 'bg-it-blue-50 border-it-blue-500 text-it-blue-500 dark:bg-it-blue-500/20 dark:border-it-blue-400 dark:text-it-blue-200'
                            : 'bg-blue-50 border-ice-500 text-ice-500 dark:bg-blue-900/30 dark:border-blue-400 dark:text-blue-200'
                          : iceTheme
                            ? 'bg-it-fill border-it-line-strong text-it-ink-700 hover:border-it-blue-500 dark:bg-rink-800 dark:border-rink-700 dark:text-rink-100'
                            : 'bg-wbg border-wline text-wtext-2 hover:border-ice-500 dark:bg-rink-800 dark:border-rink-700 dark:text-rink-100',
                      )}
                    >
                      <Icon
                        name={meta.icon}
                        className="text-[18px]"
                        aria-hidden="true"
                      />
                      <span className="flex-1 text-left">{label}</span>
                      {selected ? (
                        <Icon
                          name="check"
                          className="text-[18px]"
                          aria-hidden="true"
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 규격 및 요금 */}
            <section className="space-y-4" aria-labelledby="venue-form-advanced">
              <h3
                id="venue-form-advanced"
                className="text-sm font-semibold text-wtext-2 dark:text-rink-100"
              >
                {MESSAGES.venue.form.sectionAdvanced}
              </h3>
              <div className="space-y-1.5">
                <label className="text-xs text-wtext-3 dark:text-rink-300">
                  {MESSAGES.venue.form.rinkSizeLabel}
                </label>
                <p className="text-card-meta text-wtext-3 dark:text-rink-300">
                  {MESSAGES.venue.form.rinkSizeHint}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setRinkSize('')}
                    aria-pressed={rinkSize === ''}
                    className={cn(
                      'px-3 py-2 rounded-lg text-xs font-semibold border transition-colors min-h-[44px]',
                      rinkSize === ''
                        ? 'bg-wline border-wline text-wtext-1 dark:bg-rink-700 dark:border-rink-700 dark:text-white'
                        : 'bg-white dark:bg-rink-800 border-wline dark:border-rink-700 text-wtext-3 dark:text-rink-300',
                    )}
                  >
                    미지정
                  </button>
                  {RINK_SIZE_OPTIONS.map((size) => {
                    const selected = rinkSize === size;
                    return (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setRinkSize(size)}
                        aria-pressed={selected}
                        className={cn(
                          'px-3 py-2 rounded-lg text-xs font-bold border transition-colors min-h-[44px]',
                          selected
                            ? iceTheme
                              ? 'bg-it-blue-500 border-it-blue-500 text-white'
                              : 'bg-ice-500 border-ice-500 text-white'
                            : iceTheme
                              ? 'bg-white dark:bg-rink-800 border-it-line-strong dark:border-rink-700 text-it-ink-700 dark:text-rink-100 hover:border-it-blue-500'
                              : 'bg-white dark:bg-rink-800 border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100 hover:border-ice-500',
                        )}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label
                    htmlFor={capacityId}
                    className="text-xs text-wtext-3 dark:text-rink-300"
                  >
                    {MESSAGES.venue.form.capacityLabel}
                  </label>
                  <input
                    id={capacityId}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    placeholder={MESSAGES.venue.form.capacityPlaceholder}
                    className={cn(
                      'w-full rounded-lg px-3 py-3 text-sm focus:outline-none',
                      inputCls,
                    )}
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor={hourlyRateId}
                    className="text-xs text-wtext-3 dark:text-rink-300"
                  >
                    {MESSAGES.venue.form.hourlyRateLabel}
                  </label>
                  <input
                    id={hourlyRateId}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1000}
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                    placeholder={MESSAGES.venue.form.hourlyRatePlaceholder}
                    className={cn(
                      'w-full rounded-lg px-3 py-3 text-sm focus:outline-none',
                      inputCls,
                    )}
                  />
                </div>
              </div>
            </section>

            {/* 시설 안내 */}
            <section className="space-y-1.5">
              <label htmlFor={descriptionId} className="text-xs text-wtext-3 dark:text-rink-300">
                {MESSAGES.venue.form.descriptionLabel}
              </label>
              <textarea
                id={descriptionId}
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                placeholder={MESSAGES.venue.form.descriptionPlaceholder}
                className={cn(
                  'w-full rounded-lg px-4 py-3 text-sm resize-none focus:outline-none',
                  inputCls,
                )}
              />
            </section>

            {/* 에러 메시지 */}
            {(formError || error) ? (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">
                {formError ?? error}
              </div>
            ) : null}

            {/* 삭제 버튼 (edit + canDelete) */}
            {mode === 'edit' && canDelete && onDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                className="w-full border border-red-300 dark:border-red-800 text-red-600 dark:text-red-300 font-semibold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
              >
                <Icon name="delete" className="text-[18px]" aria-hidden="true" />
                {MESSAGES.venue.actions.delete}
              </button>
            ) : null}
          </div>
        </div>

        {/* 하단 고정 CTA (flex 자식 — 시트 바닥에 자연 고정) */}
        <div className="shrink-0 px-4 pt-3 pb-[calc(var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))+0.75rem)] bg-white dark:bg-rink-900 border-t border-wline-2 dark:border-rink-800">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className={cn(
              'w-full text-white font-bold py-3.5 rounded-xl shadow-md transition-colors motion-reduce:transition-none flex items-center justify-center gap-2 disabled:opacity-60',
              iceTheme
                ? 'bg-it-blue-500 hover:bg-it-blue-600'
                : 'bg-ice-500 hover:bg-ice-700',
            )}
          >
            <Icon name="check" className="text-[20px]" aria-hidden="true" />
            {isSaving
              ? MESSAGES.venue.result.saving
              : MESSAGES.venue.actions.saveChanges}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default VenueFormSheet;
