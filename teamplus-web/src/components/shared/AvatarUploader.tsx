'use client';

/**
 * AvatarUploader — 통합 Uploader 의 `avatar` variant wrapper (Phase 3.1)
 *
 * Backward-compat: 기존 호출처(`profile/edit/page.tsx` 등)는 변경 없이 동작.
 * 신규 구현은 `<Uploader variant="avatar" category="AVATAR" />` 권장.
 * 원형 미리보기 + 카메라 배지 + 진행률 오버레이 + 크게보기는 `Uploader` 본체에서 제공.
 *
 * @example
 * <AvatarUploader
 *   currentUrl={user.avatarUrl}
 *   onUploaded={(file) => updateProfile({ avatarUrl: file.url })}
 * />
 */

import type { UploadedFile } from '@/types/file';
import { Uploader } from './Uploader';

export interface AvatarUploaderProps {
  /** 현재 아바타 URL (서버 URL) */
  currentUrl?: string | null;
  /** 업로드 완료 콜백 — 첫 번째 결과만 전달 */
  onUploaded?: (file: UploadedFile) => void;
  /** 크기 (px, 기본 96) */
  size?: number;
  /** 접근성 라벨 */
  label?: string;
  /** WCAG AAA 아동 변형 (72×72dp 이상 자동) */
  childMode?: boolean;
  className?: string;
  /** 실시간 동기화 (옵션 — 아바타는 일반적으로 비활성) */
  refType?: string;
  refId?: string;
  enableRealtimeSync?: boolean;
  /**
   * Placeholder 아이콘 (Material Symbols 이름).
   * 미지정 시 사람 형태 SVG (사용자 프로필 기본).
   * 팀 로고 등 비-인물 컨텍스트는 'sports_hockey' 또는 'image' 권장.
   */
  placeholderIcon?: string;
  /**
   * 컨테이너 모양.
   *  - 'circle' (기본) — 사용자 프로필 사진.
   *  - 'square' — 팀 로고, 클럽 엠블럼 등 비-인물 객체 (rounded-w-2xl · 28px).
   */
  shape?: 'circle' | 'square';
}

export function AvatarUploader({
  currentUrl,
  onUploaded,
  size = 96,
  label,
  childMode,
  className,
  refType,
  refId,
  enableRealtimeSync,
  placeholderIcon,
  shape,
}: AvatarUploaderProps) {
  return (
    <Uploader
      variant="avatar"
      category="AVATAR"
      currentUrl={currentUrl}
      size={size}
      label={label}
      childMode={childMode}
      className={className}
      refType={refType}
      refId={refId}
      enableRealtimeSync={enableRealtimeSync}
      placeholderIcon={placeholderIcon}
      shape={shape}
      // 통합 Uploader 는 files[] 콜백 — avatar 는 항상 단일이므로 첫 요소 전달
      onUploaded={(files) => {
        if (files.length > 0) onUploaded?.(files[0]);
      }}
    />
  );
}

export default AvatarUploader;
