import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY, UserType } from "./roles.decorator";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { isAdminRole } from "./constants/chldiv.constants";
import {
  AuthenticatedRequest,
  JwtUserPayload,
} from "@/common/interfaces/authenticated-request.interface";

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // [2026-05-14 fix] @Public() 엔드포인트는 RolesGuard 도 우회.
    //
    // 배경: JwtAuthGuard 는 @Public() 메타데이터 감지 시 인증을 건너뛰고
    //   request.user 를 채우지 않는다. 그런데 AuthController 처럼 클래스 레벨에
    //   @Roles(...) 가 부착된 컨트롤러의 @Public() 메서드(/auth/login, /register 등)는
    //   RolesGuard 가 클래스 레벨 @Roles 메타데이터를 읽고 user 가 없으므로
    //   403 "인증되지 않은 사용자입니다." 를 던졌다.
    //
    // 해결: NestJS 표준 패턴대로 @Public() 은 "인증·인가 모두 우회" 시맨틱을 가지므로
    //   RolesGuard 도 동일하게 가드한다. 이로써 한 곳의 가드 수정만으로 모든
    //   컨트롤러의 동일 버그 재발이 차단된다.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<UserType[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user: JwtUserPayload | undefined = request.user;

    if (!user) {
      this.logger.warn(
        `[RolesGuard] 인증되지 않은 접근 시도: ${request.method} ${request.url}`,
      );
      throw new ForbiddenException("인증되지 않은 사용자입니다.");
    }

    // 대소문자 구분 없이 비교 (안전성 강화)
    const userRole = user.userType?.toUpperCase?.() || user.userType;

    // 슈퍼 관리자 자동 통과: ADMIN / SYSTEM / OPER 는 모든 @Roles 요구 사항을 통과한다.
    // 근거: teamplus-admin 대시보드는 chldiv=ADM 로그인 경로로만 진입하며
    //      해당 경로는 SYSTEM/OPER 만 허용 (chldiv 가드가 1차 필터).
    //      ADM 진입 후에도 개별 API 는 일반 역할(@Roles(PARENT,COACH,...)) 만 명시된
    //      경우가 많아 SYSTEM/OPER 가 정당하게 접근 가능한 관리용 API 에도 403 이 발생하는
    //      문제(예: /notices/mine/unread-count)가 있었다. 관리자급 역할은 공용 조회/집계
    //      API 접근이 필요하므로 일괄 통과 처리.
    if (isAdminRole(userRole)) {
      return true;
    }

    const hasRole = requiredRoles.some(
      (role) => role.toUpperCase() === userRole,
    );

    if (!hasRole) {
      this.logger.warn(
        `[RolesGuard] 권한 없음 - User: ${user.email}, UserType: ${user.userType}, Required: ${requiredRoles.join(", ")}, URL: ${request.url}`,
      );
      throw new ForbiddenException(
        `이 작업을 수행할 권한이 없습니다. 필요 권한: ${requiredRoles.join(", ")}`,
      );
    }

    return true;
  }
}
