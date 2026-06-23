/**
 * 알림톡 템플릿 인덱스
 *
 * 모든 템플릿을 중앙에서 관리
 */

export { PAYMENT_SUCCESS_TEMPLATE } from "./payment-success.template";
export { MEMBERSHIP_APPROVED_TEMPLATE } from "./membership-approved.template";
export { CLASS_REMINDER_TEMPLATE } from "./class-reminder.template";
export { ATTENDANCE_CONFIRMED_TEMPLATE } from "./attendance-confirmed.template";
export { ATTENDANCE_MODIFIED_TEMPLATE } from "./attendance-modified.template"; // PR-D (v0.8)
export { CREDIT_EXPIRY_TEMPLATE } from "./credit-expiry.template";
export { ENROLLMENT_OPEN_TEMPLATE } from "./enrollment-open.template";
export { ENROLLMENT_DEADLINE_TEMPLATE } from "./enrollment-deadline.template";

/**
 * 템플릿 타입 정의
 */
export interface AlimtalkTemplate {
  templateCode: string;
  templateName: string;
  templateContent: string;
  requiredFields: string[];
  render(data: Record<string, string>): string;
  validate(data: Record<string, string>): { valid: boolean; errors: string[] };
}
