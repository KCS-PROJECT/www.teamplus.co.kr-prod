/**
 * 크레딧 만료 예정 알림톡 템플릿
 *
 * 카카오 비즈니스 승인 필요 템플릿
 */

export const CREDIT_EXPIRY_TEMPLATE = {
  templateCode: "CREDIT_EXPIRY_001",
  templateName: "크레딧 만료 예정 알림",

  /**
   * 템플릿 내용
   * 2026-05-19: 추가 결제 유도 안내 추가 (N주 패키지 만료 → 연속 결제 흐름)
   * 2026-05-20 (P1-7 v0.5): "결제 안 하면 출석 불가" 명시 — inactive 차단 정책 도입에 따른 학부모 사전 안내
   */
  templateContent: `수업 크레딧 만료 예정 안내

수업: #{className}
잔여 크레딧: #{creditsRemaining}회
만료일: #{expiryDate}

만료 전에 사용해주세요.
결제 갱신을 하지 않으시면 만료일 이후 출석 처리가 불가합니다.
이어서 수강하시려면 추가 결제를 진행해주세요.
감사합니다.`,

  /**
   * 필수 치환 변수
   */
  requiredFields: ["className", "creditsRemaining", "expiryDate"],

  /**
   * 인앱 알림용 딥링크 경로 (선택적으로 활용).
   *   classId 가 주어지면 결제 화면으로 직접 이동.
   */
  buildDeepLink(classId?: string): string | undefined {
    return classId ? `/payment/options?classId=${classId}` : undefined;
  },

  /**
   * 템플릿 렌더링
   */
  render(data: {
    className: string;
    creditsRemaining: string;
    expiryDate: string;
  }): string {
    let message = this.templateContent;

    message = message.replace(/#{className}/g, data.className);
    message = message.replace(/#{creditsRemaining}/g, data.creditsRemaining);
    message = message.replace(/#{expiryDate}/g, data.expiryDate);

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
