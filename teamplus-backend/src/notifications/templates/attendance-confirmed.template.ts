/**
 * 출석 확인 알림톡 템플릿
 *
 * 카카오 비즈니스 승인 필요 템플릿
 */

export const ATTENDANCE_CONFIRMED_TEMPLATE = {
  templateCode: "ATTENDANCE_CONFIRMED_001",
  templateName: "출석 확인 알림",

  /**
   * 템플릿 내용
   */
  templateContent: `출석이 확인되었습니다.

수업: #{className}
날짜: #{attendanceDate}
잔여 크레딧: #{creditsRemaining}회

감사합니다.`,

  /**
   * 필수 치환 변수
   */
  requiredFields: ["className", "attendanceDate", "creditsRemaining"],

  /**
   * 템플릿 렌더링
   */
  render(data: {
    className: string;
    attendanceDate: string;
    creditsRemaining: string;
  }): string {
    let message = this.templateContent;

    message = message.replace(/#{className}/g, data.className);
    message = message.replace(/#{attendanceDate}/g, data.attendanceDate);
    message = message.replace(/#{creditsRemaining}/g, data.creditsRemaining);

    return message;
  },

  /**
   * 유효성 검증
   */
  validate(data: Record<string, string>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    this.requiredFields.forEach((field) => {
      if (!data[field]) {
        errors.push(`필수 필드 누락: ${field}`);
      }
    });

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return { valid: true, errors: [] };
  },
};
