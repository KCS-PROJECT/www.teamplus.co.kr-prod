/**
 * 수업 리마인더 알림톡 템플릿
 *
 * 카카오 비즈니스 승인 필요 템플릿
 */

export const CLASS_REMINDER_TEMPLATE = {
  templateCode: "CLASS_REMINDER_001",
  templateName: "수업 리마인더 알림",

  /**
   * 템플릿 내용
   */
  templateContent: `내일 수업이 있습니다!

수업: #{className}
일시: #{classDate} #{classTime}

잊지 말고 참석해주세요.
감사합니다.`,

  /**
   * 필수 치환 변수
   */
  requiredFields: ["className", "classDate", "classTime"],

  /**
   * 템플릿 렌더링
   */
  render(data: {
    className: string;
    classDate: string;
    classTime: string;
  }): string {
    let message = this.templateContent;

    message = message.replace(/#{className}/g, data.className);
    message = message.replace(/#{classDate}/g, data.classDate);
    message = message.replace(/#{classTime}/g, data.classTime);

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
