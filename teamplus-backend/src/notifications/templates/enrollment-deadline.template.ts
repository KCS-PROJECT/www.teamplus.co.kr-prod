/**
 * 정기권 등록 마감 D-1 알림 템플릿
 *
 * 매월 4일 오전 9시 발송 (당월 5일 마감 기준 D-1).
 * 카카오 알림톡 연동은 별도 승인 후 추가 예정 — 현재는 인앱 알림(FCM)만 발송.
 */
export const ENROLLMENT_DEADLINE_TEMPLATE = {
  templateCode: "ENROLLMENT_DEADLINE_001",
  templateName: "정기권 등록 마감 D-1 알림",

  /**
   * 알림 제목 생성
   */
  buildTitle(): string {
    return "오늘이 등록 마지막 날입니다";
  },

  /**
   * 알림 본문 생성
   * @param className 수업명
   * @param monthLabel 월 라벨 (예: "6월")
   */
  buildMessage(className: string, monthLabel: string): string {
    return `[${className}] ${monthLabel} 정기권 등록이 오늘 마감됩니다.`;
  },
};
