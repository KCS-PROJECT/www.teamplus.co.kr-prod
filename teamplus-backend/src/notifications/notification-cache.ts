/**
 * unread-count Redis 캐시 키/TTL — REST(notifications.service)와
 * WebSocket(notifications.gateway) 읽음 경로가 같은 캐시를 무효화하도록 공유한다.
 * (별도 파일인 이유: gateway ↔ service 상호 import 시 런타임 순환 참조 발생)
 */
export const UNREAD_COUNT_CACHE_KEY = (userId: string) =>
  `notif:unread:${userId}`;
export const UNREAD_COUNT_CACHE_TTL = 30; // 30초 — 실시간성과 DB 부담 균형
