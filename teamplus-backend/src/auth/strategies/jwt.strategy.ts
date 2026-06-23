import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Request } from "express";
import { AuthService } from "../auth.service";
import { JwtPayload } from "@/common/interfaces/authenticated-request.interface";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("JWT_SECRET"),
      passReqToCallback: true, // Request 객체를 validate에 전달
      // [2026-05-13 Phase E-4] Algorithm pinning — HS256 만 허용.
      //   passport-jwt 는 jsonwebtoken.verify 의 algorithms 옵션을 그대로 전달한다.
      //   알고리즘이 명시되지 않으면 자동 추론으로 'none' 공격에 취약.
      algorithms: ["HS256"],
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    // payload contains: sub (userId), userType, iat

    // [2026-06-10 SECURITY] Token type 분리 — refresh 토큰을 access 토큰으로 사용 차단.
    //   generateTokens()는 refresh 토큰에 tokenType:"refresh"를 부여한다.
    //   JWT_REFRESH_SECRET 미설정 시 refresh 가 access 와 같은 JWT_SECRET 으로 서명되므로,
    //   이 검증이 없으면 7~30일 만료의 refresh 토큰을 Authorization: Bearer 로 그대로 넣어
    //   모든 보호 엔드포인트를 통과(로그아웃 후에도)할 수 있다. access 전용 검증을 강제한다.
    if (payload.tokenType === "refresh") {
      throw new UnauthorizedException(
        "유효하지 않은 토큰입니다. 다시 로그인해주세요.",
      );
    }

    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace("Bearer ", "");

    // Check if token is blacklisted (logged out)
    if (token) {
      const isBlacklisted = await this.authService.isTokenBlacklisted(token);
      if (isBlacklisted) {
        throw new UnauthorizedException(
          "토큰이 만료되었습니다. 다시 로그인해주세요.",
        );
      }
    }

    const user = await this.authService.validateUser(payload.sub);

    // [logout-all] 모든 기기 로그아웃 후 발급 이전 토큰 차단.
    //   payload.tokenVersion 이 없으면(구 토큰) 검증 생략 — 자연 만료 대기(최대 15분).
    //
    // [2026-06-19] 로컬 dev 동시 로그인 허용 환경에서는 tokenVersion 검증을 건너뛴다.
    //   tokenVersion 은 공유 DEV DB 에 저장되어 모든 환경이 공유하는데(refresh 토큰
    //   Redis 는 환경별 분리), 단일 세션 정책이 켜진 다른 환경(배포/staging 의
    //   NODE_ENV=production, tbot 등)이 같은 계정으로 로그인하면 tokenVersion 이
    //   증가해 로컬 dev 세션 토큰이 즉시 무효화되는 "주기적 자동 로그아웃"이 발생한다.
    //   운영(production)은 isConcurrentLoginAllowed()=false 이므로 검증 그대로 유지.
    const concurrentDevLogin =
      process.env.NODE_ENV === "development" &&
      process.env.AUTH_ALLOW_CONCURRENT_LOGIN === "true";
    if (
      !concurrentDevLogin &&
      payload.tokenVersion != null &&
      user.tokenVersion != null &&
      payload.tokenVersion !== user.tokenVersion
    ) {
      throw new UnauthorizedException(
        "다른 기기에서 로그아웃되었습니다. 다시 로그인해주세요.",
      );
    }

    return { ...user, name: payload.name ?? "" };
  }
}
