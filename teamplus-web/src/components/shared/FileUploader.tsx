'use client';

/**
 * FileUploader — 통합 Uploader 의 `file` variant wrapper (Phase 3.1)
 *
 * Backward-compat: 기존 호출처는 변경 없이 동작. 신규 구현은 `<Uploader variant="file" />` 권장.
 * 모든 기능(드래그·드롭·진행률·재시도·접근성)은 `Uploader` 본체에서 제공.
 *
 * @example
 * <FileUploader
 *   category="ATTACHMENT"
 *   maxFiles={5}
 *   onUploaded={(files) => console.log(files)}
 * />
 */

import type { UploadCategory, UploadedFile } from '@/types/file';
import { Uploader } from './Uploader';

export interface FileUploaderProps {
  category: UploadCategory;
  /** 최대 파일 개수 — 기본값 SoT: UPLOAD_LIMITS[category].maxCount */
  maxFiles?: number;
  /** 업로드 완료 콜백 — 서버 응답 배열 */
  onUploaded?: (files: UploadedFile[]) => void;
  /** 연결 리소스 타입 */
  refType?: string;
  /** 연결 리소스 ID */
  refId?: string;
  /** 실시간 동기화 활성화 (다른 클라이언트의 업로드 자동 반영) */
  enableRealtimeSync?: boolean;
  /** WCAG AAA 아동 변형 */
  childMode?: boolean;
  /** 라벨 텍스트 (접근성) */
  label?: string;
  className?: string;
}

export function FileUploader(props: FileUploaderProps) {
  return <Uploader variant="file" {...props} />;
}

export default FileUploader;
