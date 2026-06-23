import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SignJWT, importPKCS8 } from "jose";

/**
 * Sign in with Apple — 토큰 교환·회수(revoke) 서비스
 *
 * 목적: iOS 심사 5.1.1(v) — "Sign in with Apple 을 사용하는 앱은 계정 삭제 시
 * 사용자의 Apple 토큰을 반드시 revoke 해야 한다."
 *
 * 플로우:
 *  1. 로그인 시 클라이언트가 `authorizationCode` 를 전달
 *  2. `exchangeAuthorizationCode()` 로 Apple `/auth/token` 에서 refresh_token 획득
 *     → SocialAccount.appleRefreshToken 에 저장
 *  3. 계정 삭제(탈퇴 비식별화)·소셜 연결 해제 시 `revokeRefreshToken()` 호출
 *     → Apple `/auth/revoke` 로 토큰 무효화
 *
 * client_secret 은 Apple Developer 의 .p8 개인키로 서명한 ES256 JWT 다.
 * 필요한 환경 변수(미설정 시 기능 비활성 — isConfigured()=false):
 *  - APPLE_TEAM_ID       : Apple Developer Team ID (10자)
 *  - APPLE_KEY_ID        : Sign in with Apple Key ID (.p8 발급 시)
 *  - APPLE_PRIVATE_KEY   : .p8 파일 내용 (PKCS#8 PEM, 개행은 \n 또는 실제 개행)
 *  - APPLE_CLIENT_ID     : 토큰 교환·revoke 에 사용할 client_id
 *                          (네이티브 앱 = 앱 Bundle ID, 웹 = Service ID)
 *
 * ⚠️ refresh_token 은 발급에 사용된 client_id 와 동일한 client_id 로만 revoke 가능하다.
 *    네이티브(앱)·웹의 client_id 가 다르므로, 운영에서는 앱 심사 대상인 네이티브
 *    Bundle ID 를 APPLE_CLIENT_ID 로 설정한다. (웹 Service ID 코드 교환 실패 시
 *    로그인은 정상 진행되고 refresh_token 만 저장되지 않는다 — graceful degradation.)
 */
@Injectable()
export class AppleTokenService {
  private readonly logger = new Logger(AppleTokenService.name);

  private static readonly TOKEN_URL = "https://appleid.apple.com/auth/token";
  private static readonly REVOKE_URL = "https://appleid.apple.com/auth/revoke";
  private static readonly AUDIENCE = "https://appleid.apple.com";

  constructor(private readonly configService: ConfigService) {}

  /** 필수 환경 변수가 모두 설정되어 있는지 — 미설정 시 revoke/교환을 건너뛴다. */
  isConfigured(): boolean {
    return Boolean(
      this.configService.get<string>("APPLE_TEAM_ID") &&
        this.configService.get<string>("APPLE_KEY_ID") &&
        this.configService.get<string>("APPLE_PRIVATE_KEY") &&
        this.configService.get<string>("APPLE_CLIENT_ID"),
    );
  }

  private getClientId(): string {
    return this.configService.get<string>("APPLE_CLIENT_ID") ?? "";
  }

  /**
   * client_secret JWT 생성 (ES256, .p8 개인키 서명)
   * - header: { alg: ES256, kid: APPLE_KEY_ID }
   * - payload: { iss: APPLE_TEAM_ID, aud: appleid.apple.com, sub: client_id, iat, exp }
   * exp 는 Apple 규정상 최대 6개월. 요청 시점마다 생성하므로 짧게(1시간) 둔다.
   */
  private async generateClientSecret(): Promise<string> {
    const teamId = this.configService.get<string>("APPLE_TEAM_ID")!;
    const keyId = this.configService.get<string>("APPLE_KEY_ID")!;
    const rawKey = this.configService.get<string>("APPLE_PRIVATE_KEY")!;

    // env 에 한 줄로 저장된 경우 \n 을 실제 개행으로 복원
    const pkcs8 = rawKey.includes("\\n")
      ? rawKey.replace(/\\n/g, "\n")
      : rawKey;

    const privateKey = await importPKCS8(pkcs8, "ES256");

    return new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: keyId })
      .setIssuer(teamId)
      .setAudience(AppleTokenService.AUDIENCE)
      .setSubject(this.getClientId())
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);
  }

  /**
   * authorizationCode → refresh_token 교환.
   * 실패(코드 만료·client_id 불일치 등) 시 null 반환(로그인은 계속 진행).
   */
  async exchangeAuthorizationCode(
    authorizationCode: string,
  ): Promise<string | null> {
    if (!this.isConfigured()) {
      this.logger.warn(
        "Apple 자격증명 미설정 — authorizationCode 교환 건너뜀 (refresh_token 미저장)",
      );
      return null;
    }

    try {
      const clientSecret = await this.generateClientSecret();
      const body = new URLSearchParams({
        client_id: this.getClientId(),
        client_secret: clientSecret,
        code: authorizationCode,
        grant_type: "authorization_code",
      });

      const res = await fetch(AppleTokenService.TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      if (!res.ok) {
        const errText = await res.text();
        this.logger.warn(
          `Apple /auth/token 교환 실패 (${res.status}): ${errText}`,
        );
        return null;
      }

      const data = (await res.json()) as { refresh_token?: string };
      if (!data.refresh_token) {
        this.logger.warn("Apple 응답에 refresh_token 없음");
        return null;
      }
      return data.refresh_token;
    } catch (error) {
      this.logger.error(
        `Apple authorizationCode 교환 중 오류: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * refresh_token 무효화 (계정 삭제·연결 해제 시).
   * iOS 5.1.1(v) 준수. 실패해도 예외를 던지지 않고 false 반환(탈퇴 흐름 차단 금지).
   */
  async revokeRefreshToken(refreshToken: string): Promise<boolean> {
    if (!this.isConfigured()) {
      this.logger.warn("Apple 자격증명 미설정 — revoke 건너뜀");
      return false;
    }
    if (!refreshToken) return false;

    try {
      const clientSecret = await this.generateClientSecret();
      const body = new URLSearchParams({
        client_id: this.getClientId(),
        client_secret: clientSecret,
        token: refreshToken,
        token_type_hint: "refresh_token",
      });

      const res = await fetch(AppleTokenService.REVOKE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      if (!res.ok) {
        const errText = await res.text();
        this.logger.warn(
          `Apple /auth/revoke 실패 (${res.status}): ${errText}`,
        );
        return false;
      }

      this.logger.log("✅ Apple refresh_token revoke 완료");
      return true;
    } catch (error) {
      this.logger.error(
        `Apple revoke 중 오류: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}
