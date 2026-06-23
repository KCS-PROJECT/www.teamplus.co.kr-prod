import { SetMetadata } from "@nestjs/common";

export const AUDIT_ACTION_KEY = "teamplus:audit-action";

export interface AuditActionOptions {
  /** 액션 식별자 — kebab-case 추천. 예: 'user.approve', 'role.change', 'payment.refund' */
  action: string;
  /** 리소스 종류 — 예: 'User', 'Enrollment', 'Payment'. AuditLog.resource 컬럼. */
  resource: string;
  /**
   * 요청 본문(body/params/query) 중 민감 정보 제외 위해 기록할 키 목록.
   * 미지정 시 메타데이터 없이 액션만 기록.
   */
  includeKeys?: string[];
}

/**
 * 컨트롤러 메서드에 부착하면 `AuditInterceptor` 가 자동으로 AuditLog 를 생성한다.
 *
 * @example
 *   @Post(':id/approve')
 *   @Roles('ACADEMY_DIRECTOR', 'DIRECTOR')
 *   @AuditAction({ action: 'academy.member.approve', resource: 'AcademyMember', includeKeys: ['memberId'] })
 *   async approveMember(@Param('id') id: string, @Body() dto: ApproveDto) { ... }
 *
 * 기록 시점:
 *  - 메서드가 정상 반환 (성공 응답) 직후
 *  - 예외 throw 시 기록하지 않음 (실패 액션은 별도 로그 시스템에서 추적)
 */
export const AuditAction = (options: AuditActionOptions) =>
  SetMetadata(AUDIT_ACTION_KEY, options);
