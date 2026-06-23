import { ExecutionContext, Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/**
 * Optional JWT 인증 가드.
 *
 * 동작:
 * - 유효한 JWT 토큰이 Authorization 헤더에 있으면 `req.user`를 채움
 * - 토큰이 없거나, 있어도 만료/무효이면 **에러 없이 통과** (req.user = undefined)
 *
 * 용도:
 * - `POST /api/v1/matches/:id/view` 와 같이 **비로그인·로그인 모두 허용**하지만
 *   로그인 사용자에게만 1일 1회 조회수 증가를 적용하는 엔드포인트
 *
 * ⚠ 이 가드는 pickup-matches 모듈 전용 로컬 가드입니다.
 * 다른 모듈에서 재사용이 필요하면 `src/auth/` 로 승격 후 공용화하세요.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard("jwt") {
  /**
   * 기본 AuthGuard와 달리 canActivate 결과가 false/throw여도 차단하지 않음.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      // Passport JWT 전략 실행 (토큰 파싱 + validate() 호출)
      await super.canActivate(context);
    } catch {
      // 토큰 없음/만료/무효 모두 무시 — 비로그인 상태로 통과
    }
    return true;
  }

  /**
   * Passport의 handleRequest는 기본적으로 user가 없으면 throw.
   * Optional 가드이므로 에러/빈 user를 모두 흡수하여 undefined 반환.
   */
  handleRequest<TUser = unknown>(
    _err: unknown,
    user: TUser | false,
  ): TUser | undefined {
    return user || undefined;
  }
}
