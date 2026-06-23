import { Request } from "express";

/**
 * JWT 토큰 서명/검증 시 사용하는 raw payload 타입.
 *
 * AuthService.generateTokens()가 만드는 페이로드:
 *   - sub:      userId (string)
 *   - userType: UserType (string)
 *   - name:     사용자 표시 이름 (optional)
 *   - iat:      issued-at (epoch seconds, jwt.sign이 자동 부여)
 *   - exp:      expiration (epoch seconds, jwt.sign이 자동 부여)
 *   - tokenType: refresh 토큰에만 부여 ("refresh")
 *   - jti:      세션 ID — 로그인 시 발급, rotation 동안 유지.
 *               Redis refresh 키 분리(`refresh:{userId}:{jti}`)와
 *               logout 시 자기 세션 특정에 사용 (구토큰은 없을 수 있음)
 *
 * JwtStrategy.validate(req, payload) / jwtService.verify() 결과의 타입으로 사용.
 */
export interface JwtPayload {
  sub: string;
  userType: string;
  name?: string;
  tokenVersion?: number;
  iat?: number;
  exp?: number;
  tokenType?: "refresh";
  jti?: string;
}

/**
 * JWT 인증 완료 후 req.user에 주입되는 페이로드 타입.
 *
 * JwtStrategy.validate()가 반환하는 객체:
 *   { id, email, userType, status } (from User select) + { name } (from JWT payload)
 */
export interface JwtUserPayload {
  id: string;
  email: string;
  userType: string;
  status?: string;
  name?: string;
}

/**
 * JWT AuthGuard를 통과한 Express Request.
 * `@Request() req: AuthenticatedRequest` 형태로 사용.
 */
export interface AuthenticatedRequest extends Request {
  user: JwtUserPayload;
}
