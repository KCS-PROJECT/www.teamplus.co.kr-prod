/**
 * 결제 완료 알림톡 템플릿
 *
 * 카카오 비즈니스 승인 필요 템플릿
 */

export const PAYMENT_SUCCESS_TEMPLATE = {
  templateCode: "PAYMENT_SUCCESS_001",
  templateName: "결제 완료 알림",

  /**
   * 템플릿 내용
   *
   * 카카오 비즈니스에서 승인된 메시지 형식:
   * - 최대 1000자 제한
   * - 개인정보 마스킹 필수
   * - 광고성 문구 금지
   */
  templateContent: `결제가 완료되었습니다.

주문번호: #{orderNumber}
수업: #{className}
금액: #{amount}원
시작일: #{startDate}

감사합니다.`,

  /**
   * 필수 치환 변수
   */
  requiredFields: ["orderNumber", "className", "amount", "startDate"],

  /**
   * 템플릿 렌더링
   */
  render(data: {
    orderNumber: string;
    className: string;
    amount: string;
    startDate: string;
  }): string {
    let message = this.templateContent;

    message = message.replace(/#{orderNumber}/g, data.orderNumber);
    message = message.replace(/#{className}/g, data.className);
    message = message.replace(/#{amount}/g, data.amount);
    message = message.replace(/#{startDate}/g, data.startDate);

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
