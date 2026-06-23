'use client';

/**
 * VideoUploadButton — multipart/form-data 기반 영상 업로드 공통 컴포넌트
 *
 * 단일 호출 플로우 (2026-05-23 R2 제거 후 multipart 단일 채널 전환):
 *   1) <input capture="environment"> 또는 갤러리에서 파일 선택
 *   2) POST /api/v1/videos (multipart) — multer가 디스크 저장 + Video 레코드 자동 생성
 *   3) onRegistered 콜백에 RegisteredVideo 전달
 *
 * 에러 매핑:
 *   - 400 invalid file type / size → MESSAGES.video.invalidType / tooLarge
 *   - 401 인증 만료                → MESSAGES.video.unauthorized
 *   - 403 권한 없음 (refType 매핑) → 서버 메시지 그대로
 *   - 413 본문 크기 초과           → MESSAGES.video.tooLarge
 *   - 503 서버 일시 장애           → MESSAGES.video.unavailable
 *
 * 접근성:
 *   - 버튼 `type="button"` 명시
 *   - 진행률 영역 aria-live="polite" + role="progressbar"
 *   - 장식 Icon은 aria-hidden
 *
 * 모바일:
 *   - `<input accept="video/*" capture="environment">` 로 카메라 직캡처 지원
 *   - 모바일 데이터 절약 위해 클라이언트 압축(앱은 video_compress 등)을 사전 적용 권장
 */

import { useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import {
  uploadVideo,
  uploadFile,
  UploadCancelledError,
  UploadNetworkError,
  UploadValidationError,
  type RegisteredVideo,
  type UploadVideoMetadata,
} from '@/services/upload.service';
import { MESSAGES } from '@/lib/messages';
import { UPLOAD_LIMITS, type UploadedFile } from '@/types/file';

type Phase = 'idle' | 'selected' | 'uploading' | 'success' | 'error';

/**
 * 비영상 업로드 시(category='IMAGE'·'DOCUMENT') 콜백에 전달되는 결과 — UploadedFile 그대로.
 * 영상 업로드 시(category='VIDEO')에는 RegisteredVideo 가 전달됩니다.
 */
export type VideoUploadButtonResult = RegisteredVideo | UploadedFile;

export interface VideoUploadButtonProps {
  /**
   * 업로드 완료 콜백 — category='VIDEO' 이면 RegisteredVideo,
   * 그 외 IMAGE/DOCUMENT 면 UploadedFile.
   */
  onRegistered?: (result: VideoUploadButtonResult) => void;
  onError?: (error: Error) => void;
  /** 기본: VIDEO — image/document 도 허용 */
  category?: 'VIDEO' | 'IMAGE' | 'DOCUMENT';
  /** 모바일 카메라 직캡처 활성화 (기본 true, 갤러리 picker 도 함께 표시됨) */
  enableCamera?: boolean;
  /** 버튼 레이블 오버라이드 */
  label?: string;
  /** 버튼 너비 전체 */
  fullWidth?: boolean;
  disabled?: boolean;
  /** category='VIDEO' 일 때 필수, 그 외 카테고리에서는 무시 — title/videoType/classId 등 */
  metadata?: UploadVideoMetadata;
  /** category!='VIDEO' 일 때 refType + refId 로 도메인 연결 (예: 선수 사진 player_profile) */
  refType?: string;
  refId?: string;
}

export function VideoUploadButton({
  onRegistered,
  onError,
  category = 'VIDEO',
  enableCamera = true,
  label,
  fullWidth = true,
  disabled = false,
  metadata,
  refType,
  refId,
}: VideoUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  const [phase, setPhase] = useState<Phase>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [percent, setPercent] = useState(0);

  const accept = UPLOAD_LIMITS[category].accept;
  const selectLabel = label ?? MESSAGES.video.selectButton;

  function reset() {
    setFile(null);
    setPercent(0);
    setPhase('idle');
    abortRef.current = null;
    if (inputRef.current) inputRef.current.value = '';
  }

  function handlePick() {
    inputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    if (!picked) return;
    setFile(picked);
    setPhase('selected');
    setPercent(0);
  }

  async function handleUpload() {
    if (!file) {
      toast.error(MESSAGES.video.emptyField);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setPhase('uploading');
    setPercent(0);

    try {
      let result: VideoUploadButtonResult;

      if (category === 'VIDEO') {
        const title = metadata?.title?.trim();
        if (!title) {
          toast.error(MESSAGES.video.missingTitle);
          onError?.(
            new UploadValidationError('EMPTY', MESSAGES.video.missingTitle),
          );
          setPhase('error');
          return;
        }
        result = await uploadVideo(
          file,
          { ...metadata, title },
          {
            onProgress: (p) => setPercent(p.percent),
            signal: controller.signal,
          },
        );
      } else {
        result = await uploadFile(file, {
          category,
          refType,
          refId,
          onProgress: (p) => setPercent(p.percent),
          signal: controller.signal,
        });
      }

      toast.success(MESSAGES.video.registerSuccess);
      onRegistered?.(result);
      setPhase('success');
    } catch (err) {
      setPhase('error');
      if (err instanceof UploadCancelledError) {
        toast.info(MESSAGES.video.cancelled);
        reset();
        return;
      }
      if (err instanceof UploadValidationError) {
        const msg =
          err.code === 'INVALID_TYPE'
            ? MESSAGES.video.invalidType
            : err.code === 'TOO_LARGE'
              ? MESSAGES.video.tooLarge
              : MESSAGES.video.emptyField;
        toast.error(msg);
        onError?.(err);
        return;
      }
      if (err instanceof UploadNetworkError) {
        const msg =
          err.status === 401
            ? MESSAGES.video.unauthorized
            : err.status === 403
              ? err.message
              : err.status === 413
                ? MESSAGES.video.tooLarge
                : err.status === 503
                  ? MESSAGES.video.unavailable
                  : MESSAGES.video.failed;
        toast.error(msg);
        onError?.(err);
        return;
      }
      toast.error(MESSAGES.video.failed);
      onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      abortRef.current = null;
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
  }

  const sizeMb = file ? Number((file.size / 1024 / 1024).toFixed(1)) : 0;
  const isUploading = phase === 'uploading';
  const isDisabled = disabled || isUploading;

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        capture={enableCamera ? 'environment' : undefined}
        className="sr-only"
        onChange={handleFileChange}
        aria-label={MESSAGES.video.selectButton}
      />

      {phase === 'idle' || phase === 'error' ? (
        <Button
          type="button"
          variant="outline"
          fullWidth={fullWidth}
          onClick={handlePick}
          disabled={isDisabled}
        >
          <Icon name="upload_file" size={18} aria-hidden="true" />
          <span>{selectLabel}</span>
        </Button>
      ) : null}

      {file && phase !== 'idle' ? (
        <div className="flex flex-col gap-2 rounded-xl border border-wline bg-white p-4 dark:border-rink-700 dark:bg-rink-800">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Icon name="movie" size={18} aria-hidden="true" />
              <span className="truncate text-sm text-wtext-1 dark:text-white">
                {MESSAGES.video.selectedHint(file.name, sizeMb)}
              </span>
            </div>
            {!isUploading && phase !== 'success' ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handlePick}
              >
                {MESSAGES.video.changeButton}
              </Button>
            ) : null}
          </div>

          {isUploading ? (
            <div className="flex flex-col gap-1.5" aria-live="polite">
              <div
                role="progressbar"
                aria-label={MESSAGES.video.progressAriaLabel}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                className="h-2 w-full overflow-hidden rounded-full bg-wline dark:bg-rink-700"
              >
                <div
                  className="h-full bg-ice-500 transition-all duration-150"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-wtext-3 dark:text-rink-300">
                <span>
                  {percent > 0
                    ? MESSAGES.video.uploading(percent)
                    : MESSAGES.video.waiting}
                </span>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="text-red-600 underline-offset-2 hover:underline dark:text-red-400"
                >
                  {MESSAGES.video.cancelButton}
                </button>
              </div>
            </div>
          ) : null}

          {phase === 'selected' ? (
            <Button type="button" fullWidth={fullWidth} onClick={handleUpload}>
              <Icon name="cloud_upload" size={18} aria-hidden="true" />
              <span>{MESSAGES.video.uploadButton}</span>
            </Button>
          ) : null}

          {phase === 'success' ? (
            <div className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
              <Icon name="check_circle" size={18} aria-hidden="true" />
              <span>{MESSAGES.video.success}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={reset}
                className="ml-auto"
              >
                {MESSAGES.video.changeButton}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default VideoUploadButton;
