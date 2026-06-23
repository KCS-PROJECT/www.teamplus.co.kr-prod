/**
 * Custom Hooks Index
 * 모든 커스텀 훅을 re-export
 */

// Debounce 관련 훅
export {
  useDebounce,
  useDebouncedCallback,
  useDebouncedState,
  type DebounceOptions,
} from './useDebounce';

// 스토리지 관련 훅
export {
  useLocalStorage,
  useSessionStorage,
  type LocalStorageOptions,
} from './useLocalStorage';

// 네트워크 상태 훅
export {
  useNetworkStatus,
  NetworkStatus,
  type NetworkInfo,
  type NetworkType,
  type UseNetworkStatusOptions,
} from './useNetworkStatus';

// WebSocket 훅
export {
  useWebSocket,
  type UseWebSocketOptions,
  type WebSocketMessage,
} from './useWebSocket';

// 알림 관련 훅
export { useNotificationCount, useHasUnreadNotifications } from './useNotificationCount';
// NotificationProvider 는 contexts/NotificationContext.tsx 에서 직접 import 하세요
export { useNotificationSettings } from './useNotificationSettings';
export { useNotifications } from './useNotifications';

// 네이티브 UI 제어 훅
export {
  useNativeUI,
  useFullscreen,
  useHideBottomNav,
  useShowAppBar,
  useHideStatusBar,
  // UI 프리셋 Hooks
  useDefaultUI,
  useDetailUI,
  useFullscreenUI,
  useModalUI,
  useAuthUI,
  type NativeUIOptions,
} from './useNativeUI';

// 네이티브 환경 감지 훅
export { useIsNative } from './useIsNative';

// 파일 업로드 실시간 동기화 훅 (SPEC_FILEUPLOAD_IMPECCABLE_2026-05-20 §5.2)
export {
  useFileUploadSync,
  type FileEventPayload,
  type FileEventCallback,
  type UseFileUploadSyncOptions,
  type UseFileUploadSyncReturn,
} from './useFileUploadSync';

// 풀스크린 로더 ready 신호 합산 훅 (SPEC_LOADER_IMPECCABLE_2026-05-20 §3.1 v18)
// usePageReady() 의 isReady 인자에 합산하여 이미지/폰트 로드 완료까지 hide 지연.
export { useImagesReady } from './useImagesReady';
export { useFontsReady } from './useFontsReady';
