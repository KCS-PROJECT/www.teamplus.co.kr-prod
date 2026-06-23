import { ExecutionContext, Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/**
 * Optional JWT 인증 가드 (공용).
 *
 * 동작:
 * - 유효한 JWT 토큰이 Authorization 헤더에 있으면 `req.user`를 채움
 * - 토큰이 없거나 만료/무효이면 **에러 없이 통과** (req.user = undefined)
 *
 * 용도:
 * - 비로그인·로그인 모두 허용하되 로그인 사용자에게만 추가 처리(예: 연령 노출 필터)를
 *   적용하는 @Public 엔드포인트 (예: GET /api/v1/search).
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard("jwt") {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      await super.canActivate(context);
    } catch {
      // 토큰 없음/만료/무효 모두 무시 — 비로그인 상태로 통과
    }
    return true;
  }

  handleRequest<TUser = unknown>(
    _err: unknown,
    user: TUser | false,
  ): TUser | undefined {
    return user || undefined;
  }
}
