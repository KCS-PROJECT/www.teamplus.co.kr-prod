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
  Res,
  HttpCode,
  HttpStatus,
  HttpException,
  Logger,
  Ip,
  Headers,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthGuard } from "@nestjs/passport";
import type { Response as ExpressResponse } from "express";
import {
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
} from "@nestjs/swagger";
import { IdentityService } from "./identity.service";
import {
  InitiateIdentityDto,
  InitiateIdentityResponseDto,
  IdentityProviderType,
  IdentityCallbackDto,
  KakaoIdentityCallbackDto,
  NiceIdentityCallbackDto,
  PassIdentityCallbackDto,
  PortOneIdentityCallbackDto,
  KgInicisAuthResultDto,
  IdentityResultDto,
  IdentityStatusDto,
  UserIdentityStatusDto,
  ActiveProviderResponseDto,
} from "./dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
import { Public } from "@/auth/public.decorator";
import { SkipEnvelope } from "@/common/decorators/skip-envelope.decorator";
import { PrismaService } from "@/prisma/prisma.service";

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

  constructor(
    private readonly identityService: IdentityService,
    // KG 통합인증 결과 수신 시 리다이렉트 대상(return_url)을 읽기 위해 주입.
    // 인증 상태 전이는 전부 IdentityService 가 담당한다.
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 활성 본인인증 provider 조회
   *
   * [R1 #3] 프론트(IdentityVerifyInput)가 KG 팝업을 투기적으로 열지 여부를
   * 클릭 "이전"에 결정하려면 activeProvider 를 미리 알아야 한다. 인증/가입
   * 이전 화면에서도 호출돼야 하므로 @Public() — 민감정보 없이 스위치 값만 노출한다.
   */
  @Get("active-provider")
  @Public()
  @ApiOperation({
    summary: "활성 본인인증 provider 조회",
    description:
      "identity.common.activeProvider(IDENTITY_PROVIDER 환경변수)를 그대로 반환합니다. " +
      "프론트는 이 값으로 KG 팝업을 열지 여부를 클릭 전에 결정합니다.",
  })
  @ApiResponse({ status: 200, type: ActiveProviderResponseDto })
  getActiveProvider(): ActiveProviderResponseDto {
    const identityConfig = this.configService.get("identity");
    return { provider: identityConfig.common.activeProvider };
  }

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
   *
   * [R1 #4] initiateDto.provider 는 무시하고 서버 activeProvider 스위치만 쓴다.
   * "배포 없이 env 로 전환"이 이 엔드포인트의 설계 의도인데, 클라이언트 값을
   * 우선하면 캐시된 옛 번들·앱 웹뷰의 구 JS 가 계속 옛 provider 를 보내 전환이
   * 안 먹거나, 반대로 임의 클라이언트가 provider 를 강제할 수 있었다. DTO 필드는
   * 하위호환을 위해 남기되(과거 클라이언트가 보내도 400 나지 않도록) 이 엔드포인트는
   * 읽지 않는다. 인증된 `/identity/initiate` 는 이번 범위에서 그대로 둔다(아래 참조).
   */
  @Post("initiate-anonymous")
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "본인인증 시작 (익명, 회원가입용)",
    description: `
회원가입 전(JWT 없음) 본인인증을 시작합니다.
인증 완료 후 받은 requestId 를 회원가입 API 의 \`identityVerificationId\` 로 전달하세요.

**provider 는 서버가 결정합니다** — 요청 body 에 provider 를 보내도 무시되며,
identity.common.activeProvider(IDENTITY_PROVIDER 환경변수)로 결정된 값이 응답의
provider 필드에 담깁니다. 클라이언트는 그 값으로 분기해야 합니다.

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
      `[익명] 본인인증 시작: purpose=${initiateDto.purpose}, ip=${clientIp}`,
    );

    return this.identityService.initiateVerification(
      null, // 회원가입 전이므로 userId 없음
      undefined, // [R1 #4] 익명 엔드포인트는 클라이언트 provider 를 신뢰하지 않는다 — 서버 activeProvider 고정
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
   * KG이니시스 통합인증 결과 수신 — 성공 (STEP2 successUrl)
   *
   * KG 서버가 아니라 **사용자 브라우저**가 폼 POST 하므로 응답은 302 리다이렉트여야 한다.
   * 브라우저에 JSON 에러가 그대로 보이지 않도록 모든 예외를 302 로 변환한다.
   */
  @Post("kg-inicis/success/:requestId")
  @Public()
  @SkipEnvelope()
  @ApiOperation({
    summary: "KG이니시스 통합인증 결과 수신 (성공)",
    description:
      "KG 인증창에서 인증 성공 시 사용자 브라우저가 폼 POST 하는 엔드포인트입니다. " +
      "서버-서버 결과조회(STEP3)와 SEED 복호화(STEP4)를 수행한 뒤 프론트엔드로 302 리다이렉트합니다.",
  })
  @ApiParam({ name: "requestId", description: "본인인증 요청 ID" })
  @ApiBody({ type: KgInicisAuthResultDto })
  @ApiResponse({
    status: 302,
    description: "프론트엔드 결과 화면으로 리다이렉트",
  })
  async handleKgInicisSuccess(
    @Param("requestId") requestId: string,
    @Body() body: Record<string, string>,
    @Ip() clientIp: string,
    @Res() res: ExpressResponse,
  ): Promise<void> {
    await this.completeKgInicis(requestId, body, clientIp, res, "success");
  }

  /**
   * KG이니시스 통합인증 결과 수신 — 실패 (STEP2 failUrl)
   *
   * 실패 URL 로 들어와도 처리는 동일 경로를 탄다. resultCode 가 `0000` 이 아니면
   * Gateway 가 즉시 실패로 끊고, 설령 `0000` 이 와도 STEP3 서버-서버 조회가 진짜 판정을 한다.
   */
  @Post("kg-inicis/fail/:requestId")
  @Public()
  @SkipEnvelope()
  @ApiOperation({
    summary: "KG이니시스 통합인증 결과 수신 (실패)",
    description:
      "KG 인증창에서 인증 실패·취소 시 사용자 브라우저가 폼 POST 하는 엔드포인트입니다.",
  })
  @ApiParam({ name: "requestId", description: "본인인증 요청 ID" })
  @ApiBody({ type: KgInicisAuthResultDto })
  @ApiResponse({
    status: 302,
    description: "프론트엔드 결과 화면으로 리다이렉트",
  })
  async handleKgInicisFail(
    @Param("requestId") requestId: string,
    @Body() body: Record<string, string>,
    @Ip() clientIp: string,
    @Res() res: ExpressResponse,
  ): Promise<void> {
    await this.completeKgInicis(requestId, body, clientIp, res, "fail");
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

    // KG 통합인증은 전용 수신 엔드포인트만 쓴다.
    // 여기로 들어오면 결과조회 없이 실패 전이만 일어나 정상 대기 중인 인증을 죽일 수 있다.
    if (providerType === IdentityProviderType.KG_INICIS) {
      throw new BadRequestException(
        "KG이니시스 통합인증 결과는 kg-inicis/success · kg-inicis/fail 엔드포인트로 수신합니다.",
      );
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
   *
   * [2026-07-30 SECURITY] GET `?ci=<연계정보>` → POST body 로 전환.
   *   CI 는 고유식별정보에 준하는 연계정보인데, 쿼리스트링에 실리면 access 로그·프록시
   *   로그·브라우저 히스토리·Referer 헤더에 평문으로 남는다(안전성확보조치 §8·§9 위반 소지).
   *   POST body 는 로그 마스킹 대상(`ci` 키 → [REDACTED])이라 평문 잔존 경로가 없다.
   *   호출하는 프론트엔드는 저장소 전수 검색 결과 없음(백엔드 전용 API) → 파급 없음.
   */
  @Post("admin/check-duplicate")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("ADMIN")
  @ApiOperation({
    summary: "CI 중복 확인 (관리자용)",
    description:
      "동일한 CI(연계정보)로 가입된 사용자가 있는지 확인합니다. " +
      "CI 가 URL 에 남지 않도록 요청 body 로 전달합니다.",
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
  async checkDuplicateCI(@Body("ci") ci: string) {
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

  // ─────────────────────────────────────────────────────────
  // KG이니시스 통합인증 결과 수신 공통 처리
  // ─────────────────────────────────────────────────────────

  /**
   * 결과 처리 후 항상 302 로 프론트엔드에 돌려보낸다.
   * 실패 사유는 쿼리스트링 `code` 로만 전달하고 PII 는 싣지 않는다.
   */
  private async completeKgInicis(
    requestId: string,
    body: Record<string, string>,
    clientIp: string,
    res: ExpressResponse,
    entry: "success" | "fail",
  ): Promise<void> {
    // body 는 검증 없이 받는다 — 전역 ValidationPipe 는 메서드 파이프보다 먼저 돌기 때문에
    // DTO 로 받으면 forbidNonWhitelisted 가 규격 외 필드에서 400 JSON 을 내고 핸들러가
    // 호출조차 되지 않는다. metatype 이 Object 면 파이프가 검증을 건너뛴다.
    const payload = this.pickKgFields(body, requestId);

    this.logger.log(
      `KG 통합인증 결과 수신(${entry}): requestId=${requestId}, resultCode=${payload.resultCode || "(없음)"}, IP=${clientIp}`,
    );

    const returnBase = await this.resolveKgReturnUrl(requestId);

    // 필수값 검증도 302 안에서 끝낸다 (브라우저에 JSON 을 노출하지 않는다).
    if (!payload.resultCode) {
      this.logger.warn(
        `KG 통합인증 결과에 resultCode 가 없습니다: requestId=${requestId}`,
      );
      res.redirect(
        HttpStatus.FOUND,
        this.buildIdentityRedirect(
          returnBase,
          requestId,
          "failed",
          "INVALID_CALLBACK_PAYLOAD",
        ),
      );
      return;
    }

    try {
      const result = await this.identityService.processCallback(
        IdentityProviderType.KG_INICIS,
        payload,
        clientIp,
      );

      if (result.success) {
        res.redirect(
          HttpStatus.FOUND,
          // [R1 #4] needsGuardianConsent 는 PII 가 아닌 불리언 플래그라 302 쿼리로
          // 실어 보내도 안전하다 — 프론트가 만 14세 미만 보호자 동의 안내를
          // 띄우려면 이 값이 필요한데, KG 경로는 지금까지 PII 를 아예 싣지 않는
          // 계약이라 이 한 필드만 예외로 추가한다(계약을 덜 건드리는 선택).
          this.buildIdentityRedirect(
            returnBase,
            requestId,
            "completed",
            undefined,
            result.needsGuardianConsent,
          ),
        );
        return;
      }

      res.redirect(
        HttpStatus.FOUND,
        this.buildIdentityRedirect(
          returnBase,
          requestId,
          "failed",
          result.errorCode || "VERIFICATION_FAILED",
        ),
      );
    } catch (error) {
      const code = this.mapKgErrorCode(error);
      this.logger.warn(
        `KG 통합인증 결과 처리 예외: requestId=${requestId}, code=${code}`,
      );
      res.redirect(
        HttpStatus.FOUND,
        this.buildIdentityRedirect(returnBase, requestId, "failed", code),
      );
    }
  }

  /**
   * KG 규격 필드만 추려낸다.
   *
   * 파이프를 끄고 받으므로 화이트리스트는 여기가 유일한 방어선이다.
   * 이렇게 해야 임의 필드가 Gateway 와 webhook 로그(JSONB)로 흘러들지 않는다.
   */
  private pickKgFields(
    body: Record<string, string>,
    requestId: string,
  ): Record<string, string> {
    const asString = (value: unknown): string | undefined =>
      typeof value === "string" && value.length > 0 ? value : undefined;

    const picked: Record<string, string> = { requestId };
    for (const key of [
      "resultCode",
      "resultMsg",
      "authRequestUrl",
      "txId",
      "token",
    ]) {
      const value = asString(body?.[key]);
      if (value !== undefined) picked[key] = value;
    }
    return picked;
  }

  /**
   * 리다이렉트 대상 결정.
   *
   * `identity_verifications.return_url` 은 인증 시작 시 클라이언트가 보낸 값이라
   * 그대로 쓰면 open redirect 가 된다. 허용 origin 목록을 통과할 때만 사용하고,
   * 그 외에는 설정의 기본 리턴 URL 로 강등한다.
   */
  private async resolveKgReturnUrl(requestId: string): Promise<string> {
    const identityConfig = this.configService.get("identity");
    const fallback: string = identityConfig.common.returnBaseUrl;

    let candidate: string | null = null;
    try {
      const verification = await this.prisma.identityVerification.findUnique({
        where: { requestId },
        select: { returnUrl: true },
      });
      candidate = verification?.returnUrl ?? null;
    } catch {
      this.logger.warn(
        `리턴 URL 조회 실패 — 기본값으로 진행: requestId=${requestId}`,
      );
      return fallback;
    }

    if (!candidate) return fallback;

    const allowlist: string[] = identityConfig.common.returnUrlAllowlist ?? [];
    const allowedOrigins = new Set<string>();
    for (const entry of allowlist) {
      try {
        allowedOrigins.add(new URL(entry).origin);
      } catch {
        // 설정 오타는 무시 — 허용 목록에서 빠질 뿐 동작은 계속된다.
      }
    }

    try {
      const origin = new URL(candidate).origin;
      if (allowedOrigins.has(origin)) return candidate;
      this.logger.warn(
        `허용되지 않은 리턴 URL — 기본값으로 강등: requestId=${requestId}, origin=${origin}`,
      );
    } catch {
      this.logger.warn(
        `리턴 URL 형식 오류 — 기본값으로 강등: requestId=${requestId}`,
      );
    }

    return fallback;
  }

  private buildIdentityRedirect(
    base: string,
    requestId: string,
    status: "completed" | "failed",
    code?: string,
    needsGuardianConsent?: boolean,
  ): string {
    const url = new URL(base);
    url.searchParams.set("requestId", requestId);
    url.searchParams.set("status", status);
    if (code) url.searchParams.set("code", code);
    if (needsGuardianConsent) url.searchParams.set("guardianConsent", "1");
    return url.toString();
  }

  /** 서비스가 던지는 예외를 브라우저에 노출할 짧은 코드로 변환 */
  private mapKgErrorCode(error: unknown): string {
    if (error instanceof HttpException) {
      switch (error.getStatus()) {
        case HttpStatus.CONFLICT:
          return "ALREADY_PROCESSED";
        case HttpStatus.NOT_FOUND:
          return "REQUEST_NOT_FOUND";
        case HttpStatus.BAD_REQUEST:
          return "INVALID_REQUEST";
        default:
          return "CALLBACK_ERROR";
      }
    }
    return "CALLBACK_ERROR";
  }
}
