/**
 * TEAMPLUS Admin Shared Components — Barrel Export
 *
 * 여러 어드민 페이지에서 재사용되는 공통 컴포넌트 모음.
 * Web 의 `teamplus-web/src/components/shared/` 와 일부 컴포넌트(Uploader 등) 동기화.
 */

// [2026-05-20 Phase 4] 통합 Uploader — 4 variant (file/image/avatar/photo-grid)
export { Uploader, default as UploaderDefault } from './Uploader';
export type { UploaderProps, UploaderVariant } from './Uploader';
