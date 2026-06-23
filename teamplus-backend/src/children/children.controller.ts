import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  Request,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import { ChildrenService } from "./children.service";
import {
  CreateChildDto,
  UpdateChildDto,
  ChildListResponseDto,
  ChildSingleResponseDto,
  CreateChildConsentDto,
  ChildConsentResponseDto,
} from "./dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

/**
 * Children Controller
 *
 * 학부모-자녀 관계 관리 API:
 * - 자녀 등록 (학부모 대리 등록)
 * - 자녀 목록 조회
 * - 자녀 정보 수정
 * - 자녀 삭제
 */
/**
 * NEW-01 자녀 정보 접근 권한 통제 (RBAC)
 * ─────────────────────────────────────
 * Apple 5.1.4 / 개인정보보호법 §29조 안전성 확보 조치
 * 자녀 관련 모든 엔드포인트는 PARENT 역할만 접근 가능하도록 컨트롤러 레벨 가드 적용.
 * (단, `class-history` 처럼 다중 역할이 필요한 엔드포인트는 메서드 레벨 @Roles 가 우선됨)
 *
 * 추가 검증: children.service.ts 메서드 내부에서 parentUserId === currentUserId 검증
 * 으로 다른 학부모의 자녀 정보 접근을 차단합니다.
 */
@ApiTags("Children")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("PARENT")
@Controller("api/v1/children")
export class ChildrenController {
  private readonly logger = new Logger(ChildrenController.name);

  constructor(private readonly childrenService: ChildrenService) {}

  /**
   * 자녀 등록
   *
   * 학부모가 자녀를 대리 등록합니다.
   * - 자녀용 User 계정 자동 생성 (UserType: CHILD)
   * - ChildProfile 생성
   * - ParentChild 관계 생성 (주 보호자로 등록)
   */
  @Post()
  @ApiOperation({
    summary: "자녀 등록",
    description: "학부모가 자녀를 대리 등록합니다.",
  })
  @ApiResponse({
    status: 201,
    description: "자녀 등록 성공",
    type: ChildSingleResponseDto,
  })
  @ApiResponse({ status: 400, description: "유효하지 않은 요청" })
  @ApiResponse({ status: 403, description: "학부모만 자녀를 등록할 수 있음" })
  async createChild(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateChildDto,
  ): Promise<ChildSingleResponseDto> {
    const userId = req.user.id;
    this.logger.log(`자녀 등록 요청: userId=${userId}`);

    const child = await this.childrenService.createChild(userId, dto);

    return {
      success: true,
      data: child,
    };
  }

  /**
   * 내 자녀 목록 조회
   *
   * 현재 로그인한 학부모의 자녀 목록을 조회합니다.
   */
  @Get()
  @ApiOperation({
    summary: "내 자녀 목록 조회",
    description: "현재 로그인한 학부모의 자녀 목록을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "자녀 목록 조회 성공",
    type: ChildListResponseDto,
  })
  async getMyChildren(
    @Request() req: AuthenticatedRequest,
  ): Promise<ChildListResponseDto> {
    const userId = req.user.id;
    this.logger.log(`내 자녀 목록 조회: userId=${userId}`);

    const children = await this.childrenService.getMyChildren(userId);

    return {
      success: true,
      data: children,
      total: children.length,
    };
  }

  /**
   * 자녀 상세 조회
   *
   * 특정 자녀의 상세 정보를 조회합니다.
   */
  @Get(":childId")
  @ApiOperation({
    summary: "자녀 상세 조회",
    description: "특정 자녀의 상세 정보를 조회합니다.",
  })
  @ApiParam({ name: "childId", description: "자녀 ID" })
  @ApiResponse({
    status: 200,
    description: "자녀 상세 조회 성공",
    type: ChildSingleResponseDto,
  })
  @ApiResponse({ status: 404, description: "자녀를 찾을 수 없음" })
  async getChild(
    @Request() req: AuthenticatedRequest,
    @Param("childId") childId: string,
  ): Promise<ChildSingleResponseDto> {
    const userId = req.user.id;
    this.logger.log(`자녀 상세 조회: userId=${userId}, childId=${childId}`);

    const child = await this.childrenService.getChild(userId, childId);

    return {
      success: true,
      data: child,
    };
  }

  /**
   * 자녀 정보 수정
   *
   * 주 보호자만 자녀 정보를 수정할 수 있습니다.
   */
  @Put(":childId")
  @ApiOperation({
    summary: "자녀 정보 수정",
    description: "주 보호자만 자녀 정보를 수정할 수 있습니다.",
  })
  @ApiParam({ name: "childId", description: "자녀 ID" })
  @ApiResponse({
    status: 200,
    description: "자녀 정보 수정 성공",
    type: ChildSingleResponseDto,
  })
  @ApiResponse({ status: 403, description: "주 보호자만 수정 가능" })
  @ApiResponse({ status: 404, description: "자녀를 찾을 수 없음" })
  async updateChild(
    @Request() req: AuthenticatedRequest,
    @Param("childId") childId: string,
    @Body() dto: UpdateChildDto,
  ): Promise<ChildSingleResponseDto> {
    const userId = req.user.id;
    this.logger.log(`자녀 정보 수정: userId=${userId}, childId=${childId}`);

    const child = await this.childrenService.updateChild(userId, childId, dto);

    return {
      success: true,
      data: child,
    };
  }

  /**
   * 자녀 연결 해제
   *
   * 학부모-자녀 관계만 삭제합니다.
   * 자녀 계정은 유지됩니다.
   * 마지막 보호자인 경우 거부됩니다.
   */
  @Delete(":childId/link")
  // RolesGuard + @Roles("PARENT") 는 컨트롤러 레벨에서 일괄 적용됨 (NEW-01)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "자녀 연결 해제",
    description:
      "학부모-자녀 관계만 삭제합니다. 자녀 계정은 유지됩니다. 마지막 보호자인 경우 거부됩니다.",
  })
  @ApiParam({ name: "childId", description: "자녀 ID" })
  @ApiResponse({
    status: 200,
    description: "자녀 연결 해제 성공",
    schema: {
      example: {
        success: true,
        message: "자녀 연결이 해제되었습니다.",
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "마지막 보호자는 연결을 해제할 수 없습니다.",
  })
  @ApiResponse({ status: 404, description: "자녀 연결 정보를 찾을 수 없음" })
  async unlinkChild(
    @Request() req: AuthenticatedRequest,
    @Param("childId") childId: string,
  ): Promise<{ success: boolean; message: string }> {
    const userId = req.user.id;
    this.logger.log(`자녀 연결 해제: userId=${userId}, childId=${childId}`);

    await this.childrenService.unlinkChild(userId, childId);

    return {
      success: true,
      message: "자녀 연결이 해제되었습니다.",
    };
  }

  /**
   * 자녀 삭제 (관계 해제)
   *
   * 주 보호자만 자녀를 삭제할 수 있습니다.
   * - 다른 보호자가 있으면 관계만 해제
   * - 다른 보호자가 없으면 자녀 데이터도 삭제
   */
  @Delete(":childId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "자녀 삭제",
    description: "주 보호자만 자녀를 삭제할 수 있습니다.",
  })
  @ApiParam({ name: "childId", description: "자녀 ID" })
  @ApiResponse({ status: 204, description: "자녀 삭제 성공" })
  @ApiResponse({ status: 400, description: "진행 중인 수강신청이 있음" })
  @ApiResponse({ status: 403, description: "주 보호자만 삭제 가능" })
  @ApiResponse({ status: 404, description: "자녀를 찾을 수 없음" })
  async deleteChild(
    @Request() req: AuthenticatedRequest,
    @Param("childId") childId: string,
  ): Promise<void> {
    const userId = req.user.id;
    this.logger.log(`자녀 삭제: userId=${userId}, childId=${childId}`);

    await this.childrenService.deleteChild(userId, childId);
  }

  /**
   * 보호자 추가
   *
   * 주 보호자가 다른 보호자를 추가합니다.
   * (예: 아버지가 어머니를 보호자로 추가)
   */
  @Post(":childId/guardians")
  @ApiOperation({
    summary: "보호자 추가",
    description: "주 보호자가 다른 보호자를 추가합니다.",
  })
  @ApiParam({ name: "childId", description: "자녀 ID" })
  @ApiResponse({ status: 201, description: "보호자 추가 성공" })
  @ApiResponse({ status: 400, description: "유효하지 않은 보호자" })
  @ApiResponse({ status: 403, description: "주 보호자만 추가 가능" })
  @ApiResponse({ status: 409, description: "이미 등록된 보호자" })
  async addGuardian(
    @Request() req: AuthenticatedRequest,
    @Param("childId") childId: string,
    @Body() body: { guardianId: string; relationship: string },
  ): Promise<{ success: boolean; message: string }> {
    const userId = req.user.id;
    this.logger.log(
      `보호자 추가: userId=${userId}, childId=${childId}, guardianId=${body.guardianId}`,
    );

    await this.childrenService.addGuardian(
      userId,
      childId,
      body.guardianId,
      body.relationship,
    );

    return {
      success: true,
      message: "보호자가 추가되었습니다.",
    };
  }

  // ====================================================================
  // L-10 (2026-05-22) — 만 14세 미만 자녀 법정대리인 동의 엔드포인트
  // PIPA §22조 · 정통망법 §31조2
  // ====================================================================

  @Post("consent")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "법정대리인 동의 저장 (L-10)",
    description:
      "만 14세 미만 자녀에 대한 법정대리인 동의를 저장합니다. PIPA §22조 근거.",
  })
  @ApiResponse({ status: 201, description: "동의 저장 성공" })
  @ApiResponse({ status: 400, description: "만 14세 이상이거나 필수 동의 누락" })
  @ApiResponse({ status: 403, description: "해당 자녀의 보호자만 가능" })
  @ApiResponse({ status: 409, description: "활성 동의가 이미 존재" })
  async createConsent(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateChildConsentDto,
  ): Promise<{ success: true; data: ChildConsentResponseDto }> {
    const userId = req.user.id;
    const ipAddress =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      undefined;
    const userAgent =
      typeof req.headers["user-agent"] === "string"
        ? req.headers["user-agent"]
        : undefined;
    this.logger.log(
      `[L-10] 법정대리인 동의 저장: parent=${userId}, child=${dto.childUserId}`,
    );
    const data = await this.childrenService.createChildConsent(userId, dto, {
      ipAddress,
      userAgent,
    });
    return { success: true, data };
  }

  @Get(":childId/consent")
  @ApiOperation({
    summary: "법정대리인 동의 조회 (L-10)",
    description: "특정 자녀에 대한 활성 동의 1건을 조회합니다.",
  })
  @ApiParam({ name: "childId", description: "자녀 User.id" })
  @ApiResponse({ status: 200, description: "동의 조회 성공" })
  @ApiResponse({ status: 404, description: "활성 동의 없음" })
  async getConsent(
    @Request() req: AuthenticatedRequest,
    @Param("childId") childId: string,
  ): Promise<{ success: true; data: ChildConsentResponseDto }> {
    const data = await this.childrenService.getChildConsent(
      req.user.id,
      childId,
    );
    return { success: true, data };
  }

  @Post(":childId/consent/revoke")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "법정대리인 동의 철회 (L-10)",
    description: "특정 자녀에 대한 활성 동의를 철회합니다.",
  })
  @ApiParam({ name: "childId", description: "자녀 User.id" })
  @ApiResponse({ status: 200, description: "철회 성공" })
  @ApiResponse({ status: 404, description: "철회할 활성 동의 없음" })
  async revokeConsent(
    @Request() req: AuthenticatedRequest,
    @Param("childId") childId: string,
  ): Promise<{ success: true; revokedAt: Date }> {
    const { revokedAt } = await this.childrenService.revokeChildConsent(
      req.user.id,
      childId,
    );
    return { success: true, revokedAt };
  }

  @Get(":childId/class-history")
  @Roles("PARENT", "COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @ApiOperation({ summary: "자녀 연간 수업 이력 조회" })
  @ApiParam({ name: "childId", description: "자녀 User ID" })
  @ApiQuery({ name: "year", description: "조회 연도 (YYYY)", example: "2026" })
  @ApiResponse({ status: 200, description: "월별 수업 이력 반환" })
  async getChildClassHistory(
    @Request() req: AuthenticatedRequest,
    @Param("childId") childId: string,
    @Query("year") year?: string,
  ) {
    const userId = req.user.id;
    const resolvedYear = year ?? String(new Date().getFullYear());
    this.logger.log(
      `자녀 수업 이력 조회: requesterId=${userId}, childId=${childId}, year=${resolvedYear}`,
    );
    return this.childrenService.getChildClassHistory(
      userId,
      req.user.userType,
      childId,
      resolvedYear,
    );
  }
}
