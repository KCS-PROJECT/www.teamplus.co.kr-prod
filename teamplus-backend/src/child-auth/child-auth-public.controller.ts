import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { Public } from "@/auth/public.decorator";
import { ChildAuthService } from "./child-auth.service";
import { VerifyAndLoginDto, RequestOtpDto, VerifyOtpAndLoginDto } from "./dto";

/**
 * ChildAuth Public Controller
 *
 * 자녀 로그인용 PIN/OTP 인증 API (JWT 불필요 — Public 엔드포인트)
 *
 * - 고정 PIN 검증 + 로그인
 * - OTP 발송 요청
 * - OTP 검증 + 로그인
 *
 * 보안:
 * - Rate Limiting (Throttler)
 * - PIN 5회 실패 시 10분 잠금
 * - OTP 5회 실패 시 Redis 잠금
 * - PIN/OTP 평문 로깅 금지
 */
@ApiTags("Child Auth")
@Public()
@Controller("api/v1/child-auth")
export class ChildAuthPublicController {
  private readonly logger = new Logger(ChildAuthPublicController.name);

  constructor(private readonly childAuthService: ChildAuthService) {}

  /**
   * 고정 PIN 검증 + 로그인
   *
   * 부모가 사전 설정한 PIN으로 자녀가 인증하고 JWT를 발급받습니다.
   */
  @Post("verify-and-login")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "자녀 PIN 검증 + 로그인",
    description:
      "부모가 사전 설정한 PIN을 검증하고 JWT 토큰을 발급합니다. 5회 실패 시 10분 잠금.",
  })
  @ApiResponse({
    status: 200,
    description: "PIN 인증 성공, JWT 토큰 발급",
    schema: {
      example: {
        accessToken: "eyJhbGciOi...",
        refreshToken: "eyJhbGciOi...",
        user: {
          id: "clxyz...",
          firstName: "길동",
          lastName: "홍",
          email: "child@example.com",
          userType: "CHILD",
          name: "홍길동",
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: "PIN 불일치" })
  @ApiResponse({ status: 403, description: "잠금 상태 (5회 초과)" })
  @ApiResponse({ status: 404, description: "자녀 계정 또는 PIN 없음" })
  async verifyAndLogin(@Body() dto: VerifyAndLoginDto) {
    this.logger.log(`PIN 로그인 요청: email=${dto.childEmail}`);
    return this.childAuthService.verifyAndLogin(
      dto.childEmail,
      dto.pin,
      dto.challengeToken,
    );
  }

  /**
   * OTP 발송 요청
   *
   * PIN 미설정 시 DB에 등록된 부모 연락처로 6자리 인증번호를 SMS 발송.
   * 자녀는 부모 전화번호를 입력/알 필요 없으며, 응답의 sentTo로 마스킹된 번호 확인.
   */
  @Post("request-otp")
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "자녀 OTP 발송 요청",
    description:
      "자녀 이메일만 전달하면 서버가 연결된 부모 연락처를 조회하여 OTP 발송. 60초 내 재요청 불가.",
  })
  @ApiResponse({
    status: 200,
    description: "OTP 발송 성공 또는 활성 OTP 재사용",
    schema: {
      example: {
        remainingSeconds: 172,
        resendAvailableInSeconds: 52,
        reused: false,
      },
    },
  })
  @ApiResponse({
    status: 401,
    description:
      "Challenge Token 무효/만료 — errorCode: INVALID_CHALLENGE | CHALLENGE_EXPIRED",
  })
  @ApiResponse({
    status: 404,
    description: "자녀 계정 없음 / 연결된 보호자 없음 / 보호자 전화번호 미등록",
  })
  @ApiResponse({
    status: 400,
    description: "60초 내 재요청 (rate limit) — errorCode: SMS_RATE_LIMIT",
  })
  async requestOtp(@Body() dto: RequestOtpDto) {
    this.logger.log(`OTP 발송 요청: childEmail=${dto.childEmail}`);
    return this.childAuthService.requestOtp(dto.childEmail, dto.challengeToken);
  }

  /**
   * OTP 검증 + 로그인
   *
   * 부모에게 발송된 OTP를 검증하고 자녀 JWT를 발급합니다.
   */
  @Post("verify-otp-and-login")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "자녀 OTP 검증 + 로그인",
    description:
      "DB에 등록된 부모 연락처로 발송된 OTP를 검증하고 JWT 토큰을 발급합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "OTP 인증 성공, JWT 토큰 발급",
    schema: {
      example: {
        accessToken: "eyJhbGciOi...",
        refreshToken: "eyJhbGciOi...",
        user: {
          id: "clxyz...",
          firstName: "길동",
          lastName: "홍",
          email: "child@example.com",
          userType: "CHILD",
          name: "홍길동",
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: "OTP 불일치 또는 만료" })
  @ApiResponse({ status: 404, description: "자녀 계정 없음" })
  async verifyOtpAndLogin(@Body() dto: VerifyOtpAndLoginDto) {
    this.logger.log(`OTP 로그인 요청: email=${dto.childEmail}`);
    return this.childAuthService.verifyOtpAndLogin(
      dto.childEmail,
      dto.otp,
      dto.challengeToken,
    );
  }
}
