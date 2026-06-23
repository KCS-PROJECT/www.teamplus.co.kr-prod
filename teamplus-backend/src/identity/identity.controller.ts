import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Logger,
  Ip,
  Headers,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiHeader,
} from "@nestjs/swagger";
import { IdentityService } from "./identity.service";
import {
  InitiateIdentityDto,
  InitiateIdentityResponseDto,
  IdentityProviderType,
  IdentityCallbackDto,
  KgInicisIdentityCallbackDto,
  KakaoIdentityCallbackDto,
  NiceIdentityCallbackDto,
  PassIdentityCallbackDto,
  PortOneIdentityCallbackDto,
  IdentityResultDto,
  IdentityStatusDto,
  UserIdentityStatusDto,
} from "./dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
import { Public } from "@/auth/public.decorator";

/**
 * 본인인증 컨트롤러
 *
 * 학부모(PARENT) 회원만 본인인증 대상
 * - 미성년자(CHILD)는 본인인증 불필요 (학부모 계정에 자녀 프로필로 관리)
 * - 코치(COACH)는 별도 검증 절차
 */
@ApiTags("Identity Verification (본인인증)")
@Controller("api/v1/identity")
export class IdentityController {
  private readonly logger = new Logger(IdentityController.name);

  constructor(private readonly identityService: IdentityService) {}

  /**
   * 본인인증 시작
   *
   * 인증 URL 또는 HTML을 반환하여 사용자가 제공자 페이지에서 인증 진행
   */
  @Post("initiate")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("PARENT")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "본인인증 시작",
    description: `
본인인증을 시작하고 인증 페이지 URL을 반환합니다.

**지원 제공자**:
- \`kg_inicis\`: KG이니시스 본인인증
- \`kakao\`: 카카오 인증
- \`nice\`: NICE평가정보
- \`pass\`: PASS 앱 인증

**인증 목적**:
- \`registration\`: 회원가입 시 본인확인
- \`payment\`: 결제 시 본인확인
- \`profile_update\`: 프로필 변경 시 본인확인

**주의사항**:
- 미성년자(CHILD)는 본인인증 대상이 아닙니다.
- 학부모(PARENT)만 본인인증을 진행할 수 있습니다.
    `,
  })
  @ApiResponse({
    status: 201,
    description: "본인인증 시작 성공",
    type: InitiateIdentityResponseDto,
    schema: {
      example: {
        success: true,
        requestId: "req_abc123xyz789",
        authUrl: "https://auth.provider.com/verify?token=xyz",
        expiresAt: "2026-01-14T10:30:00Z",
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "잘못된 요청 파라미터",
  })
  @ApiResponse({
    status: 429,
    description: "요청 횟수 초과 (10회/시간)",
  })
  async initiateIdentity(
    @Request() req: AuthenticatedRequest,
    @Body() initiateDto: InitiateIdentityDto,
    @Ip() clientIp: string,
    @Headers("user-agent") userAgent: string,
  ): Promise<InitiateIdentityResponseDto> {
    this.logger.log(
      `본인인증 시작: userId=${req.user.id}, provider=${initiateDto.provider}, purpose=${initiateDto.purpose}`,
    );

    return this.identityService.initiateVerification(
      req.user.id,
      initiateDto.provider,
      initiateDto.purpose,
      {
        returnUrl: initiateDto.returnUrl,
        metadata: initiateDto.metadata,
        clientIp,
        userAgent,
      },
    );
  }

  /**
   * 본인인증 시작 — 익명(회원가입 전)
   *
   * 회원가입 흐름에서 호출. JWT 가 아직 없는 상태이므로 @Public() 로 노출하되
   * Rate Limiting 은 ThrottlerGuard 가 IP 기준으로 자동 적용한다.
   *
   * PARENT/COACH/DIRECTOR/ACADEMY_DIRECTOR 회원가입 강제 인증 가드(NEW-02)와 짝.
   */
  @Post("initiate-anonymous")
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "본인인증 시작 (익명, 회원가입용)",
    description: `
회원가입 전(JWT 없음) 본인인증을 시작합니다.
인증 완료 후 받은 requestId 를 회원가입 API 의 \`identityVerificationId\` 로 전달하세요.

**지원 제공자**: \`portone\` (권장, PoC) · \`kg_inicis\` · \`kakao\` · \`nice\` · \`pass\`

**목적 (purpose)**: \`registration\` 권장 (회원가입 강제 인증).
    `,
  })
  @ApiResponse({ status: 201, type: InitiateIdentityResponseDto })
  async initiateIdentityAnonymous(
    @Body() initiateDto: InitiateIdentityDto,
    @Ip() clientIp: string,
    @Headers("user-agent") userAgent: string,
  ): Promise<InitiateIdentityResponseDto> {
    this.logger.log(
      `[익명] 본인인증 시작: provider=${initiateDto.provider}, purpose=${initiateDto.purpose}, ip=${clientIp}`,
    );

    return this.identityService.initiateVerification(
      null, // 회원가입 전이므로 userId 없음
      initiateDto.provider,
      initiateDto.purpose,
      {
        returnUrl: initiateDto.returnUrl,
        metadata: initiateDto.metadata,
        clientIp,
        userAgent,
      },
    );
  }

  /**
   * 본인인증 콜백 처리 (KG이니시스)
   *
   * 제공자 서버에서 호출하므로 인증 불필요
   * IP 화이트리스트 및 서명 검증으로 보안 유지
   */
  @Post("callback/kg_inicis")
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "KG이니시스 본인인증 콜백",
    description:
      "KG이니시스에서 인증 완료 시 호출하는 콜백입니다. (서명 검증 필수)",
  })
  @ApiHeader({
    name: "X-Inicis-Signature",
    description: "KG이니시스 서명 값",
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: "콜백 처리 성공",
    type: IdentityResultDto,
  })
  @ApiResponse({
    status: 400,
    description: "잘못된 콜백 데이터",
  })
  @ApiResponse({
    status: 403,
    description: "IP 주소가 화이트리스트에 없습니다.",
  })
  async handleKgInicisCallback(
    @Body() callbackDto: KgInicisIdentityCallbackDto,
    @Ip() requestIp: string,
    @Headers("x-inicis-signature") signature?: string,
  ): Promise<IdentityResultDto> {
    this.logger.log(
      `KG이니시스 콜백 수신: requestId=${callbackDto.requestId}, IP=${requestIp}`,
    );

    return this.identityService.processCallback(
      IdentityProviderType.KG_INICIS,
      { ...callbackDto, signature: signature || callbackDto.signature },
      requestIp,
    );
  }

  /**
   * 본인인증 콜백 처리 (카카오)
   */
  @Post("callback/kakao")
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "카카오 본인인증 콜백",
    description: "카카오에서 인증 완료 시 호출하는 콜백입니다.",
  })
  @ApiResponse({
    status: 200,
    description: "콜백 처리 성공",
    type: IdentityResultDto,
  })
  async handleKakaoCallback(
    @Body() callbackDto: KakaoIdentityCallbackDto,
    @Ip() requestIp: string,
  ): Promise<IdentityResultDto> {
    this.logger.log(
      `카카오 콜백 수신: code=${callbackDto.code ? "있음" : "없음"}, state=${callbackDto.state}, IP=${requestIp}`,
    );

    // 카카오 에러 처리
    if (callbackDto.error) {
      this.logger.warn(
        `카카오 인증 에러: ${callbackDto.error} - ${callbackDto.error_description}`,
      );
      throw new BadRequestException(
        callbackDto.error_description || "카카오 인증에 실패했습니다.",
      );
    }

    return this.identityService.processCallback(
      IdentityProviderType.KAKAO,
      callbackDto,
      requestIp,
    );
  }

  /**
   * 본인인증 콜백 처리 (NICE)
   */
  @Post("callback/nice")
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "NICE 본인인증 콜백",
    description: "NICE평가정보에서 인증 완료 시 호출하는 콜백입니다.",
  })
  @ApiResponse({
    status: 200,
    description: "콜백 처리 성공",
    type: IdentityResultDto,
  })
  async handleNiceCallback(
    @Body() callbackDto: NiceIdentityCallbackDto,
    @Ip() requestIp: string,
  ): Promise<IdentityResultDto> {
    this.logger.log(
      `NICE 콜백 수신: reqNo=${callbackDto.reqNo}, resultCode=${callbackDto.resultCode}, IP=${requestIp}`,
    );

    return this.identityService.processCallback(
      IdentityProviderType.NICE,
      callbackDto,
      requestIp,
    );
  }

  /**
   * 본인인증 콜백 처리 (PASS)
   */
  @Post("callback/pass")
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "PASS 앱 본인인증 콜백",
    description: "PASS 앱에서 인증 완료 시 호출하는 콜백입니다.",
  })
  @ApiResponse({
    status: 200,
    description: "콜백 처리 성공",
    type: IdentityResultDto,
  })
  async handlePassCallback(
    @Body() callbackDto: PassIdentityCallbackDto,
    @Ip() requestIp: string,
  ): Promise<IdentityResultDto> {
    this.logger.log(
      `PASS 콜백 수신: txId=${callbackDto.txId}, carrier=${callbackDto.carrier}, IP=${requestIp}`,
    );

    return this.identityService.processCallback(
      IdentityProviderType.PASS,
      callbackDto,
      requestIp,
    );
  }

  /**
   * 본인인증 콜백 처리 (PortOne — 클라이언트 SDK 주도)
   *
   * 프론트 @portone/browser-sdk 의 requestIdentityVerification() 성공 후
   * SDK 가 반환한 identityVerificationId 를 백엔드로 전달한다.
   * 백엔드는 PortOne REST API 호출로 인증 결과를 가져온다.
   */
  @Post("callback/portone")
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "PortOne 본인인증 콜백",
    description:
      "프론트 @portone/browser-sdk 인증 성공 후 클라이언트가 호출. " +
      "body 의 requestId(IdentityVerification.requestId) 와 " +
      "identityVerificationId(PortOne 발급) 로 결과를 조회한다.",
  })
  @ApiResponse({ status: 200, type: IdentityResultDto })
  async handlePortOneCallback(
    @Body() callbackDto: PortOneIdentityCallbackDto,
    @Ip() requestIp: string,
  ): Promise<IdentityResultDto> {
    this.logger.log(
      `PortOne 콜백 수신: requestId=${callbackDto.requestId}, idvId=${callbackDto.identityVerificationId}, IP=${requestIp}`,
    );

    return this.identityService.processCallback(
      IdentityProviderType.PORTONE,
      callbackDto,
      requestIp,
    );
  }

  /**
   * 통합 콜백 처리 (범용)
   *
   * provider 파라미터로 제공자 구분
   */
  @Post("callback/:provider")
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "본인인증 콜백 (통합)",
    description: "제공자별 본인인증 콜백을 통합 처리합니다.",
  })
  @ApiParam({
    name: "provider",
    enum: IdentityProviderType,
    description: "본인인증 제공자",
  })
  @ApiResponse({
    status: 200,
    description: "콜백 처리 성공",
    type: IdentityResultDto,
  })
  async handleCallback(
    @Param("provider") provider: string,
    @Body() callbackDto: IdentityCallbackDto,
    @Ip() requestIp: string,
    @Headers("x-signature") signature?: string,
  ): Promise<IdentityResultDto> {
    const providerType = provider as IdentityProviderType;

    // 지원하지 않는 제공자 검증
    if (!Object.values(IdentityProviderType).includes(providerType)) {
      throw new BadRequestException(`지원하지 않는 제공자입니다: ${provider}`);
    }

    this.logger.log(`통합 콜백 수신: provider=${provider}, IP=${requestIp}`);

    return this.identityService.processCallback(
      providerType,
      { ...callbackDto, signature: signature || callbackDto.signature },
      requestIp,
    );
  }

  /**
   * 본인인증 결과 조회
   */
  @Get("result/:requestId")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("PARENT", "ADMIN")
  @ApiOperation({
    summary: "본인인증 결과 조회",
    description:
      "본인인증 요청의 결과를 조회합니다. 인증된 정보는 마스킹 처리됩니다.",
  })
  @ApiParam({
    name: "requestId",
    description: "본인인증 요청 ID",
    example: "req_abc123xyz789",
  })
  @ApiResponse({
    status: 200,
    description: "결과 조회 성공",
    type: IdentityResultDto,
    schema: {
      example: {
        success: true,
        requestId: "req_abc123xyz789",
        status: "completed",
        name: "홍길동",
        phone: "010-****-5678",
        birthDate: "1990-**-**",
        gender: "M",
        verifiedAt: "2026-01-14T10:30:00Z",
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: "인증 요청을 찾을 수 없습니다.",
  })
  async getVerificationResult(
    @Param("requestId") requestId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<IdentityResultDto> {
    this.logger.log(
      `본인인증 결과 조회: requestId=${requestId}, userId=${req.user.id}`,
    );

    const result = await this.identityService.getVerificationResult(requestId);

    // 본인 요청이 아니면 관리자만 조회 가능
    if (result.requestId !== requestId) {
      throw new NotFoundException("인증 요청을 찾을 수 없습니다.");
    }

    return result;
  }

  /**
   * 본인인증 상태 확인 (폴링용)
   *
   * 클라이언트에서 주기적으로 호출하여 인증 완료 여부 확인
   */
  @Get("status/:requestId")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("PARENT", "ADMIN")
  @ApiOperation({
    summary: "본인인증 상태 확인",
    description: `
본인인증 요청의 현재 상태를 확인합니다.

**상태 값**:
- \`pending\`: 인증 대기 중
- \`processing\`: 인증 처리 중
- \`completed\`: 인증 완료
- \`failed\`: 인증 실패
- \`expired\`: 인증 만료

클라이언트에서 3-5초 간격으로 폴링하여 인증 완료 여부를 확인합니다.
    `,
  })
  @ApiParam({
    name: "requestId",
    description: "본인인증 요청 ID",
  })
  @ApiResponse({
    status: 200,
    description: "상태 조회 성공",
    type: IdentityStatusDto,
    schema: {
      example: {
        requestId: "req_abc123xyz789",
        status: "pending",
        provider: "kakao",
        purpose: "registration",
        requestedAt: "2026-01-14T10:00:00Z",
        expiresAt: "2026-01-14T10:30:00Z",
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: "인증 요청을 찾을 수 없습니다.",
  })
  async checkVerificationStatus(
    @Param("requestId") requestId: string,
  ): Promise<IdentityStatusDto> {
    return this.identityService.checkVerificationStatus(requestId);
  }

  /**
   * 내 본인인증 상태 조회
   */
  @Get("user/status")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("PARENT", "COACH", "ADMIN")
  @ApiOperation({
    summary: "내 본인인증 상태 조회",
    description: "현재 로그인한 사용자의 본인인증 상태를 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "상태 조회 성공",
    type: UserIdentityStatusDto,
    schema: {
      example: {
        userId: "user_abc123",
        isVerified: true,
        verifiedAt: "2026-01-14T10:30:00Z",
        verifiedName: "홍*동",
        provider: "kakao",
      },
    },
  })
  async getUserVerificationStatus(
    @Request() req: AuthenticatedRequest,
  ): Promise<UserIdentityStatusDto> {
    return this.identityService.getUserVerificationStatus(req.user.id);
  }

  /**
   * 본인인증 이력 조회
   */
  @Get("user/history")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("PARENT", "ADMIN")
  @ApiOperation({
    summary: "본인인증 이력 조회",
    description: "현재 로그인한 사용자의 본인인증 이력을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "이력 조회 성공",
    schema: {
      example: {
        verifications: [
          {
            requestId: "req_abc123xyz789",
            provider: "kakao",
            purpose: "registration",
            status: "completed",
            requestedAt: "2026-01-14T10:00:00Z",
            verifiedAt: "2026-01-14T10:05:00Z",
          },
        ],
        totalCount: 1,
      },
    },
  })
  async getUserVerificationHistory(
    @Request() req: AuthenticatedRequest,
    @Query("limit") limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    return this.identityService.getUserVerificationHistory(
      req.user.id,
      parsedLimit,
    );
  }

  /**
   * CI 중복 확인 (관리자용)
   *
   * 동일한 CI로 가입된 사용자가 있는지 확인
   */
  @Get("admin/check-duplicate")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("ADMIN")
  @ApiOperation({
    summary: "CI 중복 확인 (관리자용)",
    description: "동일한 CI(연계정보)로 가입된 사용자가 있는지 확인합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "중복 확인 성공",
    schema: {
      example: {
        isDuplicate: false,
        existingUserId: null,
      },
    },
  })
  async checkDuplicateCI(@Query("ci") ci: string) {
    if (!ci) {
      throw new BadRequestException("CI 값이 필요합니다.");
    }

    return this.identityService.checkDuplicateCI(ci);
  }

  /**
   * 본인인증 통계 (관리자용)
   */
  @Get("admin/stats")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("ADMIN")
  @ApiOperation({
    summary: "본인인증 통계 (관리자용)",
    description: "본인인증 통계를 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "통계 조회 성공",
    schema: {
      example: {
        totalVerifications: 100,
        completedCount: 95,
        failedCount: 3,
        expiredCount: 2,
        byProvider: {
          kg_inicis: 20,
          kakao: 60,
          nice: 15,
          pass: 5,
        },
        byPurpose: {
          registration: 70,
          payment: 25,
          profile_update: 5,
        },
        successRate: "95.0",
      },
    },
  })
  async getVerificationStats(
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.identityService.getVerificationStats(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }
}
