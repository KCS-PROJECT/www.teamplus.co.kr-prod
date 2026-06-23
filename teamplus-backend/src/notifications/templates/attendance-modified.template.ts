/**
 * 출석 정정 알림톡 템플릿 — PR-D (v0.8)
 *
 * 카카오 비즈니스 승인 필요 (운영팀 작업, 1~3일 소요).
 *
 * 발송 시점: 코치가 학생의 출석을 정정 (present ↔ absent 또는 신규 present) 했을 때,
 *           학부모에게 사후 알림.
 *
 * 의문 시 학부모는 채팅(chat 모듈) 으로 코치에게 직접 문의 — 별도 이의제기 워크플로우 없음 (v0.5 결정).
 */

export const ATTENDANCE_MODIFIED_TEMPLATE = {
  templateCode: "ATTENDANCE_MODIFIED_001",
  templateName: "출석 정정 알림",

  /**
   * 템플릿 내용
   *
   * 변수:
   *   - studentName: 학생 이름
   *   - className: 수업 이름
   *   - attendanceDate: 정정 대상 출석일
   *   - fromStatus: 정정 전 상태 (출석/결석/미체크)
   *   - toStatus: 정정 후 상태 (출석/결석)
   *   - reason: 코치 입력 사유
   *   - creditsBefore: 정정 전 잔여 회차
   *   - creditsAfter: 정정 후 잔여 회차
   */
  templateContent: `출석 정정 안내

#{studentName}님의 #{attendanceDate} #{className} 출석이 정정되었습니다.

변경: #{fromStatus} → #{toStatus}
사유: #{reason}
잔여 회차: #{creditsBefore}회 → #{creditsAfter}회

문의는 코치에게 채팅으로 연락해주세요.`,

  /**
   * 필수 치환 변수
   */
  requiredFields: [
    "studentName",
    "className",
    "attendanceDate",
    "fromStatus",
    "toStatus",
    "reason",
    "creditsBefore",
    "creditsAfter",
  ],

  /**
   * 템플릿 렌더링
   */
  render(data: {
    studentName: string;
    className: string;
    attendanceDate: string;
    fromStatus: string;
    toStatus: string;
    reason: string;
    creditsBefore: string;
    creditsAfter: string;
  }): string {
    let message = this.templateContent;

    message = message.replace(/#{studentName}/g, data.studentName);
    message = message.replace(/#{className}/g, data.className);
    message = message.replace(/#{attendanceDate}/g, data.attendanceDate);
    message = message.replace(/#{fromStatus}/g, data.fromStatus);
    message = message.replace(/#{toStatus}/g, data.toStatus);
    message = message.replace(/#{reason}/g, data.reason);
    message = message.replace(/#{creditsBefore}/g, data.creditsBefore);
    message = message.replace(/#{creditsAfter}/g, data.creditsAfter);

    return message;
  },

  /**
   * 한글 상태 라벨 매핑 — present/absent/unchecked → 출석/결석/미체크
   */
  statusLabel(status: string | null | undefined): string {
    switch (status) {
      case "present":
        return "출석";
      case "absent":
        return "결석";
      case "unchecked":
      case null:
      case undefined:
        return "미체크";
      default:
        return status;
    }
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
