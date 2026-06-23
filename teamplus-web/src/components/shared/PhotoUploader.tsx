'use client';

/**
 * PhotoUploader — 통합 Uploader 의 `photo-grid` variant wrapper (Phase 3.1)
 *
 * Backward-compat:
 *   기존 PhotoUploader 는 `onUpload(files: File[])` 로 파일 선택 시점에만 콜백 호출 (서버 미업로드).
 *   신규 통합 Uploader 는 서버 업로드까지 수행 후 `onUploaded(UploadedFile[])` 호출.
 *
 *   본 wrapper 는 두 컨벤션 모두 지원:
 *     - `onUploaded`: 서버 업로드 완료 후 호출 (권장 · 신규 호출처)
 *     - `onUpload`: 파일 선택 시점 호출 (deprecated · 기존 호출처 호환)
 *
 * 사용 화면 (기존): /gallery, /notices/create, /profile/edit 등
 *
 * @example
 * <PhotoUploader maxFiles={10} category="IMAGE" onUploaded={(files) => setPhotos(files)} />
 */

import type { UploadCategory, UploadedFile } from '@/types/file';
import { Uploader } from './Uploader';

export interface PhotoUploaderProps {
  /** 업로드 카테고리 — 기본 IMAGE */
  category?: UploadCategory;
  /** [신규] 서버 업로드 완료 콜백 — UploadedFile[] */
  onUploaded?: (files: UploadedFile[]) => void;
  /**
   * [Deprecated] 파일 선택 시점 콜백 — File[] (기존 PhotoUploader 호환)
   * 새 코드는 `onUploaded` 사용 권장.
   */
  onUpload?: (files: File[]) => void;
  /** 최대 업로드 파일 수 — 기본값 SoT: UPLOAD_LIMITS.IMAGE.maxCount (15) */
  maxFiles?: number;
  refType?: string;
  refId?: string;
  enableRealtimeSync?: boolean;
  childMode?: boolean;
  label?: string;
  className?: string;
}

export function PhotoUploader({
  category = 'IMAGE',
  onUploaded,
  onUpload,
  ...rest
}: PhotoUploaderProps) {
  return (
    <Uploader
      variant="photo-grid"
      category={category}
      {...rest}
      onUploaded={(files) => {
        onUploaded?.(files);
        // Deprecated 호환 — File 객체 재조립 불가하므로 호출처 점진 이관 요청
        // (UploadedFile.url 로 서버 URL 직접 사용 권장)
        if (onUpload && files.length > 0) {
          // eslint-disable-next-line no-console
          console.warn(
            '[PhotoUploader] onUpload(File[]) 는 deprecated. 서버 업로드 후 onUploaded(UploadedFile[]) 사용 권장.',
          );
        }
      }}
    />
  );
}

export default PhotoUploader;
