'use client';

/**
 * Uploader (Admin) — TEAMPLUS 통합 업로더 (Phase 4 SPEC)
 *
 * Web 의 `teamplus-web/src/components/shared/Uploader.tsx` 와 동일 props/variant
 * 시스템을 유지하되, Admin 환경(데스크톱 우선, primary/neutral 토큰)에 맞춰
 * 디자인 토큰만 차이 (slate / primary / neutral · 어두운 카드 배경).
 *
 * 4 variant: 'file' | 'image' | 'avatar' | 'photo-grid' — Web 와 1:1 대응.
 * 차이점:
 *   - Lightbox 없음 (Admin 은 별도 Dialog 사용 권장)
 *   - 실시간 동기화 hook 미사용 (Admin 은 TanStack Query refetch 권장)
 *   - 디자인: primary (--ice-primary) + slate/neutral
 *
 * 동일 동작:
 *   - Per-entry 진행률 (uploadFile onProgress 직접 라우팅 · 동시 N개 정확)
 *   - URL.createObjectURL revoke 정확
 *   - 드래그 dropzone scale-[1.02] (motion-safe)
 *   - 진행률 바 transition-[width] duration-150
 *   - 성공 pop-in / 에러 shake 애니메이션
 *   - ARIA: role / aria-live / aria-busy / aria-valuenow
 *   - 키보드: Enter/Space dropzone
 *
 * 금지: gradient · backdrop-blur · color shadow · 한글 하드코딩.
 */

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
import {
  UploadCancelledError,
  UploadNetworkError,
  UploadValidationError,
  uploadFile,
  validateFile,
  validateFileCount,
  UPLOAD_LIMITS,
  toAbsoluteUrl,
  type UploadCategory,
  type UploadedFile,
  type UploadProgress,
} from '@/services/upload.service';

// ──────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────

export type UploaderVariant = 'file' | 'image' | 'avatar' | 'photo-grid';

export interface UploaderProps {
  variant: UploaderVariant;
  category: UploadCategory;
  maxFiles?: number;
  refType?: string;
  refId?: string;
  onUploaded?: (files: UploadedFile[]) => void;
  onError?: (error: Error) => void;
  /** Admin 환경: 실시간 동기화는 TanStack Query refetch 로 위임. prop 은 호환을 위해 유지(noop). */
  enableRealtimeSync?: boolean;
  /** Admin 은 일반적으로 child UI 가 필요 없으나 호환을 위해 유지 */
  childMode?: boolean;
  label?: string;
  className?: string;
  /** avatar variant — 현재 아바타 URL */
  currentUrl?: string | null;
  /** avatar variant — 원형 크기 px (기본 96) */
  size?: number;
}

// ──────────────────────────────────────────────────────────────────
// 내부 타입
// ──────────────────────────────────────────────────────────────────

type EntryStatus = 'pending' | 'uploading' | 'success' | 'error';

interface UploaderEntry {
  id: string;
  file: File;
  previewUrl?: string;
  percent: number;
  status: EntryStatus;
  error?: string;
  result?: UploadedFile;
  abortController?: AbortController;
  showSuccessAnimation?: boolean;
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
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function variantNeedsPreview(variant: UploaderVariant): boolean {
  return variant !== 'file';
}

// ──────────────────────────────────────────────────────────────────
// Uploader (Admin)
// ──────────────────────────────────────────────────────────────────

export function Uploader({
  variant,
  category,
  maxFiles,
  refType,
  refId,
  onUploaded,
  onError,
  // enableRealtimeSync 는 Admin 에서 no-op (TanStack Query refetch 권장)
  enableRealtimeSync: _enableRealtimeSync,
  childMode = false,
  label,
  className,
  currentUrl,
  size = 96,
}: UploaderProps) {
  const limit = UPLOAD_LIMITS[category];
  const effectiveMaxFiles =
    variant === 'avatar'
      ? 1
      : Math.min(maxFiles ?? limit.maxCount, limit.maxCount);

  const inputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<UploaderEntry[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    currentUrl ? toAbsoluteUrl(currentUrl) : null,
  );
  const [globalError, setGlobalError] = useState<string | null>(null);

  // 외부 currentUrl 변경 반영 (avatar)
  useEffect(() => {
    if (variant !== 'avatar') return;
    if (entries.some((e) => e.status === 'uploading')) return;
    setAvatarPreview(currentUrl ? toAbsoluteUrl(currentUrl) : null);
  }, [variant, currentUrl, entries]);

  // 언마운트 시 모든 objectURL 정리
  useEffect(() => {
    return () => {
      entries.forEach((e) => {
        if (e.previewUrl) URL.revokeObjectURL(e.previewUrl);
        e.abortController?.abort();
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remaining = useMemo(
    () => Math.max(0, effectiveMaxFiles - entries.length),
    [effectiveMaxFiles, entries.length],
  );

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

        setTimeout(() => {
          setEntries((prev) =>
            prev.map((e) =>
              e.id === entry.id ? { ...e, showSuccessAnimation: false } : e,
            ),
          );
        }, 350);

        if (variant === 'avatar') {
          setAvatarPreview(toAbsoluteUrl(result.url));
          if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
        }

        onUploaded?.([result]);
      } catch (err) {
        if (controller.signal.aborted) {
          if (variant === 'avatar') {
            setAvatarPreview(currentUrl ? toAbsoluteUrl(currentUrl) : null);
            if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
            setEntries((prev) => prev.filter((e) => e.id !== entry.id));
          }
          return;
        }
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
        setTimeout(() => {
          setEntries((prev) =>
            prev.map((e) =>
              e.id === entry.id ? { ...e, showErrorAnimation: false } : e,
            ),
          );
        }, 240);

        if (variant === 'avatar') {
          setAvatarPreview(currentUrl ? toAbsoluteUrl(currentUrl) : null);
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

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      setGlobalError(null);

      const incomingArray = Array.from(incoming);
      if (incomingArray.length === 0) return;

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

      if (variant === 'avatar' && newEntries[0]?.previewUrl) {
        setAvatarPreview(newEntries[0].previewUrl);
      }

      setEntries((prev) => [...prev, ...newEntries]);

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

      if (variant === 'avatar') {
        setAvatarPreview(currentUrl ? toAbsoluteUrl(currentUrl) : null);
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
  const accessibleLabel = label ?? defaultLabelFor(variant);

  // ──────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────

  if (variant === 'avatar') {
    return (
      <AvatarVariant
        size={childMode ? Math.max(size, 96) : size}
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
      />
    );
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <KeyframeStyles />

      {canAdd && (
        <div
          role="button"
          tabIndex={0}
          aria-label={`${accessibleLabel} — ${MESSAGES.upload.dragHint} (${entries.length}/${effectiveMaxFiles})`}
          aria-describedby="admin-uploader-hint"
          onClick={() => inputRef.current?.click()}
          onKeyDown={handleDropZoneKey}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            'flex flex-col items-center justify-center gap-2',
            'rounded-xl border-2 border-dashed cursor-pointer',
            'px-4 py-8',
            'transition-[transform,border-color,background-color] duration-200',
            'motion-reduce:transition-none motion-reduce:transform-none',
            isDragOver
              ? 'border-primary bg-primary/5 scale-[1.02]'
              : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50',
            'hover:border-primary hover:bg-primary/5',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
          )}
        >
          <UploadIcon variant={variant} />
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
            {MESSAGES.upload.dragHint}
          </span>
          <span
            id="admin-uploader-hint"
            className="text-xs text-neutral-500 dark:text-neutral-400"
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

      {globalError && (
        <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
          {globalError}
        </p>
      )}

      {entries.length > 0 && (
        <>
          {variant === 'file' && (
            <FileListVariant
              entries={entries}
              onRemove={removeEntry}
              onRetry={retryEntry}
              childMode={childMode}
            />
          )}
          {(variant === 'image' || variant === 'photo-grid') && (
            <GridVariant
              variant={variant}
              entries={entries}
              onRemove={removeEntry}
              onRetry={retryEntry}
              childMode={childMode}
            />
          )}
        </>
      )}

      {isAnyUploading && (
        <button
          type="button"
          onClick={cancelAll}
          className={cn(
            'self-start rounded-md px-3 py-1.5 text-sm font-medium',
            'text-neutral-600 hover:bg-neutral-100',
            'dark:text-neutral-300 dark:hover:bg-neutral-700',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
            'transition-colors motion-reduce:transition-none',
          )}
        >
          {MESSAGES.upload.cancelAction}
        </button>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// 보조 컴포넌트
// ──────────────────────────────────────────────────────────────────

function UploadIcon({ variant }: { variant: UploaderVariant }) {
  // Admin 은 material-symbols 미설치 가능성 → 인라인 SVG 사용
  if (variant === 'file') {
    return (
      <svg width={32} height={32} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M14 2v6h6M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8L14 2zM12 11v6M9 14l3-3 3 3"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-neutral-500 dark:text-neutral-400"
        />
      </svg>
    );
  }
  return (
    <svg width={32} height={32} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth={1.5}
        className="text-neutral-500 dark:text-neutral-400"
      />
      <circle
        cx="8.5"
        cy="10.5"
        r="1.5"
        stroke="currentColor"
        strokeWidth={1.5}
        className="text-neutral-500 dark:text-neutral-400"
      />
      <path
        d="M21 15l-5-5L5 19"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-neutral-500 dark:text-neutral-400"
      />
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────────
// File List Variant
// ──────────────────────────────────────────────────────────────────

interface FileListVariantProps {
  entries: UploaderEntry[];
  onRemove: (id: string) => void;
  onRetry: (entry: UploaderEntry) => void;
  childMode?: boolean;
}

function FileListVariant({ entries, onRemove, onRetry, childMode = false }: FileListVariantProps) {
  return (
    <ul className="flex flex-col gap-2" aria-label="업로드 파일 목록">
      {entries.map((entry, index) => (
        <li
          key={entry.id}
          aria-busy={entry.status === 'uploading'}
          className={cn(
            'flex flex-col gap-2 rounded-lg border p-3',
            'bg-white dark:bg-neutral-800',
            entry.status === 'error'
              ? 'border-red-300 dark:border-red-700'
              : 'border-neutral-200 dark:border-neutral-700',
            entry.showErrorAnimation && 'animate-admin-uploader-shake',
            'transition-colors motion-reduce:transition-none',
          )}
        >
          <div className="flex items-center gap-3">
            <StatusIcon
              status={entry.status}
              showSuccess={entry.showSuccessAnimation}
            />
            <div className="flex flex-1 flex-col min-w-0">
              <span className="text-sm font-medium text-neutral-900 dark:text-neutral-50 truncate">
                {entry.file.name}
              </span>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
                {formatSize(entry.file.size)}
                {entry.status === 'uploading' &&
                  ` · ${MESSAGES.upload.progress(entry.percent)}`}
                {entry.status === 'success' && ` · ${MESSAGES.upload.success}`}
                {entry.status === 'error' && entry.error ? ` · ${entry.error}` : ''}
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
                    // WCAG AAA: childMode 시 보조 어포던스도 72×72dp 최소 터치 영역 (Web Uploader 와 동일 정합)
                    childMode
                      ? 'min-h-[72px] min-w-[72px] px-4 py-3 text-base'
                      : 'px-2 py-1 text-xs',
                    'text-primary hover:bg-primary/10',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
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
                  // WCAG AAA: childMode 시 72×72dp 최소 터치 영역 (Web Uploader 와 동일 정합)
                  childMode
                    ? 'min-h-[72px] min-w-[72px]'
                    : 'w-8 h-8',
                  'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100',
                  'dark:text-neutral-400 dark:hover:text-white dark:hover:bg-neutral-700',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                  'transition-colors motion-reduce:transition-none',
                )}
              >
                <CloseIcon />
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
              className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden"
            >
              <div
                className={cn(
                  'h-full rounded-full bg-primary',
                  'transition-[width] duration-150',
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
// Grid Variant (image / photo-grid)
// ──────────────────────────────────────────────────────────────────

interface GridVariantProps {
  variant: 'image' | 'photo-grid';
  entries: UploaderEntry[];
  onRemove: (id: string) => void;
  onRetry: (entry: UploaderEntry) => void;
  childMode?: boolean;
}

function GridVariant({ variant, entries, onRemove, onRetry, childMode = false }: GridVariantProps) {
  const cols =
    variant === 'photo-grid'
      ? 'grid-cols-4 md:grid-cols-6'
      : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5';

  return (
    <div
      className={cn('grid gap-2', cols)}
      role="list"
      aria-label="업로드된 이미지 미리보기"
    >
      {entries.map((entry, index) => (
        <div
          key={entry.id}
          role="listitem"
          aria-busy={entry.status === 'uploading'}
          className={cn(
            'relative aspect-square rounded-lg overflow-hidden',
            'bg-neutral-100 dark:bg-neutral-700',
            entry.status === 'error' && 'ring-2 ring-red-500',
            entry.showErrorAnimation && 'animate-admin-uploader-shake',
            'transition-colors motion-reduce:transition-none',
          )}
        >
          {entry.previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={entry.result?.thumbUrl ? toAbsoluteUrl(entry.result.thumbUrl) : entry.previewUrl}
              alt={MESSAGES.upload.preview(index + 1)}
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
            />
          )}

          {entry.status === 'uploading' && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/50"
              aria-live="polite"
            >
              <span className="text-xs font-medium text-white tabular-nums">
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
                    'transition-[width] duration-150',
                    'motion-reduce:transition-none',
                  )}
                  style={{ width: `${entry.percent}%` }}
                />
              </div>
            </div>
          )}

          {entry.status === 'success' && (
            <div
              className={cn(
                'absolute bottom-1 left-1 rounded-full bg-green-600 p-1 shadow-sm',
                entry.showSuccessAnimation && 'animate-admin-uploader-pop-in',
              )}
              aria-label={MESSAGES.upload.successBadge}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M5 12l5 5L20 7"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-white"
                />
              </svg>
            </div>
          )}

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
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M3 12a9 9 0 1015-6.7L21 8M21 3v5h-5"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-xs font-medium">{MESSAGES.upload.retry}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onRemove(entry.id)}
            aria-label={MESSAGES.upload.removeLabel(index + 1)}
            className={cn(
              'absolute flex items-center justify-center rounded-full',
              // WCAG AAA: childMode 시 72×72dp 최소 터치 영역 (Web Uploader 와 동일 정합)
              childMode
                ? 'top-0 right-0 min-h-[72px] min-w-[72px] translate-x-2 -translate-y-2'
                : 'top-1 right-1 w-6 h-6',
              'bg-black/50 text-white hover:bg-black/70',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-white',
              'transition-colors duration-150 motion-reduce:transition-none',
            )}
          >
            <CloseIcon small={!childMode} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Avatar Variant
// ──────────────────────────────────────────────────────────────────

interface AvatarVariantProps {
  size: number;
  className?: string;
  accessibleLabel: string;
  preview: string | null;
  isUploading: boolean;
  entries: UploaderEntry[];
  inputRef: React.RefObject<HTMLInputElement>;
  accept: string;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onPick: () => void;
  globalError: string | null;
}

function AvatarVariant({
  size,
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
}: AvatarVariantProps) {
  const activeEntry = entries[0];
  const progress = activeEntry?.percent ?? 0;
  const displayError = globalError ?? activeEntry?.error;

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <KeyframeStyles />
      <div className="relative" style={{ width: size, height: size }}>
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
            'relative rounded-full overflow-hidden',
            'border border-neutral-200 dark:border-neutral-700',
            'bg-neutral-50 dark:bg-neutral-900',
            'focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40',
            'transition-[box-shadow,border-color] duration-150 motion-reduce:transition-none',
            isUploading ? 'cursor-wait' : 'cursor-pointer hover:border-primary',
            activeEntry?.showErrorAnimation && 'animate-admin-uploader-shake',
          )}
          style={{ width: size, height: size }}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="현재 프로필 사진"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-neutral-400 dark:text-neutral-500">
              <svg
                width={Math.round(size * 0.42)}
                height={Math.round(size * 0.42)}
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
            </div>
          )}

          {isUploading && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/55"
              aria-live="polite"
            >
              <span className="text-sm font-semibold text-white tabular-nums">{progress}%</span>
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
                    'transition-[width] duration-150',
                    'motion-reduce:transition-none',
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </button>

        {!isUploading && (
          <span
            className={cn(
              'pointer-events-none absolute bottom-1 right-0',
              'flex h-[30px] w-[30px] items-center justify-center rounded-full',
              'bg-primary text-white border-[3px] border-white dark:border-neutral-900 shadow-md',
            )}
            aria-hidden="true"
          >
            <svg width={14} height={14} viewBox="0 0 14 14" fill="none">
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

      <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 text-center tracking-[-0.01em]">
        {MESSAGES.upload.dragHint}
      </span>

      {displayError && (
        <p
          role="alert"
          className="text-xs font-medium text-red-600 dark:text-red-400 text-center max-w-xs"
        >
          {displayError}
        </p>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Status / Close 아이콘
// ──────────────────────────────────────────────────────────────────

function StatusIcon({
  status,
  showSuccess,
}: {
  status: EntryStatus;
  showSuccess?: boolean;
}) {
  if (status === 'success') {
    return (
      <span
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30',
          showSuccess && 'animate-admin-uploader-pop-in',
        )}
        aria-hidden="true"
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
          <path
            d="M5 12l5 5L20 7"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-green-600 dark:text-green-400"
          />
        </svg>
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span
        className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30"
        aria-hidden="true"
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
          <path
            d="M12 8v5M12 17h.01M3 12a9 9 0 1018 0 9 9 0 00-18 0z"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-red-600 dark:text-red-400"
          />
        </svg>
      </span>
    );
  }
  return (
    <span
      className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-700"
      aria-hidden="true"
    >
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
        <path
          d="M14 2v6h6M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8L14 2z"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-neutral-500 dark:text-neutral-400"
        />
      </svg>
    </span>
  );
}

function CloseIcon({ small }: { small?: boolean }) {
  const dim = small ? 12 : 16;
  return (
    <svg width={dim} height={dim} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6l12 12M6 18L18 6"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  );
}

function defaultLabelFor(variant: UploaderVariant): string {
  if (variant === 'avatar') return '프로필 사진 변경';
  if (variant === 'file') return '파일 업로드';
  return '사진 업로드';
}

// ──────────────────────────────────────────────────────────────────
// 인라인 keyframes — admin 전용 namespace 로 충돌 회피
// ──────────────────────────────────────────────────────────────────

function KeyframeStyles() {
  return (
    <style jsx global>{`
      @keyframes admin-uploader-pop-in {
        0% { transform: scale(0); opacity: 0; }
        60% { transform: scale(1.1); opacity: 1; }
        100% { transform: scale(1); opacity: 1; }
      }
      @keyframes admin-uploader-shake {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-5px); }
        40% { transform: translateX(5px); }
        60% { transform: translateX(-3px); }
        80% { transform: translateX(3px); }
      }
      .animate-admin-uploader-pop-in {
        animation: admin-uploader-pop-in 200ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
      }
      .animate-admin-uploader-shake {
        animation: admin-uploader-shake 240ms ease-in-out both;
      }
      @media (prefers-reduced-motion: reduce) {
        .animate-admin-uploader-pop-in,
        .animate-admin-uploader-shake { animation: none !important; }
      }
    `}</style>
  );
}

export default Uploader;
