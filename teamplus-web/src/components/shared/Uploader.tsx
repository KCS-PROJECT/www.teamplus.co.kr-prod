'use client';

/**
 * Uploader — TEAMPLUS 통합 업로더 (impeccable UX, Phase 3.1 SPEC)
 *
 * SPEC_FILEUPLOAD_IMPECCABLE_2026-05-20 §5.1 / §6 준수.
 *
 * 4 가지 variant 를 단일 컴포넌트로 통합 (DRY · 1 SoT):
 *   - `file`       : 드롭존 + 세로 리스트 (FileUploader 대체)
 *   - `image`      : 드롭존 + 정사각 그리드 + Lightbox (ImageUploader 대체)
 *   - `avatar`     : 단일 원형 + 카메라 배지 (AvatarUploader 대체)
 *   - `photo-grid` : 드롭존 + 4-col 그리드 (PhotoUploader 대체)
 *
 * Impeccable UX:
 *   - Per-entry 진행률 — `uploadFile()` 의 onProgress 를 entry id 별로 라우팅 (동시 N개 정확)
 *   - URL.createObjectURL revoke 정확 — entry add/remove/unmount 시점 모두 처리
 *   - 드래그 시 dropzone `scale-[1.02]` + ice-500 border (motion-safe + motion-reduce 대응)
 *   - 진행률 바 `transition-[width] duration-150 ease-ios`
 *   - 성공 체크 pop-in (200ms, scale 0 → 1.1 → 1.0)
 *   - 에러 shake (60ms × 3회)
 *   - ARIA: role / aria-live / aria-busy / aria-valuenow / aria-describedby
 *   - 키보드 접근성: Enter/Space 로 dropzone, Tab 으로 entry 네비
 *   - (child) 변형: 72×72dp 터치 / 7:1 대비 / 18px+ 폰트 / 친숙한 라벨
 *   - 실시간 동기화 (enableRealtimeSync=true 시 useFileUploadSync 자동 구독)
 *
 * 절대 규칙:
 *   - ❌ bg-gradient-to-* · backdrop-blur-* (헤더 외) · shadow-*-500/30 — 금지
 *   - ❌ 한글 하드코딩 (MESSAGES.upload.* 사용)
 *   - ❌ AppBar/BottomNav 영향 — body 영역만
 */

import Image from 'next/image';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';

import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import { devError } from '@/lib/logger';
import { resolveImageSrc } from '@/lib/image-url';
import {
  UploadCancelledError,
  UploadNetworkError,
  UploadValidationError,
  uploadFile,
  validateFile,
  validateFileCount,
} from '@/services/upload.service';
import { UPLOAD_LIMITS } from '@/types/file';
import type {
  UploadCategory,
  UploadedFile,
  UploadProgress,
} from '@/types/file';
import { useFileUploadSync } from '@/hooks/useFileUploadSync';

import { ImageLightbox } from './ImageLightbox';

// ──────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────

export type UploaderVariant = 'file' | 'image' | 'avatar' | 'photo-grid';

export interface UploaderProps {
  /** 시각 표현 — UI 변형 (업로드 동작은 동일) */
  variant: UploaderVariant;
  /** 업로드 카테고리 — Backend `UploadCategory` enum 과 일치 */
  category: UploadCategory;
  /** 최대 파일 개수 (기본: UPLOAD_LIMITS[category].maxCount, avatar 는 1 강제) */
  maxFiles?: number;
  /** 참조 엔티티 타입 (예: 'notice', 'gallery') */
  refType?: string;
  /** 참조 엔티티 ID */
  refId?: string;
  /** 업로드 완료 콜백 — 성공 시 항상 호출 */
  onUploaded?: (files: UploadedFile[]) => void;
  /** 업로드 실패 콜백 (옵션) */
  onError?: (error: Error) => void;
  /**
   * 실시간 동기화 활성화 (기본 false).
   * true 시 `useFileUploadSync` 자동 구독 — 다른 클라이언트의 file:created/deleted
   * 이벤트를 받아 onUploaded 콜백을 자동 호출 (refType + refId 필수).
   */
  enableRealtimeSync?: boolean;
  /** WCAG AAA child 변형 (72×72dp / 7:1 / 18px+) */
  childMode?: boolean;
  /**
   * 권리 보유 고지 표시 (기본 false).
   * UGC 콘텐츠(갤러리·공지 등) 업로드 시 저작권·상표·초상권 안내를 드롭존 하단에 노출.
   * iOS 5.2 / AOS #9888072(지식재산권) 대응 — 약관 동의를 보조하는 가벼운 인앱 고지.
   */
  rightsNotice?: boolean;
  /** 접근성 라벨 / 표시 라벨 */
  label?: string;
  className?: string;

  // ── avatar 전용 ──
  /** 현재 아바타 URL (avatar variant 만) */
  currentUrl?: string | null;
  /** 원형 크기 px (avatar variant 만, 기본 96) */
  size?: number;
  /**
   * Placeholder 아이콘 (Material Symbols 이름, 예: 'sports_hockey').
   * 미지정 시 사람 형태 SVG 사용 (사용자 프로필 사진 기본값).
   * 팀 로고 등 비-인물 컨텍스트에서는 'sports_hockey' / 'image' 등 권장.
   */
  placeholderIcon?: string;
  /**
   * Avatar variant 의 컨테이너 모양 (avatar variant 만).
   *  - 'circle' (기본) — 사용자 프로필 사진 등 인물 아바타.
   *  - 'square' — 팀 로고, 클럽 엠블럼 등 비-인물 객체 (rounded-w-2xl · 28px).
   */
  shape?: 'circle' | 'square';
}

// ──────────────────────────────────────────────────────────────────
// 내부 타입
// ──────────────────────────────────────────────────────────────────

type EntryStatus = 'pending' | 'uploading' | 'success' | 'error';

interface UploaderEntry {
  id: string;
  file: File;
  /** image/photo-grid/avatar 변형은 미리보기 URL (file 변형은 undefined) */
  previewUrl?: string;
  percent: number;
  status: EntryStatus;
  error?: string;
  result?: UploadedFile;
  abortController?: AbortController;
  /** pop-in 애니메이션 트리거 (성공 직후 1회) */
  showSuccessAnimation?: boolean;
  /** shake 애니메이션 트리거 (에러 직후 1회) */
  showErrorAnimation?: boolean;
}

// ──────────────────────────────────────────────────────────────────
// 유틸리티
// ──────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function makeEntryId(): string {
  // crypto.randomUUID 가 없는 구형 환경 폴백
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 변형별 미리보기 필요 여부 */
function variantNeedsPreview(variant: UploaderVariant): boolean {
  return variant !== 'file';
}

// ──────────────────────────────────────────────────────────────────
// Uploader
// ──────────────────────────────────────────────────────────────────

export function Uploader({
  variant,
  category,
  maxFiles,
  refType,
  refId,
  onUploaded,
  onError,
  enableRealtimeSync = false,
  childMode = false,
  rightsNotice = false,
  label,
  className,
  currentUrl,
  size = 96,
  placeholderIcon,
  shape = 'circle',
}: UploaderProps) {
  // avatar 는 단일 파일 강제
  const limit = UPLOAD_LIMITS[category];
  const effectiveMaxFiles =
    variant === 'avatar'
      ? 1
      : Math.min(maxFiles ?? limit.maxCount, limit.maxCount);

  const inputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<UploaderEntry[]>([]);
  // [추가 2026-05-23 race fix] currentUrl useEffect 가 entries 변경마다 트리거되는 것을
  //   방지하기 위해 ref 로 분리. 항상 최신 entries 를 가리키도록 매 렌더에서 갱신.
  const entriesRef = useRef<UploaderEntry[]>(entries);
  entriesRef.current = entries;
  const [isDragOver, setIsDragOver] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // avatar 전용 — 현재 표시 URL (서버 URL or objectURL)
  //   서버 URL 은 상대 경로(`/uploads/...`)가 올 수 있으므로 resolveImageSrc 로 절대화.
  //   (Web 은 5001 포트, backend 는 5003 — 상대 경로 그대로 표시 시 404 발생)
  //   data:/blob:/http: URL 은 resolveImageSrc 가 그대로 통과시킴 — objectURL 미리보기 호환.
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    resolveImageSrc(currentUrl ?? null) ?? null,
  );
  const [globalError, setGlobalError] = useState<string | null>(null);

  // ── 실시간 동기화 (다른 클라이언트의 업로드/삭제 반영) ──
  // 옵션이 꺼져 있으면 hook 은 enabled=false 로 no-op
  useFileUploadSync({
    refType: refType ?? '',
    refId: refId ?? '',
    enabled: enableRealtimeSync && !!refType && !!refId,
    onFilesChanged: (event) => {
      // 'file:created' 만 onUploaded 콜백으로 전파.
      // 'file:updated' / 'file:deleted' 는 호출처가 별도 처리 (수업/공지 페이지 등 refetch)
      //
      // websocket-bridge 의 `files` 는 백엔드 매퍼 SoT 와 1:1 대응하는
      // 느슨한 Record<string, unknown>[] 타입 (Bridge 디커플링 의도).
      // 본 컴포넌트는 동일 FileResponseDto 계약을 신뢰하므로 UploadedFile[] 로 단언.
      if (event.type === 'file:created' && event.files.length > 0) {
        onUploaded?.(event.files as unknown as UploadedFile[]);
      }
    },
  });

  // ── 외부 currentUrl 변경 반영 (avatar) ──
  // [수정 2026-05-23 race fix] 사용자 보고: 업로드 후 미리보기가 잠깐 보였다 원복.
  //   기존: deps 에 `entries` 포함 → 업로드 사이클 중 entries 변경(pending → uploading →
  //         success/error) 마다 useEffect 재트리거 → 성공 직후 부모(`setLogoUrl(file.url)`)
  //         가 처리되기 전에 currentUrl(이전 값) 으로 setAvatarPreview 가 호출되어 원복.
  //   변경: entriesRef 로 deps 격리 + `entries.length > 0` 가드. 사용자가 파일과
  //         인터랙션을 시작한 후엔 본 컴포넌트가 직접 preview 를 관리 (line 325 의
  //         setAvatarPreview(server URL) 가 단일 진실원).
  useEffect(() => {
    if (variant !== 'avatar') return;
    if (entriesRef.current.length > 0) return;
    setAvatarPreview(resolveImageSrc(currentUrl ?? null) ?? null);
  }, [variant, currentUrl]);

  // ── 언마운트 시 모든 objectURL 정리 ──
  useEffect(() => {
    return () => {
      // 컴포넌트 unmount: 모든 진행 중 업로드 abort + URL revoke
      entries.forEach((e) => {
        if (e.previewUrl) URL.revokeObjectURL(e.previewUrl);
        e.abortController?.abort();
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    };
    // 의도적 — 마운트/언마운트 1회만. entries 변경 시 revoke 는
    // removeEntry / 업로드 성공 시 명시적으로 호출 (아래 참조).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remaining = useMemo(
    () => Math.max(0, effectiveMaxFiles - entries.length),
    [effectiveMaxFiles, entries.length],
  );

  // ── 진행률 업데이트 (entry id 기반) ──
  const updateEntryProgress = useCallback(
    (id: string, progress: UploadProgress) => {
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, percent: progress.percent } : e)),
      );
    },
    [],
  );

  const translateError = useCallback((err: unknown): string => {
    if (err instanceof UploadCancelledError) return MESSAGES.upload.cancelled;
    if (err instanceof UploadValidationError) return err.message;
    if (err instanceof UploadNetworkError) {
      return err.message || MESSAGES.upload.failed;
    }
    return MESSAGES.upload.failed;
  }, []);

  // ── 단일 entry 업로드 ──
  const uploadEntry = useCallback(
    async (entry: UploaderEntry) => {
      const controller = new AbortController();
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entry.id
            ? {
                ...e,
                status: 'uploading',
                percent: 0,
                error: undefined,
                abortController: controller,
              }
            : e,
        ),
      );

      try {
        const result = await uploadFile(entry.file, {
          category,
          refType,
          refId,
          signal: controller.signal,
          onProgress: (p) => updateEntryProgress(entry.id, p),
        });

        setEntries((prev) =>
          prev.map((e) =>
            e.id === entry.id
              ? {
                  ...e,
                  status: 'success',
                  percent: 100,
                  result,
                  showSuccessAnimation: true,
                  abortController: undefined,
                }
              : e,
          ),
        );

        // pop-in 애니메이션 종료 후 플래그 해제 (재렌더 영향 0)
        setTimeout(() => {
          setEntries((prev) =>
            prev.map((e) =>
              e.id === entry.id ? { ...e, showSuccessAnimation: false } : e,
            ),
          );
        }, 350);

        // avatar variant: 성공 시 서버 URL 로 교체 + objectURL revoke
        //   result.url 은 backend 상대 경로 — resolveImageSrc 로 절대화하지 않으면
        //   Web(5001) → backend(5003) 호스트 차이로 404. (2026-05-23 hotfix)
        if (variant === 'avatar') {
          setAvatarPreview(resolveImageSrc(result.url) ?? null);
          if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
        }

        onUploaded?.([result]);
      } catch (err) {
        if (controller.signal.aborted) {
          // 사용자가 취소한 경우 entry 제거 (avatar 는 롤백)
          if (variant === 'avatar') {
            setAvatarPreview(resolveImageSrc(currentUrl ?? null) ?? null);
            if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
            setEntries((prev) => prev.filter((e) => e.id !== entry.id));
          }
          return;
        }
        devError('[Uploader] uploadEntry failed', err);
        const message = translateError(err);
        setEntries((prev) =>
          prev.map((e) =>
            e.id === entry.id
              ? {
                  ...e,
                  status: 'error',
                  percent: 0,
                  error: message,
                  showErrorAnimation: true,
                  abortController: undefined,
                }
              : e,
          ),
        );
        // shake 애니메이션 종료 (3회 × 60ms = 180ms + margin)
        setTimeout(() => {
          setEntries((prev) =>
            prev.map((e) =>
              e.id === entry.id ? { ...e, showErrorAnimation: false } : e,
            ),
          );
        }, 240);

        // avatar variant: 실패 시 이전 상태로 롤백
        if (variant === 'avatar') {
          setAvatarPreview(resolveImageSrc(currentUrl ?? null) ?? null);
          if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
        }

        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [
      category,
      refType,
      refId,
      variant,
      currentUrl,
      onUploaded,
      onError,
      translateError,
      updateEntryProgress,
    ],
  );

  // ── 신규 파일 추가 (validate + dedupe + queue) ──
  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      setGlobalError(null);

      const incomingArray = Array.from(incoming);
      if (incomingArray.length === 0) return;

      // SoT — 카운트 사전 검증
      try {
        validateFileCount(incomingArray.length, category, entries.length);
      } catch (err) {
        const message = translateError(err);
        setGlobalError(message);
        onError?.(err instanceof Error ? err : new Error(message));
        return;
      }

      const accepted: File[] = [];
      const rejectedMessages: string[] = [];

      for (const f of incomingArray) {
        if (accepted.length >= remaining) {
          rejectedMessages.push(MESSAGES.upload.tooMany(effectiveMaxFiles));
          break;
        }
        try {
          validateFile(f, category);
          accepted.push(f);
        } catch (err) {
          rejectedMessages.push(
            `${f.name}: ${
              err instanceof Error ? err.message : MESSAGES.upload.invalidType
            }`,
          );
        }
      }

      if (rejectedMessages.length > 0) {
        setGlobalError(rejectedMessages[0] ?? null);
      }

      // avatar 변형은 단일 슬롯 — 기존 진행 중 entry 가 있으면 abort + 교체
      if (variant === 'avatar' && accepted.length > 0) {
        setEntries((prev) => {
          prev.forEach((e) => {
            e.abortController?.abort();
            if (e.previewUrl) URL.revokeObjectURL(e.previewUrl);
          });
          return [];
        });
      }

      const withPreview = variantNeedsPreview(variant);
      const newEntries: UploaderEntry[] = accepted.map((file) => ({
        id: makeEntryId(),
        file,
        previewUrl: withPreview ? URL.createObjectURL(file) : undefined,
        percent: 0,
        status: 'pending' as const,
      }));

      if (newEntries.length === 0) return;

      // avatar 변형: 낙관적 미리보기 즉시 표시
      if (variant === 'avatar' && newEntries[0]?.previewUrl) {
        setAvatarPreview(newEntries[0].previewUrl);
      }

      setEntries((prev) => [...prev, ...newEntries]);

      // 병렬 업로드 — 각 entry 가 자신만의 AbortController + onProgress 보유
      for (const entry of newEntries) {
        void uploadEntry(entry);
      }
    },
    [
      category,
      entries.length,
      effectiveMaxFiles,
      remaining,
      variant,
      uploadEntry,
      onError,
      translateError,
    ],
  );

  // ── 이벤트 핸들러 ──

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles],
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        addFiles(e.target.files);
      }
      // 동일 파일 재선택 허용
      e.target.value = '';
    },
    [addFiles],
  );

  const handleDropZoneKey = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        inputRef.current?.click();
      }
    },
    [],
  );

  const removeEntry = useCallback(
    (id: string) => {
      setEntries((prev) => {
        const target = prev.find((e) => e.id === id);
        if (target) {
          target.abortController?.abort();
          if (target.previewUrl) URL.revokeObjectURL(target.previewUrl);
        }
        return prev.filter((e) => e.id !== id);
      });

      // avatar 변형: 단일 슬롯 비우면 currentUrl 로 복귀
      if (variant === 'avatar') {
        setAvatarPreview(resolveImageSrc(currentUrl ?? null) ?? null);
      }
    },
    [variant, currentUrl],
  );

  const retryEntry = useCallback(
    (entry: UploaderEntry) => {
      void uploadEntry(entry);
    },
    [uploadEntry],
  );

  const cancelAll = useCallback(() => {
    setEntries((prev) => {
      prev.forEach((e) => e.abortController?.abort());
      return prev;
    });
  }, []);

  const canAdd = remaining > 0;
  const isAnyUploading = entries.some((e) => e.status === 'uploading');
  const accessibleLabel = label ?? defaultLabelFor(variant, childMode);

  // ──────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────

  // avatar 는 완전히 다른 레이아웃 → 별도 분기
  if (variant === 'avatar') {
    return (
      <AvatarVariant
        size={size}
        childMode={childMode}
        className={className}
        accessibleLabel={accessibleLabel}
        preview={avatarPreview}
        isUploading={isAnyUploading}
        entries={entries}
        inputRef={inputRef}
        accept={limit.accept}
        onFileChange={handleFileChange}
        onPick={() => inputRef.current?.click()}
        globalError={globalError}
        placeholderIcon={placeholderIcon}
        shape={shape}
      />
    );
  }

  // file / image / photo-grid 공통 레이아웃
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <KeyframeStyles />

      {/* 드롭존 */}
      {canAdd && (
        <div
          role="button"
          tabIndex={0}
          aria-label={`${accessibleLabel} — ${MESSAGES.upload.dragHint} (${entries.length}/${effectiveMaxFiles})`}
          aria-describedby="uploader-hint"
          onClick={() => inputRef.current?.click()}
          onKeyDown={handleDropZoneKey}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            'flex flex-col items-center justify-center gap-2',
            'rounded-xl border-2 border-dashed cursor-pointer',
            'px-4 py-8',
            // motion-safe: 드래그 시 살짝 확대 (ease-ios-spring)
            'transition-[transform,border-color,background-color] duration-200 ease-ios-spring',
            'motion-reduce:transition-none motion-reduce:transform-none',
            isDragOver
              ? 'border-ice-500 bg-ice-500/5 dark:bg-ice-500/10 scale-[1.02]'
              : 'border-wline dark:border-rink-700 bg-wbg dark:bg-rink-800/50',
            'hover:border-ice-500 hover:bg-ice-500/5 dark:hover:bg-ice-500/10',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40',
            childMode && 'min-h-[120px] py-10',
          )}
        >
          <span
            className={cn(
              'material-symbols-outlined text-wtext-3 dark:text-rink-300',
              childMode ? 'text-5xl' : 'text-3xl',
            )}
            aria-hidden="true"
          >
            {variant === 'file' ? 'upload_file' : 'add_photo_alternate'}
          </span>
          <span
            className={cn(
              'font-medium text-wtext-2 dark:text-rink-100',
              childMode ? 'text-lg' : 'text-sm',
            )}
          >
            {childMode
              ? variant === 'file'
                ? MESSAGES.upload.fileAddChild
                : MESSAGES.upload.imageAddChild
              : MESSAGES.upload.dragHint}
          </span>
          <span
            id="uploader-hint"
            className={cn(
              'text-wtext-3 dark:text-rink-300',
              childMode ? 'text-base' : 'text-xs',
            )}
          >
            {limit.label} · 최대 {Math.floor(limit.maxSize / 1024 / 1024)}MB · {entries.length}/{effectiveMaxFiles}
          </span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={limit.accept}
        multiple={effectiveMaxFiles > 1}
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      {rightsNotice && (
        <p className="text-[11px] leading-relaxed text-wtext-3 dark:text-rink-300">
          {MESSAGES.upload.rightsNotice}
        </p>
      )}

      {globalError && (
        <p
          role="alert"
          className="text-sm font-medium text-red-600 dark:text-red-400"
        >
          {globalError}
        </p>
      )}

      {/* 리스트 / 그리드 — variant 별 분기 */}
      {entries.length > 0 && (
        <>
          {variant === 'file' && (
            <FileListVariant
              entries={entries}
              childMode={childMode}
              onRemove={removeEntry}
              onRetry={retryEntry}
            />
          )}
          {(variant === 'image' || variant === 'photo-grid') && (
            <GridVariant
              variant={variant}
              entries={entries}
              childMode={childMode}
              onRemove={removeEntry}
              onRetry={retryEntry}
              onPreview={(idx) => setLightboxIndex(idx)}
            />
          )}
        </>
      )}

      {/* 전체 취소 */}
      {isAnyUploading && (
        <button
          type="button"
          onClick={cancelAll}
          className={cn(
            'self-start rounded-md px-3 py-1.5 text-sm font-medium',
            'text-wtext-2 hover:bg-wline-2',
            'dark:text-rink-100 dark:hover:bg-rink-700',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40',
            'transition-colors motion-reduce:transition-none',
          )}
        >
          {MESSAGES.upload.cancelAction}
        </button>
      )}

      {/* Lightbox (image/photo-grid 만) */}
      {lightboxIndex !== null &&
        entries[lightboxIndex]?.previewUrl &&
        (variant === 'image' || variant === 'photo-grid') && (
          <ImageLightbox
            isOpen
            onClose={() => setLightboxIndex(null)}
            src={
              entries[lightboxIndex].result?.url ??
              entries[lightboxIndex].previewUrl!
            }
            alt={MESSAGES.upload.preview(lightboxIndex + 1)}
          />
        )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// 변형 — File List
// ──────────────────────────────────────────────────────────────────

interface FileListVariantProps {
  entries: UploaderEntry[];
  childMode: boolean;
  onRemove: (id: string) => void;
  onRetry: (entry: UploaderEntry) => void;
}

function FileListVariant({
  entries,
  childMode,
  onRemove,
  onRetry,
}: FileListVariantProps) {
  return (
    <ul className="flex flex-col gap-2" aria-label={MESSAGES.upload.fileListLabel}>
      {entries.map((entry, index) => (
        <li
          key={entry.id}
          aria-busy={entry.status === 'uploading'}
          className={cn(
            'flex flex-col gap-2 rounded-lg border p-3',
            'bg-white dark:bg-rink-800',
            entry.status === 'error'
              ? 'border-red-300 dark:border-red-700'
              : 'border-wline dark:border-rink-700',
            entry.showErrorAnimation && 'animate-uploader-shake',
            'transition-colors motion-reduce:transition-none',
          )}
        >
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'material-symbols-outlined',
                childMode ? 'text-3xl' : 'text-2xl',
                entry.status === 'success'
                  ? 'text-green-600 dark:text-green-400'
                  : entry.status === 'error'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-wtext-3 dark:text-rink-300',
                entry.showSuccessAnimation && 'animate-uploader-pop-in',
              )}
              aria-hidden="true"
            >
              {entry.status === 'success'
                ? 'check_circle'
                : entry.status === 'error'
                  ? 'error'
                  : 'description'}
            </span>
            <div className="flex flex-1 flex-col min-w-0">
              <span
                className={cn(
                  'font-medium text-wtext-1 dark:text-white truncate',
                  childMode ? 'text-base' : 'text-sm',
                )}
              >
                {entry.file.name}
              </span>
              <span
                className={cn(
                  'text-wtext-3 dark:text-rink-300 font-num tabular-nums',
                  childMode ? 'text-sm' : 'text-xs',
                )}
              >
                {formatSize(entry.file.size)}
                {entry.status === 'uploading' &&
                  ` · ${MESSAGES.upload.progress(entry.percent)}`}
                {entry.status === 'success' &&
                  ` · ${MESSAGES.upload.success}`}
                {entry.status === 'error' && entry.error
                  ? ` · ${entry.error}`
                  : ''}
              </span>
            </div>

            <div className="flex items-center gap-1">
              {entry.status === 'error' && (
                <button
                  type="button"
                  onClick={() => onRetry(entry)}
                  aria-label={MESSAGES.upload.retry}
                  className={cn(
                    'rounded-md font-medium',
                    // WCAG AAA: childMode 시 보조 어포던스도 72×72dp 최소 터치 영역
                    childMode
                      ? 'min-h-[72px] min-w-[72px] px-4 py-3 text-base'
                      : 'px-2 py-1 text-xs',
                    'text-ice-500 hover:bg-ice-500/10 dark:hover:bg-ice-500/20',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40',
                    'transition-colors motion-reduce:transition-none',
                  )}
                >
                  {MESSAGES.upload.retry}
                </button>
              )}
              <button
                type="button"
                onClick={() => onRemove(entry.id)}
                aria-label={MESSAGES.upload.removeLabel(index + 1)}
                className={cn(
                  'flex items-center justify-center rounded-md',
                  // WCAG AAA: childMode 시 72×72dp 최소 터치 영역
                  childMode
                    ? 'min-h-[72px] min-w-[72px]'
                    : 'w-8 h-8',
                  'text-wtext-3 hover:text-wtext-1 hover:bg-wline-2',
                  'dark:text-rink-300 dark:hover:text-white dark:hover:bg-rink-700',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40',
                  'transition-colors motion-reduce:transition-none',
                )}
              >
                <span
                  className={cn(
                    'material-symbols-outlined',
                    childMode ? 'text-2xl' : 'text-lg',
                  )}
                  aria-hidden="true"
                >
                  close
                </span>
              </button>
            </div>
          </div>

          {entry.status === 'uploading' && (
            <div
              role="progressbar"
              aria-label={`${entry.file.name} ${MESSAGES.upload.progress(entry.percent)}`}
              aria-valuenow={entry.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-1.5 w-full rounded-full bg-wline dark:bg-rink-700 overflow-hidden"
            >
              <div
                className={cn(
                  'h-full rounded-full bg-ice-500',
                  'transition-[width] duration-150 ease-ios',
                  'motion-reduce:transition-none',
                )}
                style={{ width: `${entry.percent}%` }}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

// ──────────────────────────────────────────────────────────────────
// 변형 — Grid (image / photo-grid)
// ──────────────────────────────────────────────────────────────────

interface GridVariantProps {
  variant: 'image' | 'photo-grid';
  entries: UploaderEntry[];
  childMode: boolean;
  onRemove: (id: string) => void;
  onRetry: (entry: UploaderEntry) => void;
  onPreview: (index: number) => void;
}

function GridVariant({
  variant,
  entries,
  childMode,
  onRemove,
  onRetry,
  onPreview,
}: GridVariantProps) {
  const cols =
    variant === 'photo-grid'
      ? 'grid-cols-4'
      : 'grid-cols-3 sm:grid-cols-4';

  return (
    <div
      className={cn('grid gap-2', cols)}
      role="list"
      aria-label={MESSAGES.upload.imageGridLabel}
    >
      {entries.map((entry, index) => (
        <div
          key={entry.id}
          role="listitem"
          aria-busy={entry.status === 'uploading'}
          className={cn(
            'relative aspect-square rounded-lg overflow-hidden',
            'bg-wline-2 dark:bg-rink-700',
            entry.status === 'error' && 'ring-2 ring-red-500',
            entry.showErrorAnimation && 'animate-uploader-shake',
            'transition-colors motion-reduce:transition-none',
            childMode && 'min-h-[96px] min-w-[96px]',
          )}
        >
          {/* 미리보기 — 업로드 완료 후에만 lightbox 활성화 */}
          {entry.previewUrl && entry.status === 'success' ? (
            <button
              type="button"
              onClick={() => onPreview(index)}
              aria-label={`${MESSAGES.upload.preview(index + 1)} 크게 보기`}
              className={cn(
                'absolute inset-0 h-full w-full',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40',
                'hover:opacity-95 active:opacity-90',
                'transition-opacity duration-150 motion-reduce:transition-none',
              )}
            >
              <Image
                src={entry.result?.thumbUrl ?? entry.previewUrl}
                alt={MESSAGES.upload.preview(index + 1)}
                fill
                className="object-cover pointer-events-none"
                unoptimized
              />
            </button>
          ) : entry.previewUrl ? (
            <Image
              src={entry.previewUrl}
              alt={MESSAGES.upload.preview(index + 1)}
              fill
              className="object-cover"
              unoptimized
            />
          ) : null}

          {/* 진행률 오버레이 */}
          {entry.status === 'uploading' && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/50"
              aria-live="polite"
            >
              <span
                className={cn(
                  'font-medium text-white font-num tabular-nums',
                  childMode ? 'text-base' : 'text-xs',
                )}
              >
                {entry.percent}%
              </span>
              <div
                role="progressbar"
                aria-label={MESSAGES.upload.progress(entry.percent)}
                aria-valuenow={entry.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                className="mt-1 h-1 w-3/4 rounded-full bg-white/30 overflow-hidden"
              >
                <div
                  className={cn(
                    'h-full rounded-full bg-white',
                    'transition-[width] duration-150 ease-ios',
                    'motion-reduce:transition-none',
                  )}
                  style={{ width: `${entry.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* 성공 뱃지 — pop-in 애니메이션 */}
          {entry.status === 'success' && (
            <div
              className={cn(
                'absolute bottom-1 left-1 rounded-full bg-green-600 p-1 shadow-sm',
                entry.showSuccessAnimation && 'animate-uploader-pop-in',
              )}
            >
              <span
                className="material-symbols-outlined text-white text-xs block"
                aria-hidden="true"
              >
                check
              </span>
              <span className="sr-only">{MESSAGES.upload.successBadge}</span>
            </div>
          )}

          {/* 에러 상태 — 재시도 버튼 */}
          {entry.status === 'error' && (
            <button
              type="button"
              onClick={() => onRetry(entry)}
              aria-label={MESSAGES.upload.retry}
              className={cn(
                'absolute inset-0 flex flex-col items-center justify-center gap-1',
                'bg-red-600/70 text-white',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-white',
                'hover:bg-red-600/90 transition-colors motion-reduce:transition-none',
              )}
            >
              <span
                className={cn(
                  'material-symbols-outlined',
                  childMode ? 'text-3xl' : 'text-2xl',
                )}
                aria-hidden="true"
              >
                refresh
              </span>
              <span
                className={cn(
                  'font-medium',
                  childMode ? 'text-base' : 'text-xs',
                )}
              >
                {MESSAGES.upload.retry}
              </span>
            </button>
          )}

          {/* 삭제 버튼 — childMode 시 WCAG AAA 72×72dp 보장 */}
          <button
            type="button"
            onClick={() => onRemove(entry.id)}
            aria-label={MESSAGES.upload.removeLabel(index + 1)}
            className={cn(
              'absolute flex items-center justify-center rounded-full',
              // WCAG AAA: childMode 시 72×72dp 최소 터치 영역. 우상단 -translate로 시각 무게 조정.
              childMode
                ? 'top-0 right-0 min-h-[72px] min-w-[72px] translate-x-2 -translate-y-2'
                : 'top-1 right-1 w-6 h-6',
              'bg-black/50 text-white hover:bg-black/70',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-white',
              'transition-colors duration-150 motion-reduce:transition-none',
            )}
          >
            <span
              className={cn(
                'material-symbols-outlined',
                childMode ? 'text-3xl' : 'text-sm',
              )}
              aria-hidden="true"
            >
              close
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// 변형 — Avatar (단일 원형)
// ──────────────────────────────────────────────────────────────────

interface AvatarVariantProps {
  size: number;
  childMode: boolean;
  className?: string;
  accessibleLabel: string;
  preview: string | null;
  isUploading: boolean;
  entries: UploaderEntry[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  accept: string;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onPick: () => void;
  globalError: string | null;
  /**
   * Placeholder 아이콘 (Material Symbols 이름).
   * 미지정 시 사람 형태 SVG (기본 — 사용자 프로필).
   */
  placeholderIcon?: string;
  /** 컨테이너 모양 — 'circle'(기본) | 'square'(팀 로고 등 비-인물) */
  shape?: 'circle' | 'square';
}

function AvatarVariant({
  size,
  childMode,
  className,
  accessibleLabel,
  preview,
  isUploading,
  entries,
  inputRef,
  accept,
  onFileChange,
  onPick,
  globalError,
  placeholderIcon,
  shape = 'circle',
}: AvatarVariantProps) {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const effectiveSize = childMode ? Math.max(size, 96) : size;
  const activeEntry = entries[0];
  const progress = activeEntry?.percent ?? 0;
  const displayError = globalError ?? activeEntry?.error;

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <KeyframeStyles />
      <div className="relative" style={{ width: effectiveSize, height: effectiveSize }}>
        <button
          type="button"
          onClick={onPick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onPick();
            }
          }}
          disabled={isUploading}
          aria-label={accessibleLabel}
          aria-busy={isUploading}
          className={cn(
            'relative overflow-hidden',
            // [추가 2026-05-23] shape prop 분기 — 'square' 는 팀 로고 등 비-인물 컨텍스트.
            //  TEAMPLUS 디자인 토큰 `rounded-w-2xl`(28px) 사용 — team detail Hero 로고 박스와 일관.
            shape === 'square' ? 'rounded-w-2xl' : 'rounded-full',
            'border border-wline-2 dark:border-rink-700',
            'bg-wbg dark:bg-rink-900',
            'focus:outline-none focus-visible:ring-4 focus-visible:ring-ice-500/40',
            'transition-[box-shadow,border-color] duration-150 motion-reduce:transition-none',
            isUploading ? 'cursor-wait' : 'cursor-pointer hover:border-ice-500',
            activeEntry?.showErrorAnimation && 'animate-uploader-shake',
          )}
          style={{ width: effectiveSize, height: effectiveSize }}
        >
          {preview ? (
            <Image
              // key={preview} — src 변경 시 강제 재마운트하여 새 URL 즉시 fetch.
              //   (Next/Image 가 같은 컴포넌트 instance 에서 src 만 갱신하면 일부 브라우저가
              //    이전 캐시·로딩 중 이미지를 그대로 보여주는 문제 방어.)
              key={preview}
              src={preview}
              alt={MESSAGES.upload.avatarCurrentAlt}
              fill
              className="object-cover"
              sizes={`${effectiveSize}px`}
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-wtext-4 dark:text-rink-400">
              {placeholderIcon ? (
                // [추가 2026-05-23] 비-인물 컨텍스트(팀 로고 등)에서는 Material Symbols 아이콘 사용.
                //  사용자 보고: 팀 로고 placeholder 가 사람 모양으로 표시되어 의미 부정합 → prop 분기.
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: Math.round(effectiveSize * 0.48) }}
                  aria-hidden="true"
                >
                  {placeholderIcon}
                </span>
              ) : (
                <svg
                  width={Math.round(effectiveSize * 0.42)}
                  height={Math.round(effectiveSize * 0.42)}
                  viewBox="0 0 40 40"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle cx="20" cy="15" r="6" stroke="currentColor" strokeWidth={1.8} />
                  <path
                    d="M6 34c2-6 7-9 14-9s12 3 14 9"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </div>
          )}

          {/* 업로드 진행 오버레이 */}
          {isUploading && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/55"
              aria-live="polite"
            >
              <span
                className={cn(
                  'font-semibold text-white font-num tabular-nums',
                  childMode ? 'text-lg' : 'text-sm',
                )}
              >
                {progress}%
              </span>
              <div
                role="progressbar"
                aria-label={MESSAGES.upload.progress(progress)}
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                className="mt-1 h-1 w-3/4 rounded-full bg-white/30 overflow-hidden"
              >
                <div
                  className={cn(
                    'h-full rounded-full bg-white',
                    'transition-[width] duration-150 ease-ios',
                    'motion-reduce:transition-none',
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* 성공 pop-in 체크 */}
          {activeEntry?.showSuccessAnimation && (
            <span
              className={cn(
                'absolute inset-0 flex items-center justify-center bg-black/30',
                'animate-uploader-pop-in pointer-events-none',
              )}
              aria-hidden="true"
            >
              <span className="material-symbols-outlined text-white text-4xl">
                check_circle
              </span>
            </span>
          )}
        </button>

        {/* 카메라 배지 — button 외부 (overflow-hidden 영향 0) */}
        {!isUploading && (
          <span
            className={cn(
              'pointer-events-none absolute bottom-1 right-0',
              'flex items-center justify-center rounded-full',
              'bg-ice-500 text-white',
              'border-[3px] border-white dark:border-rink-900',
              'shadow-md',
              childMode ? 'h-10 w-10' : 'h-[30px] w-[30px]',
            )}
            aria-hidden="true"
          >
            <svg
              width={childMode ? 18 : 14}
              height={childMode ? 18 : 14}
              viewBox="0 0 14 14"
              fill="none"
            >
              <path
                d="M3 5.5h2L6 4h2l1 1.5h2A1.5 1.5 0 0112.5 7v3A1.5 1.5 0 0111 11.5H3A1.5 1.5 0 011.5 10V7A1.5 1.5 0 013 5.5z"
                stroke="currentColor"
                strokeWidth={1.3}
                strokeLinejoin="round"
              />
              <circle cx="7" cy="8.5" r="1.8" stroke="currentColor" strokeWidth={1.3} />
            </svg>
          </span>
        )}

        {/* 크게 보기 (preview 있을 때만) */}
        {preview && !isUploading && (
          <button
            type="button"
            onClick={() => setIsLightboxOpen(true)}
            aria-label={MESSAGES.upload.avatarOpenLarge}
            className={cn(
              'absolute bottom-1 left-1',
              'flex items-center justify-center rounded-full',
              childMode ? 'h-10 w-10' : 'h-7 w-7',
              'bg-black/55 text-white hover:bg-black/75',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40',
              'transition-colors duration-150 motion-reduce:transition-none',
            )}
          >
            <span
              className={cn(
                'material-symbols-outlined',
                childMode ? 'text-xl' : 'text-base',
              )}
              aria-hidden="true"
            >
              zoom_in
            </span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={onFileChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* 안내 텍스트 (childMode 대비 18px+) */}
      <span
        className={cn(
          'font-semibold text-wtext-3 dark:text-rink-300 tracking-[-0.01em] text-center',
          childMode ? 'text-lg' : 'text-xs',
        )}
      >
        {(() => {
          const txt = childMode ? '프로필 사진을 바꾸려면 눌러요 📷' : MESSAGES.upload.dragHint;
          const parts = txt.split('클릭');
          if (parts.length === 2) {
            return (
              <>
                {parts[0]}
                <span className="text-ice-600 dark:text-ice-400 font-extrabold">
                  클릭
                </span>
                {parts[1]}
              </>
            );
          }
          return txt;
        })()}
      </span>

      {displayError && (
        <p
          role="alert"
          className={cn(
            'font-medium text-red-600 dark:text-red-400 text-center max-w-xs',
            childMode ? 'text-base' : 'text-xs',
          )}
        >
          {displayError}
        </p>
      )}

      {preview && (
        <ImageLightbox
          isOpen={isLightboxOpen}
          onClose={() => setIsLightboxOpen(false)}
          src={preview}
          alt={MESSAGES.upload.avatarCurrentAlt}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// 기본 라벨
// ──────────────────────────────────────────────────────────────────

function defaultLabelFor(variant: UploaderVariant, childMode: boolean): string {
  if (childMode) {
    if (variant === 'avatar') return MESSAGES.upload.avatarChangeChild;
    if (variant === 'file') return MESSAGES.upload.fileAdd;
    return MESSAGES.upload.imageAdd;
  }
  if (variant === 'avatar') return MESSAGES.upload.avatarChange;
  if (variant === 'file') return MESSAGES.upload.fileUploadLabel;
  return MESSAGES.upload.imageUploadLabel;
}

// ──────────────────────────────────────────────────────────────────
// 인라인 keyframes — tailwind 에 등록 없이 컴포넌트 자체에서 정의
// (Tailwind config 변경 불필요, 본 컴포넌트만 사용)
// ──────────────────────────────────────────────────────────────────

function KeyframeStyles() {
  return (
    <style jsx global>{`
      @keyframes uploader-pop-in {
        0% {
          transform: scale(0);
          opacity: 0;
        }
        60% {
          transform: scale(1.1);
          opacity: 1;
        }
        100% {
          transform: scale(1);
          opacity: 1;
        }
      }
      @keyframes uploader-shake {
        0%,
        100% {
          transform: translateX(0);
        }
        20% {
          transform: translateX(-5px);
        }
        40% {
          transform: translateX(5px);
        }
        60% {
          transform: translateX(-3px);
        }
        80% {
          transform: translateX(3px);
        }
      }
      .animate-uploader-pop-in {
        animation: uploader-pop-in 200ms cubic-bezier(0.34, 1.56, 0.64, 1)
          both;
      }
      .animate-uploader-shake {
        animation: uploader-shake 240ms ease-in-out both;
      }
      @media (prefers-reduced-motion: reduce) {
        .animate-uploader-pop-in,
        .animate-uploader-shake {
          animation: none !important;
        }
      }
    `}</style>
  );
}

export default Uploader;
