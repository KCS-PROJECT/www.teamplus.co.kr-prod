/**
 * TEAMPLUS Shared Components - Barrel Export
 *
 * 여러 화면에서 재사용되는 공통 컴포넌트 모음.
 * 각 컴포넌트는 단일 책임을 가지며 props로 제어됩니다.
 */

export { ChatListItem, default as ChatListItemDefault } from './ChatListItem';
export type { ChatListItemProps } from './ChatListItem';

export { ReceiptCard, default as ReceiptCardDefault } from './ReceiptCard';
export type { ReceiptCardProps, ReceiptStatus } from './ReceiptCard';

export { StatCard, default as StatCardDefault } from './StatCard';
export type { StatCardProps, StatAccentColor } from './StatCard';

export { ApplicantCard, formatBirthDateLabel, default as ApplicantCardDefault } from './ApplicantCard';
export type { ApplicantCardProps, ApplicantData } from './ApplicantCard';

export { TimelineItem, default as TimelineItemDefault } from './TimelineItem';
export type { TimelineItemProps, TimelineStatus } from './TimelineItem';

export { FilterTabs, default as FilterTabsDefault } from './FilterTabs';
export type { FilterTabsProps, FilterTabItem } from './FilterTabs';

export { PhotoTile, default as PhotoTileDefault } from './PhotoTile';
export type { PhotoTileProps } from './PhotoTile';

export { WishlistItemCard, default as WishlistItemCardDefault } from './WishlistItemCard';
export type { WishlistItemCardProps, WishlistItemType, WishlistTagTone } from './WishlistItemCard';

export { NoticeListItem, default as NoticeListItemDefault } from './NoticeListItem';
export type { NoticeListItemProps, NoticeType } from './NoticeListItem';

export { ScoreRadar, default as ScoreRadarDefault } from './ScoreRadar';
export type { ScoreRadarProps, ScoreRadarItem } from './ScoreRadar';

export { AttendanceRing, default as AttendanceRingDefault } from './AttendanceRing';
export type { AttendanceRingProps, AttendanceRingColor } from './AttendanceRing';

export { EmptyStateAction, default as EmptyStateActionDefault } from './EmptyStateAction';
export type { EmptyStateActionProps, EmptyStateActionVariant } from './EmptyStateAction';

export { BulkActionBar, default as BulkActionBarDefault } from './BulkActionBar';
export type { BulkActionBarProps, BulkAction } from './BulkActionBar';

export { CommentThread, default as CommentThreadDefault } from './CommentThread';
export type { CommentThreadProps, CommentData } from './CommentThread';

export { ConfirmSheet, default as ConfirmSheetDefault } from './ConfirmSheet';
export type { ConfirmSheetProps } from './ConfirmSheet';

export { MonthNavigator, default as MonthNavigatorDefault } from './MonthNavigator';
export type { MonthNavigatorProps } from './MonthNavigator';

export { RangeDatePicker, default as RangeDatePickerDefault } from './RangeDatePicker';
export type { RangeDatePickerProps } from './RangeDatePicker';

export { PhotoUploader, default as PhotoUploaderDefault } from './PhotoUploader';
export type { PhotoUploaderProps } from './PhotoUploader';

// [추가 2026-05-20 Phase 3.1] 통합 Uploader — 4 variant (file/image/avatar/photo-grid)
//   Wrapper(File/Image/Photo/Avatar)Uploader 의 단일 SoT.
export { Uploader, default as UploaderDefault } from './Uploader';
export type { UploaderProps, UploaderVariant } from './Uploader';

export { FileUploader, default as FileUploaderDefault } from './FileUploader';
export type { FileUploaderProps } from './FileUploader';

export { ImageUploader, default as ImageUploaderDefault } from './ImageUploader';
export type { ImageUploaderProps } from './ImageUploader';

export { AvatarUploader, default as AvatarUploaderDefault } from './AvatarUploader';
export type { AvatarUploaderProps } from './AvatarUploader';

export { ImageLightbox, default as ImageLightboxDefault } from './ImageLightbox';
export type { ImageLightboxProps } from './ImageLightbox';

// [추가 W2.A 2026-05-18] 가로 스크롤 잘림 차단 Pill 칩 — 수업 목록·RSVP·검색 등 공용.
export { CategoryChipsRow, default as CategoryChipsRowDefault } from './CategoryChipsRow';
export type { CategoryChipsRowProps, CategoryChipItem } from './CategoryChipsRow';
