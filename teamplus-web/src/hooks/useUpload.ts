'use client';

/**
 * useUpload — 파일 업로드 진행률 · 상태 · 취소 관리 훅
 *
 * @example
 * const { upload, uploadMany, isUploading, progress, cancel } = useUpload();
 * await upload(file, { category: 'IMAGE' });
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  UploadCancelledError,
  UploadNetworkError,
  UploadValidationError,
  uploadFile,
  uploadFiles,
} from '@/services/upload.service';
import type {
  UploadCategory,
  UploadOptions,
  UploadProgress,
  UploadedFile,
} from '@/types/file';
import { MESSAGES } from '@/lib/messages';
import { devError } from '@/lib/logger';

interface UseUploadOptions {
  category: UploadCategory;
  refType?: string;
  refId?: string;
}

interface UseUploadResult {
  upload: (file: File) => Promise<UploadedFile | null>;
  uploadMany: (files: File[]) => Promise<UploadedFile[]>;
  cancel: () => void;
  reset: () => void;
  isUploading: boolean;
  /** 현재 전체 진행률 (0-100) — 다중 업로드 시 평균 */
  progress: number;
  /** 단일 업로드 상세 */
  detail: UploadProgress | null;
  error: string | null;
}

export function useUpload(options: UseUploadOptions): UseUploadResult {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [detail, setDetail] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const safeSet = useCallback(
    <T,>(setter: (value: T) => void, value: T) => {
      if (mountedRef.current) setter(value);
    },
    [],
  );

  const toUploadOptions = useCallback(
    (signal: AbortSignal, extra?: Partial<UploadOptions>): UploadOptions => ({
      category: options.category,
      refType: options.refType,
      refId: options.refId,
      signal,
      ...extra,
    }),
    [options.category, options.refType, options.refId],
  );

  const translateError = useCallback((err: unknown): string => {
    if (err instanceof UploadCancelledError) return MESSAGES.upload.cancelled;
    if (err instanceof UploadValidationError) return err.message;
    if (err instanceof UploadNetworkError) {
      return err.message || MESSAGES.upload.failed;
    }
    return MESSAGES.upload.failed;
  }, []);

  const upload = useCallback(
    async (file: File): Promise<UploadedFile | null> => {
      safeSet(setIsUploading, true);
      safeSet(setProgress, 0);
      safeSet(setDetail, null);
      safeSet(setError, null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const result = await uploadFile(
          file,
          toUploadOptions(controller.signal, {
            onProgress: (p) => {
              safeSet(setProgress, p.percent);
              safeSet(setDetail, p);
            },
          }),
        );
        safeSet(setProgress, 100);
        return result;
      } catch (err) {
        devError('[useUpload] upload failed', err);
        safeSet(setError, translateError(err));
        return null;
      } finally {
        safeSet(setIsUploading, false);
        abortRef.current = null;
      }
    },
    [safeSet, toUploadOptions, translateError],
  );

  const uploadMany = useCallback(
    async (files: File[]): Promise<UploadedFile[]> => {
      if (files.length === 0) return [];

      safeSet(setIsUploading, true);
      safeSet(setProgress, 0);
      safeSet(setDetail, null);
      safeSet(setError, null);

      const controller = new AbortController();
      abortRef.current = controller;

      // 각 파일의 개별 진행률을 저장 → 전체 평균 산출
      const perFilePercent = new Array<number>(files.length).fill(0);

      const updateAggregate = () => {
        const avg = Math.round(
          perFilePercent.reduce((sum, p) => sum + p, 0) / files.length,
        );
        safeSet(setProgress, avg);
      };

      try {
        const { succeeded, failed } = await uploadFiles(files, {
          ...toUploadOptions(controller.signal),
          onFileProgress: (idx, p) => {
            perFilePercent[idx] = p.percent;
            updateAggregate();
            safeSet(setDetail, p);
          },
          onFileComplete: (idx) => {
            perFilePercent[idx] = 100;
            updateAggregate();
          },
          onFileError: (idx) => {
            // 실패도 처리됨으로 간주 (진행률 계산에서 100% 처리)
            perFilePercent[idx] = 100;
            updateAggregate();
          },
        });

        if (failed.length > 0 && succeeded.length > 0) {
          safeSet(
            setError,
            MESSAGES.upload.partialFailed(succeeded.length, failed.length),
          );
        } else if (failed.length > 0) {
          safeSet(setError, translateError(failed[0].error));
        }

        return succeeded;
      } catch (err) {
        devError('[useUpload] uploadMany failed', err);
        safeSet(setError, translateError(err));
        return [];
      } finally {
        safeSet(setIsUploading, false);
        abortRef.current = null;
      }
    },
    [safeSet, toUploadOptions, translateError],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const reset = useCallback(() => {
    safeSet(setIsUploading, false);
    safeSet(setProgress, 0);
    safeSet(setDetail, null);
    safeSet(setError, null);
    abortRef.current = null;
  }, [safeSet]);

  return {
    upload,
    uploadMany,
    cancel,
    reset,
    isUploading,
    progress,
    detail,
    error,
  };
}

export default useUpload;
