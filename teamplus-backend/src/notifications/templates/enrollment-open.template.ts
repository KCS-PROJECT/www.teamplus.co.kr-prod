/**
 * 정기권 등록 오픈 알림 템플릿
 *
 * 매월 15일 등록 오픈 시 학부모에게 인앱 알림 발송.
 * 카카오 알림톡 연동은 별도 승인 후 추가 예정 — 현재는 인앱 알림(FCM)만 발송.
 */
export const ENROLLMENT_OPEN_TEMPLATE = {
  templateCode: "ENROLLMENT_OPEN_001",
  templateName: "정기권 등록 오픈 알림",

  /**
   * 알림 제목 생성
   * @param monthLabel 월 라벨 (예: "6월")
   */
  buildTitle(monthLabel: string): string {
    return `${monthLabel} 정기권 등록이 시작됐습니다`;
  },

  /**
   * 알림 본문 생성
   * @param className 수업명
   * @param monthLabel 월 라벨 (예: "6월")
   */
  buildMessage(className: string, monthLabel: string): string {
    return `[${className}] ${monthLabel} 정기권 등록이 열렸습니다. 마감일까지 결제를 완료해주세요.`;
  },
};
