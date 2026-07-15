/**
 * FCM data payload 계약 v1 — 3플랫폼(Backend / Flutter / Web) 공유 계약의 기계 SoT.
 *
 * 사람용 명세: docs/Architecture/PUSH_NOTIFICATION_GUIDE.md "푸시 payload 계약" 절
 * Flutter 미러: teamplus-app/lib/core/notification/ (fromFcmData 파서 — 필드명이
 *   양측 spec 으로 상호 pin 되어 계약 드리프트를 CI 에서 검출한다)
 *
 * 모든 발송 경로는 data 를 손으로 조립하지 말고 buildPushData() 만 사용한다.
 * FCM data 는 값이 전부 string 이어야 하며, 전체 메시지 4KB 제한이 있다.
 */

export const PUSH_PAYLOAD_VERSION = "1";

export interface PushDataInput {
  /** canonical notificationType (예: "enrollment_approved", "chat_message") */
  type: string;
  /** 알림 탭 시 이동할 웹 상대경로 — "/" 시작 내부 경로만 허용, 그 외 값은 제외 */
  linkUrl?: string | null;
  /** 인앱 알림 row id — 알림함에 적재되는 발송 경로에만 존재 */
  notificationId?: string | null;
}

/**
 * linkUrl 이 안전한 내부 경로인지 검증.
 * "/" 시작 + 프로토콜 상대 URL("//", "/\") 금지 — 푸시 payload 를 경유한
 * 임의 외부 이동을 발송 시점에 차단한다. (수신측 화이트리스트와 이중 방어)
 */
export function isValidInternalLinkUrl(linkUrl: string): boolean {
  return (
    linkUrl.startsWith("/") &&
    !linkUrl.startsWith("//") &&
    !linkUrl.startsWith("/\\")
  );
}

/**
 * FCM data payload 빌더 — 계약 v1.
 *
 * 반환 키: `v`(계약 버전) · `type`(필수) · `linkUrl`(유효 시) · `notificationId`(존재 시)
 */
export function buildPushData(input: PushDataInput): Record<string, string> {
  const data: Record<string, string> = {
    v: PUSH_PAYLOAD_VERSION,
    type: input.type,
  };
  if (input.linkUrl && isValidInternalLinkUrl(input.linkUrl)) {
    data.linkUrl = input.linkUrl;
  }
  if (input.notificationId) {
    data.notificationId = input.notificationId;
  }
  return data;
}
