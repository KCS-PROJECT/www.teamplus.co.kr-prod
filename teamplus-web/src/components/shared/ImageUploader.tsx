'use client';

/**
 * ImageUploader — 통합 Uploader 의 `image` variant wrapper (Phase 3.1)
 *
 * Backward-compat: 기존 호출처는 변경 없이 동작. 신규 구현은 `<Uploader variant="image" />` 권장.
 * 정사각 미리보기 + Lightbox + 진행률 오버레이는 `Uploader` 본체에서 제공.
 *
 * @example
 * <ImageUploader
 *   maxFiles={5}
 *   onUploaded={(files) => setImageUrls(files.map(f => f.url))}
 * />
 */

import type { UploadedFile } from '@/types/file';
import { Uploader } from './Uploader';

export interface ImageUploaderProps {
  /** 최대 파일 개수 — 기본값 SoT: UPLOAD_LIMITS.IMAGE.maxCount */
  maxFiles?: number;
  /** 업로드 완료 콜백 */
  onUploaded?: (files: UploadedFile[]) => void;
  refType?: string;
  refId?: string;
  /** 실시간 동기화 활성화 */
  enableRealtimeSync?: boolean;
  /** WCAG AAA 아동 변형 */
  childMode?: boolean;
  label?: string;
  className?: string;
}

export function ImageUploader(props: ImageUploaderProps) {
  return <Uploader variant="image" category="IMAGE" {...props} />;
}

export default ImageUploader;
