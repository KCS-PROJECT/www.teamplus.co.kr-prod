/**
 * 가입 승인 알림톡 템플릿
 *
 * 카카오 비즈니스 승인 필요 템플릿
 */

export const MEMBERSHIP_APPROVED_TEMPLATE = {
  templateCode: "MEMBERSHIP_APPROVED_001",
  templateName: "클럽 가입 승인 알림",

  /**
   * 템플릿 내용
   */
  templateContent: `#{clubName} 클럽 가입이 승인되었습니다!

담당 코치: #{coachName}

이제 수업 일정을 확인하고 출석 체크를 할 수 있습니다.

감사합니다.`,

  /**
   * 필수 치환 변수
   */
  requiredFields: ["name", "coachName"],

  /**
   * 템플릿 렌더링
   */
  render(data: { name: string; coachName: string }): string {
    let message = this.templateContent;

    message = message.replace(/#{clubName}/g, data.name);
    message = message.replace(/#{coachName}/g, data.coachName);

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
