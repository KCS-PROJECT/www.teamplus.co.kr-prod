import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Headers,
  HttpException,
  UnauthorizedException,
  Req,
  Res,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Throttle, SkipThrottle } from "@nestjs/throttler";
import { Public } from "./public.decorator";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { TwoFactorService } from "./two-factor.service";
import { EmailVerificationService } from "./email-verification.service";
import { securityConfig } from "@/config/security.config";
import { CryptoService } from "./services/crypto.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { EncryptedLoginDto } from "./dto/encrypted-login.dto";
import { CHLDIV, Chldiv } from "./constants/chldiv.constants";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { SignupDto } from "./dto/signup.dto";
import { FindIdDto } from "./dto/find-id.dto";
import { FindAccountDto, FindIdByIdentityDto } from "./dto/find-account.dto";
import { SendResetCodeDto, ResetPasswordDto } from "./dto/reset-password.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { WithdrawRequestDto } from "./dto/withdraw.dto";
import { LoggerService } from "@/logger/logger.service";
import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import { Roles } from "./roles.decorator";
import { AuditAction } from "@/common/decorators";
import { extractClientIp } from "@/common/utils/extract-client-ip.util";

@ApiTags("Authentication")
@Controller("api/v1/auth")
// [2026-05-13 roles-check] 클래스 레벨 기본 권한.
//   대부분 메서드는 @Public() 으로 인증 우회. 보호 메서드(logout, profile, 2FA 등)는
//   인증된 모든 사용자 접근 허용. 더 좁은 권한이 필요한 메서드는 메서드 레벨로 override.
@Roles(
  "ADMIN",
  "DIRECTOR",
  "ACADEMY_DIRECTOR",
  "COACH",
  "PARENT",
  "TEEN",
  "CHILD",
)
export class AuthController {
  constructor(
    private authService: AuthService,
    private cryptoService: CryptoService,
    private logger: LoggerService,
    private twoFactorService: TwoFactorService,
    private emailVerificationService: EmailVerificationService,
  ) {}

  @Public()
  @Post("register")
  @Throttle({
    default: {
      limit: securityConfig.rateLimit.register.limit,
      ttl: securityConfig.rateLimit.register.ttl,
    },
  })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "User registration" })
  @ApiResponse({
    status: 201,
    description: "User registered successfully",
    schema: {
      type: "object",
      properties: {
        user: {
          type: "object",
          properties: {
            id: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" },
            userType: {
              type: "string",
              enum: [
                "SYSTEM",
                "OPER",
                "ADMIN",
                "DIRECTOR",
                "ACADEMY_DIRECTOR",
                "COACH",
                "PARENT",
                "TEEN",
                "CHILD",
              ],
            },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        accessToken: { type: "string" },
        refreshToken: { type: "string" },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "Invalid input or user already exists",
  })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Public()
  @Post("login")
  @Throttle({
    default: {
      limit: securityConfig.rateLimit.login.limit,
      ttl: securityConfig.rateLimit.login.ttl,
    },
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "User login with E2E encryption" })
  @ApiResponse({
    status: 200,
    description: "Login successful",
    schema: {
      type: "object",
      properties: {
        user: {
          type: "object",
          properties: {
            id: { type: "string" },
            email: { type: "string" },
            userType: {
              type: "string",
              enum: [
                "PARENT",
                "COACH",
                "CHILD",
                "DIRECTOR",
                "TEEN",
                "ADMIN",
                "ACADEMY_DIRECTOR",
              ],
              description: "APP 허용 UserType 7종 (chldiv=APP)",
            },
          },
        },
        accessToken: { type: "string" },
        refreshToken: { type: "string" },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description:
      "이메일 또는 비밀번호가 올바르지 않습니다. 또는 해당 화면에서는 로그인할 수 없는 계정입니다.",
  })
  async login(
    @Body() encryptedDto: EncryptedLoginDto,
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: ExpressResponse,
  ) {
    // APP 분기 로그인 (teamplus-web · teamplus-app · tbot)
    const result = await this.handleEncryptedLogin(encryptedDto, req, CHLDIV.APP);
    // [A-1] httpOnly refresh 쿠키 추가 설정 (body 응답 불변)
    this.setRefreshCookie(
      res,
      (result as { refreshToken?: string })?.refreshToken,
    );
    return result;
  }

  /**
   * 어드민 대시보드 전용 로그인 (chldiv=ADM)
   *
   * - 허용 UserType: SYSTEM, OPER
   * - 그 외 UserType 이 시도하면 `해당 화면에서는 로그인할 수 없는 계정입니다.` 401
   * - teamplus-admin 의 login 페이지만 호출
   */
  @Public()
  @Post("admin/login")
  @Throttle({
    default: {
      limit: securityConfig.rateLimit.login.limit,
      ttl: securityConfig.rateLimit.login.ttl,
    },
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Admin dashboard login with E2E encryption (chldiv=ADM)",
    description:
      "어드민 대시보드 전용 로그인. SYSTEM/OPER UserType 만 허용. teamplus-admin 에서만 호출.",
  })
  @ApiResponse({
    status: 200,
    description: "관리자 로그인 성공 (SYSTEM/OPER UserType)",
    schema: {
      type: "object",
      properties: {
        user: {
          type: "object",
          properties: {
            id: { type: "string" },
            email: { type: "string" },
            userType: {
              type: "string",
              enum: ["SYSTEM", "OPER"],
              description: "ADM 허용 UserType 2종 (chldiv=ADM)",
            },
          },
        },
        accessToken: { type: "string" },
        refreshToken: { type: "string" },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description:
      "이메일/비밀번호 불일치 또는 '해당 화면에서는 로그인할 수 없는 계정입니다.' (SYSTEM/OPER 외 UserType 시도 시)",
  })
  async adminLogin(
    @Body() encryptedDto: EncryptedLoginDto,
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: ExpressResponse,
  ) {
    const result = await this.handleEncryptedLogin(encryptedDto, req, CHLDIV.ADM);
    // [A-1] httpOnly refresh 쿠키 추가 설정 (body 응답 불변)
    this.setRefreshCookie(
      res,
      (result as { refreshToken?: string })?.refreshToken,
    );
    return result;
  }

  /**
   * 클라이언트 IP/UA 추출 헬퍼 (AuditLog · login chldiv 게이트 공통 사용)
   *
   * - `x-forwarded-for` 첫 토큰 우선 (프록시 체인 대응)
   * - fallback: `req.ip` → `req.socket.remoteAddress` → undefined
   * - userAgent: `user-agent` 헤더 또는 undefined
   */
  private extractClientInfo(req: ExpressRequest): {
    ipAddress: string | undefined;
    userAgent: string | undefined;
  } {
    const ipAddress = extractClientIp(req);
    const userAgent =
      (req.headers?.["user-agent"] as string | undefined) ?? undefined;
    return { ipAddress, userAgent };
  }

  /**
   * 암호화 로그인 공통 처리 — chldiv 주입만 다르다.
   */
  // ─────────────────────────────────────────────────────────────
  // [A-1 2026-06-07] httpOnly refresh 쿠키 (additive · CODE_REVIEW A-1)
  //   목적: refresh 토큰을 XSS 접근 불가한 httpOnly 쿠키로도 제공해 localStorage
  //   노출면을 점진 축소. body 응답은 불변이라 기존 클라이언트(app·web·tbot) 무영향.
  //   ⚠️ cross-origin(web 5001 → backend 5003) 전송은 prod HTTPS + SameSite 정합 필요.
  //   읽기는 cookie-parser 없이 req.headers.cookie 직접 파싱(신규 의존성 0).
  // ─────────────────────────────────────────────────────────────
  private static readonly REFRESH_COOKIE = "teamplus_refresh_token";

  private setRefreshCookie(res: ExpressResponse, refreshToken?: string): void {
    if (!refreshToken) return;
    res.cookie(AuthController.REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      // [2026-06-15 SECURITY] path 를 / 로 확장 — web 과 api 가 동일 호스트
      //   (teamplusweb.icetimes.co.kr)이므로 web 미들웨어가 이 httpOnly refresh 쿠키로
      //   refresh 존재를 판정할 수 있게 한다(JS 접근 refresh 쿠키 제거의 선행 조건).
      //   getRefreshFromCookie 는 path 무관 헤더 파싱이라 백엔드 refresh 읽기 영향 없음.
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7일 (refresh 만료와 정합)
    });
  }

  private clearRefreshCookie(res: ExpressResponse): void {
    res.clearCookie(AuthController.REFRESH_COOKIE, { path: "/" });
  }

  private getRefreshFromCookie(req: ExpressRequest): string | undefined {
    const raw = req.headers.cookie;
    if (!raw) return undefined;
    for (const part of raw.split(";")) {
      const idx = part.indexOf("=");
      if (idx < 0) continue;
      const key = part.slice(0, idx).trim();
      if (key === AuthController.REFRESH_COOKIE) {
        return decodeURIComponent(part.slice(idx + 1).trim());
      }
    }
    return undefined;
  }

  private async handleEncryptedLogin(
    encryptedDto: EncryptedLoginDto,
    req: ExpressRequest,
    chldiv: Chldiv,
  ) {
    let email: string | undefined;
    let password: string | undefined;
    let force = false;

    try {
      // 1. 암호화된 페이로드 복호화 (감사 로깅 포함)
      const decryptedJson =
        await this.cryptoService.decryptCredentialsWithAudit(
          encryptedDto,
          req,
          undefined, // userId는 로그인 전이므로 없음
        );
      // force: 단일 세션 정책 — 409 SESSION_EXISTS 후 사용자가
      // "기존 접속 종료" 확인 시 암호화 페이로드에 포함되어 재요청된다.
      const parsed = JSON.parse(decryptedJson) as {
        email?: string;
        password?: string;
        force?: boolean;
      };
      email = parsed.email;
      password = parsed.password;
      force = parsed.force === true;
    } catch (error) {
      // 보안: 복호화 실패 상세 에러 메시지 노출 금지
      this.logger.error("Login decryption failed", error, {
        context: `auth.controller.login[${chldiv}]`,
      });
      throw new UnauthorizedException(
        "이메일 또는 비밀번호가 올바르지 않습니다.",
      );
    }

    // 2. 복호화된 데이터 유효성 검사
    if (!email || !password) {
      this.logger.logAuthEvent("login_failure", {
        reason: "invalid_credentials",
        email,
        chldiv,
      });
      throw new UnauthorizedException(
        "이메일 또는 비밀번호가 올바르지 않습니다.",
      );
    }

    try {
      // 3. 기존 인증 로직 호출 (IP/UA/chldiv 전달 → AuditLog + chldiv 게이트)
      const { ipAddress, userAgent } = this.extractClientInfo(req);
      return this.authService.login({ email, password } as LoginDto, {
        ipAddress,
        userAgent,
        chldiv,
        force,
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error("Login authentication failed", error, {
        context: `auth.controller.login[${chldiv}]`,
        email,
      });

      throw error;
    }
  }

  /**
   * [DEV ONLY] 평문 로그인 — tbot 폰 미리보기 자동 로그인 전용
   * - NODE_ENV === 'production' 에서는 404 NotFound (프로덕션 빌드 차단)
   * - E2E 암호화 우회, 테스트 계정(Test1234!) 로그인에만 사용
   * - 프로덕션 빌드로 배포 시에도 안전 (환경 변수 가드)
   */
  @Public()
  @Post("login/dev")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "[DEV ONLY] Plain-text login for tbot previews (chldiv=APP)",
  })
  async loginDev(@Body() body: LoginDto, @Req() req: ExpressRequest) {
    // [2026-06-10 SECURITY] 차단 조건 반전 — "production 이 아니면 허용"은 staging·prod 오타·
    //   NODE_ENV 미설정 등 production 이외 모든 값에서 평문 로그인이 노출된다.
    //   "development 환경에서 명시적 플래그가 켜졌을 때만 허용"으로 화이트리스트화한다.
    const isDevLoginEnabled =
      process.env.NODE_ENV === "development" &&
      process.env.ENABLE_DEV_LOGIN === "true";
    if (!isDevLoginEnabled) {
      throw new UnauthorizedException("Not available in this environment");
    }
    const { ipAddress, userAgent } = this.extractClientInfo(req);
    // APP 분기 dev 로그인 — tbot 테스트 전용.
    // ADM(chldiv=ADM) dev 엔드포인트는 의도적으로 제공하지 않는다 (관리자 평문 로그인 금지).
    return this.authService.login(body, {
      ipAddress,
      userAgent,
      chldiv: CHLDIV.APP,
      force: body.force === true,
    });
  }

  /**
   * 토큰 갱신
   * Refresh Token 남용 방지를 위한 Rate Limit 적용
   * 환경별: local(30/min) / development(20/min) / production(10/min)
   */
  @Public()
  @Post("refresh")
  @Throttle({
    default: {
      limit: securityConfig.rateLimit.refresh.limit,
      ttl: securityConfig.rateLimit.refresh.ttl,
    },
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Refresh access token" })
  @ApiResponse({
    status: 200,
    description: "Token refreshed successfully",
    schema: {
      type: "object",
      properties: {
        accessToken: { type: "string" },
        refreshToken: { type: "string" },
      },
    },
  })
  @ApiResponse({ status: 401, description: "Invalid or expired refresh token" })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: ExpressResponse,
  ) {
    // [A-1] body 우선, 없으면 httpOnly 쿠키 fallback (하위 호환)
    const refreshToken = dto.refreshToken || this.getRefreshFromCookie(req);
    if (!refreshToken) {
      throw new UnauthorizedException("Refresh Token이 필요합니다.");
    }
    const result = await this.authService.refreshToken(refreshToken);
    this.setRefreshCookie(
      res,
      (result as { refreshToken?: string })?.refreshToken,
    );
    return result;
  }

  @Post("logout")
  @SkipThrottle()
  @UseGuards(AuthGuard("jwt"))
  @ApiBearerAuth("access_token")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "User logout" })
  @ApiResponse({
    status: 200,
    description: "Logout successful",
    schema: {
      type: "object",
      properties: {
        message: { type: "string", example: "로그아웃되었습니다." },
      },
    },
  })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async logout(
    @Request() req: AuthenticatedRequest,
    @Headers("authorization") authorization: string,
    @Headers("x-device-id") deviceId: string,
    @Res({ passthrough: true }) res: ExpressResponse,
  ) {
    const accessToken = authorization?.replace("Bearer ", "");
    // [A-1] httpOnly refresh 쿠키 제거
    this.clearRefreshCookie(res);
    // [2026-06-20] x-device-id(앱 안정 식별자) 전달 → 이 디바이스 푸시 등록 비활성화.
    return this.authService.logout(req.user.id, accessToken, deviceId);
  }

  @Post("logout-all")
  @SkipThrottle()
  @UseGuards(AuthGuard("jwt"))
  @ApiBearerAuth("access_token")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "모든 기기에서 로그아웃",
    description:
      "현재 토큰을 블랙리스트 처리하고 tokenVersion을 증가시켜 모든 기기의 기존 토큰을 무효화합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "모든 기기 로그아웃 성공",
    schema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          example: "모든 기기에서 로그아웃되었습니다.",
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async logoutAll(
    @Request() req: AuthenticatedRequest,
    @Headers("authorization") authorization: string,
  ) {
    const accessToken = authorization?.replace("Bearer ", "");
    return this.authService.logoutAll(req.user.id, accessToken);
  }

  /**
   * 프로필 조회
   * JWT 인증 필수 엔드포인트이므로 Rate Limit 제외
   */
  @Get("profile")
  @SkipThrottle()
  @UseGuards(AuthGuard("jwt"))
  @ApiBearerAuth("access_token")
  @ApiOperation({ summary: "현재 사용자 프로필 조회" })
  @ApiResponse({
    status: 200,
    description: "프로필 조회 성공",
    schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        userType: { type: "string" },
        name: { type: "string" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
    },
  })
  @ApiResponse({ status: 401, description: "인증 실패" })
  async getProfile(@Request() req: AuthenticatedRequest) {
    return this.authService.getProfile(req.user.id);
  }

  /**
   * 프로필 수정
   * JWT 인증 필수 엔드포인트이므로 Rate Limit 제외
   */
  @Patch("profile")
  @SkipThrottle()
  @UseGuards(AuthGuard("jwt"))
  @ApiBearerAuth("access_token")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "프로필 수정" })
  @ApiResponse({
    status: 200,
    description: "프로필 수정 성공",
    schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        userType: { type: "string" },
        name: { type: "string" },
      },
    },
  })
  @ApiResponse({ status: 400, description: "잘못된 요청" })
  @ApiResponse({ status: 401, description: "인증 실패" })
  async updateProfile(
    @Request() req: AuthenticatedRequest,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(req.user.id, updateProfileDto);
  }

  /**
   * 비밀번호 변경
   * JWT 인증 필수 엔드포인트이므로 Rate Limit 제외
   */
  @Post("change-password")
  @SkipThrottle()
  @UseGuards(AuthGuard("jwt"))
  @ApiBearerAuth("access_token")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "비밀번호 변경" })
  @ApiResponse({
    status: 200,
    description: "비밀번호 변경 성공",
    schema: {
      type: "object",
      properties: {
        message: { type: "string", example: "비밀번호가 변경되었습니다." },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "현재 비밀번호가 일치하지 않습니다.",
  })
  @ApiResponse({ status: 401, description: "인증 실패" })
  async changePassword(
    @Request() req: AuthenticatedRequest,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      req.user.id,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
    );
  }

  /**
   * 회원가입 (프론트엔드 호환 엔드포인트)
   * 프론트엔드 auth.ts의 signup() → POST /auth/signup
   */
  @Public()
  @Post("signup")
  @Throttle({
    default: {
      limit: securityConfig.rateLimit.register.limit,
      ttl: securityConfig.rateLimit.register.ttl,
    },
  })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "회원가입 (프론트엔드 호환)" })
  @ApiResponse({ status: 201, description: "회원가입 성공" })
  @ApiResponse({
    status: 400,
    description: "이미 등록된 이메일/휴대폰 번호 또는 약관 미동의",
  })
  async signup(@Body() signupDto: SignupDto) {
    // 이메일 인증 폐기 — 아이디는 일반 식별자로 입력받고 중복확인만 수행.
    //   중복(이미 등록된 아이디)은 authService.signup 내부에서 차단된다.
    return this.authService.signup(signupDto);
  }

  /**
   * 아이디(이메일) 찾기
   * 이름과 휴대폰 번호로 등록된 이메일 조회
   */
  @Public()
  @Post("find-id")
  @Throttle({ default: { limit: 5, ttl: 300000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "아이디(이메일) 찾기" })
  @ApiResponse({
    status: 200,
    description: "이메일 찾기 성공",
    schema: {
      example: { email: "p***@example.com", createdAt: "2026-01-01T00:00:00Z" },
    },
  })
  @ApiResponse({
    status: 404,
    description: "일치하는 계정을 찾을 수 없습니다.",
  })
  async findId(@Body() findIdDto: FindIdDto) {
    return this.authService.findId(findIdDto.name, findIdDto.phone);
  }

  /**
   * [2026-06-17] 본인인증(휴대폰) 기반 아이디 찾기.
   *  휴대폰 본인인증 완료(requestId) → 가입 이력 있으면 아이디 반환, 없으면 found:false. 메일 발송 없음.
   */
  @Public()
  @Post("find-id-by-identity")
  @Throttle({ default: { limit: 5, ttl: 300000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "본인인증 기반 아이디 찾기 (가입 이력 조회)" })
  @ApiResponse({
    status: 200,
    description: "조회 성공",
    schema: {
      example: {
        found: true,
        loginId: "hong_gildong",
        createdAt: "2026-01-01T00:00:00Z",
      },
    },
  })
  @ApiResponse({ status: 400, description: "본인인증 미완료/만료" })
  async findIdByIdentity(@Body() dto: FindIdByIdentityDto) {
    return this.authService.findIdByIdentity(dto.identityVerificationId);
  }

  /**
   * [2026-06-17] 본인인증 기반 비밀번호 재설정 — 임시 비밀번호를 사용자가 입력한 이메일로 발송.
   *  휴대폰 본인인증 완료(requestId) + 받을 이메일 입력 → 계정 확인 시 임시 비밀번호 발급 후 해당 메일로 발송.
   */
  @Public()
  @Post("find-account")
  @Throttle({ default: { limit: 5, ttl: 300000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "본인인증 기반 비밀번호 재설정 (임시비밀번호 메일 발송)" })
  @ApiResponse({ status: 200, description: "메일 발송 성공" })
  @ApiResponse({ status: 400, description: "본인인증 미완료/만료" })
  @ApiResponse({ status: 404, description: "일치하는 가입 이력을 찾을 수 없습니다." })
  async findAccount(@Body() dto: FindAccountDto) {
    return this.authService.findAccountAndSendCredentials(
      dto.identityVerificationId,
      dto.email,
    );
  }

  /**
   * 비밀번호 재설정 인증코드 발송
   */
  @Public()
  @Post("password/send-code")
  @Throttle({ default: { limit: 3, ttl: 300000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "비밀번호 재설정 인증코드 발송" })
  @ApiResponse({
    status: 200,
    description: "인증코드 발송 성공",
    schema: { example: { message: "인증코드가 발송되었습니다." } },
  })
  async sendPasswordResetCode(@Body() dto: SendResetCodeDto) {
    return this.authService.sendPasswordResetCode(dto.email);
  }

  /**
   * 비밀번호 재설정
   * 인증코드 검증 후 새 비밀번호 설정
   */
  @Public()
  @Post("password/reset")
  @Throttle({ default: { limit: 5, ttl: 300000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "비밀번호 재설정" })
  @ApiResponse({
    status: 200,
    description: "비밀번호 재설정 성공",
    schema: { example: { message: "비밀번호가 변경되었습니다." } },
  })
  @ApiResponse({
    status: 400,
    description: "인증코드가 올바르지 않거나 만료되었습니다.",
  })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.email, dto.code, dto.newPassword);
  }

  // [제거 2026-06-10] POST social/:provider 소셜 로그인 라우트 — 소셜 로그인 전면 제거(Apple 4.8
  //   의무 해소)에 따라 비인증 자동가입 표면 폐쇄. 클라이언트(web/app) 호출처 0건 확인 후 제거.
  //   연결 계정 조회/해제(GET·DELETE social/*)는 탈퇴 시 Apple 토큰 revoke(iOS 5.1.1(v))와
  //   레거시 연동 정리에 필요하므로 유지.

  /**
   * 연결된 소셜 계정 목록 조회
   */
  @Get("social/accounts")
  @SkipThrottle()
  @UseGuards(AuthGuard("jwt"))
  @ApiBearerAuth("access_token")
  @ApiOperation({
    summary: "연결된 소셜 계정 목록 조회",
    description:
      "현재 사용자에게 연결된 소셜 계정(카카오, 구글) 목록을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "소셜 계정 목록 조회 성공",
    schema: {
      type: "object",
      properties: {
        socialAccounts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              provider: { type: "string", enum: ["kakao", "google"] },
              email: { type: "string", nullable: true },
              name: { type: "string", nullable: true },
              createdAt: { type: "string", format: "date-time" },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: "인증 실패" })
  async getSocialAccounts(@Request() req: AuthenticatedRequest) {
    return this.authService.getSocialAccounts(req.user.id);
  }

  /**
   * 소셜 계정 연결 해제
   * 마지막 로그인 수단인 경우 해제 불가
   */
  @Delete("social/:provider")
  @SkipThrottle()
  @UseGuards(AuthGuard("jwt"))
  @ApiBearerAuth("access_token")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "소셜 계정 연결 해제",
    description:
      "연결된 소셜 계정을 해제합니다. 비밀번호 없이 소셜만 사용하는 사용자는 마지막 소셜 계정 해제가 불가합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "소셜 계정 연결 해제 성공",
    schema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          example: "kakao 계정 연결이 해제되었습니다.",
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "마지막 소셜 계정은 연결 해제할 수 없습니다.",
  })
  @ApiResponse({ status: 401, description: "인증 실패" })
  @ApiResponse({
    status: 404,
    description: "연결된 소셜 계정을 찾을 수 없습니다.",
  })
  async disconnectSocial(
    @Request() req: AuthenticatedRequest,
    @Param("provider") provider: string,
  ) {
    return this.authService.disconnectSocialAccount(req.user.id, provider);
  }

  /**
   * 이메일 중복 확인
   * 사용자 열거 공격 방지를 위해 Rate Limit 적용 (30회/분)
   */
  @Public()
  @Get("check-email")
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: "이메일 중복 확인" })
  @ApiQuery({ name: "email", description: "확인할 이메일" })
  @ApiResponse({
    status: 200,
    description: "이메일 중복 확인 결과",
    schema: { example: { exists: false } },
  })
  async checkEmailExists(@Query("email") email: string) {
    return this.authService.checkEmailExists(email);
  }

  // ──────────────────────────────────────────────────────────
  // 회원가입 이메일 인증 (2026-05-12 신설)
  //  · POST /auth/email/send-code   { email }
  //  · POST /auth/email/verify-code { email, code }
  // ──────────────────────────────────────────────────────────

  /**
   * 회원가입용 이메일 인증 코드 발송. 1분 쿨다운.
   */
  @Public()
  @Post("email/send-code")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: "회원가입 이메일 인증 코드 발송" })
  async sendEmailVerifyCode(@Body() body: { email: string }) {
    return this.emailVerificationService.sendCode(body?.email ?? "");
  }

  /**
   * 회원가입용 이메일 인증 코드 검증. 성공 시 30분간 가입 시도 가능.
   */
  @Public()
  @Post("email/verify-code")
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: "회원가입 이메일 인증 코드 검증" })
  async verifyEmailVerifyCode(@Body() body: { email: string; code: string }) {
    return this.emailVerificationService.verifyCode(
      body?.email ?? "",
      body?.code ?? "",
    );
  }

  /**
   * 휴대폰 번호 중복 확인
   * 사용자 열거 공격 방지를 위해 Rate Limit 적용 (30회/분)
   */
  @Public()
  @Get("check-phone")
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: "휴대폰 번호 중복 확인" })
  @ApiQuery({ name: "phone", description: "확인할 휴대폰 번호" })
  @ApiResponse({
    status: 200,
    description: "휴대폰 번호 중복 확인 결과",
    schema: { example: { exists: false } },
  })
  async checkPhoneExists(@Query("phone") phone: string) {
    return this.authService.checkPhoneExists(phone);
  }

  // ==================== 회원 탈퇴 ====================

  /**
   * 회원 탈퇴 요청
   * 비밀번호 재확인 후 7일 유예 기간으로 탈퇴 대기 상태 전환
   */
  @Post("withdraw")
  @SkipThrottle()
  @UseGuards(AuthGuard("jwt"))
  @ApiBearerAuth("access_token")
  @AuditAction({
    action: "user.withdraw.request",
    resource: "User",
    includeKeys: ["reason"],
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "회원 탈퇴 요청",
    description:
      "비밀번호 확인 후 탈퇴 요청을 접수합니다. 7일 유예 기간 동안 철회할 수 있으며, 유예 기간 후 개인정보가 비식별화됩니다.",
  })
  @ApiResponse({
    status: 200,
    description: "탈퇴 요청 접수 성공",
    schema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          example: "탈퇴 요청이 접수되었습니다. 7일 이내에 철회할 수 있습니다.",
        },
        withdrawRequestedAt: {
          type: "string",
          format: "date-time",
        },
        gracePeriodEnd: {
          type: "string",
          format: "date-time",
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "비밀번호 불일치 또는 이미 탈퇴 요청 상태",
  })
  @ApiResponse({ status: 401, description: "인증 실패" })
  async withdraw(
    @Request() req: AuthenticatedRequest,
    @Body() withdrawDto: WithdrawRequestDto,
  ) {
    return this.authService.requestWithdraw(
      req.user.id,
      withdrawDto.password,
      withdrawDto.reason,
      withdrawDto.confirmText,
    );
  }

  /**
   * 회원 탈퇴 철회
   * 유예 기간(7일) 내에 탈퇴를 취소할 수 있습니다.
   */
  @Post("withdraw/cancel")
  @SkipThrottle()
  @UseGuards(AuthGuard("jwt"))
  @ApiBearerAuth("access_token")
  @AuditAction({ action: "user.withdraw.cancel", resource: "User" })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "회원 탈퇴 철회",
    description:
      "유예 기간(7일) 내에 탈퇴 요청을 철회합니다. 계정이 정상 상태로 복원됩니다.",
  })
  @ApiResponse({
    status: 200,
    description: "탈퇴 철회 성공",
    schema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          example:
            "탈퇴 요청이 철회되었습니다. 정상적으로 서비스를 이용하실 수 있습니다.",
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "탈퇴 요청 상태가 아니거나 유예 기간 만료",
  })
  @ApiResponse({ status: 401, description: "인증 실패" })
  async cancelWithdraw(@Request() req: AuthenticatedRequest) {
    return this.authService.cancelWithdraw(req.user.id);
  }

  // ==================== 2FA (이중 인증) ====================

  @Post("2fa/enable")
  @SkipThrottle()
  @UseGuards(AuthGuard("jwt"))
  @ApiBearerAuth("access_token")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "2FA 설정 시작",
    description:
      "TOTP Secret을 생성하고 QR 코드 URI를 반환합니다. Google Authenticator 등 앱으로 스캔하세요.",
  })
  @ApiResponse({
    status: 200,
    description: "2FA 설정 시작 성공",
    schema: {
      type: "object",
      properties: {
        otpauthUri: {
          type: "string",
          example: "otpauth://totp/TEAMPLUS:user@example.com?secret=...",
        },
        secret: { type: "string", description: "수동 입력용 Base32 Secret" },
      },
    },
  })
  async twoFactorEnable(@Request() req: AuthenticatedRequest) {
    return this.twoFactorService.initEnable(req.user.id, req.user.email);
  }

  @Post("2fa/verify")
  @SkipThrottle()
  @UseGuards(AuthGuard("jwt"))
  @ApiBearerAuth("access_token")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "2FA 인증 코드 검증 후 활성화",
    description: "Authenticator 앱의 6자리 코드를 검증하고 2FA를 활성화합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "2FA 활성화 성공",
    schema: { example: { message: "2FA가 활성화되었습니다." } },
  })
  @ApiResponse({ status: 401, description: "인증 코드가 올바르지 않습니다." })
  async twoFactorVerify(
    @Request() req: AuthenticatedRequest,
    @Body("token") token: string,
  ) {
    await this.twoFactorService.verifyAndEnable(req.user.id, token);
    return { message: "2FA가 활성화되었습니다." };
  }

  @Post("2fa/disable")
  @SkipThrottle()
  @UseGuards(AuthGuard("jwt"))
  @ApiBearerAuth("access_token")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "2FA 비활성화",
    description: "현재 TOTP 코드로 재검증 후 2FA를 비활성화합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "2FA 비활성화 성공",
    schema: { example: { message: "2FA가 비활성화되었습니다." } },
  })
  @ApiResponse({ status: 401, description: "인증 코드가 올바르지 않습니다." })
  async twoFactorDisable(
    @Request() req: AuthenticatedRequest,
    @Body("token") token: string,
  ) {
    await this.twoFactorService.disable(req.user.id, token);
    return { message: "2FA가 비활성화되었습니다." };
  }

  @Get("2fa/status")
  @SkipThrottle()
  @UseGuards(AuthGuard("jwt"))
  @ApiBearerAuth("access_token")
  @ApiOperation({ summary: "2FA 상태 조회" })
  @ApiResponse({
    status: 200,
    description: "2FA 상태",
    schema: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        createdAt: { type: "string", format: "date-time", nullable: true },
      },
    },
  })
  async twoFactorStatus(@Request() req: AuthenticatedRequest) {
    return this.twoFactorService.getStatus(req.user.id);
  }
}
