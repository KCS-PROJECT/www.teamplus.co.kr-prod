import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from "@nestjs/swagger";
import { ConsultationsService } from "./consultations.service";
import { CreateConsultationDto } from "./dto/create-consultation.dto";
import { UpdateConsultationDto } from "./dto/update-consultation.dto";
import { QueryConsultationsDto } from "./dto/query-consultations.dto";
import { RolesGuard } from "@/auth/roles.guard";
import { Roles } from "@/auth/roles.decorator";

@ApiTags("Consultations")
@Controller("api/v1/consultations")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
export class ConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  /**
   * 상담 생성 (학부모 전용)
   */
  @Post()
  @Roles("PARENT")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "상담 생성",
    description:
      "학부모가 코치에게 1:1 상담을 요청합니다. 동일 조합의 ACTIVE 상담이 있으면 기존 반환.",
  })
  @ApiResponse({ status: 201, description: "상담 생성 완료 (또는 기존 반환)" })
  @ApiResponse({ status: 400, description: "유효하지 않은 입력" })
  @ApiResponse({ status: 404, description: "존재하지 않는 코치/자녀" })
  async create(
    @Body() dto: CreateConsultationDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.consultationsService.createConsultation(req.user.id, dto);
  }

  /**
   * 내 상담 목록 조회
   */
  @Get("my")
  @Roles("PARENT", "COACH", "ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR")
  @ApiOperation({
    summary: "내 상담 목록 조회",
    description:
      "로그인 사용자의 상담 목록을 조회합니다. 역할에 따라 자동 필터링됩니다.",
  })
  @ApiResponse({ status: 200, description: "상담 목록 조회 성공" })
  async getMy(
    @Query() query: QueryConsultationsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.consultationsService.getMyConsultations(
      req.user.id,
      req.user.userType,
      query,
    );
  }

  /**
   * 상담 통계 (관리자 전용)
   */
  @Get("stats")
  @Roles("ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR")
  @ApiOperation({
    summary: "상담 통계 조회",
    description: "전체 상담 통계를 조회합니다. (총 개수, 상태별, 카테고리별)",
  })
  @ApiResponse({ status: 200, description: "통계 조회 성공" })
  async getStats(@Request() req: AuthenticatedRequest) {
    return this.consultationsService.getClubStats(
      req.user.id,
      req.user.userType,
    );
  }

  /**
   * 상담 상세 조회
   */
  @Get(":id")
  @Roles("PARENT", "COACH", "ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR")
  @ApiOperation({
    summary: "상담 상세 조회",
    description: "상담 상세 정보를 조회합니다. 본인 또는 관리자만 접근 가능.",
  })
  @ApiParam({ name: "id", description: "상담 ID" })
  @ApiResponse({ status: 200, description: "상담 상세 조회 성공" })
  @ApiResponse({ status: 403, description: "접근 권한 없음" })
  @ApiResponse({ status: 404, description: "상담을 찾을 수 없음" })
  async getOne(@Param("id") id: string, @Request() req: AuthenticatedRequest) {
    return this.consultationsService.getConsultationById(id, req.user.id);
  }

  /**
   * 상담 정보 수정
   */
  @Patch(":id")
  @Roles("PARENT", "COACH")
  @ApiOperation({
    summary: "상담 정보 수정",
    description: "상담 카테고리 또는 상태를 변경합니다. 참여자만 수정 가능.",
  })
  @ApiParam({ name: "id", description: "상담 ID" })
  @ApiResponse({ status: 200, description: "상담 수정 완료" })
  @ApiResponse({ status: 400, description: "종료된 상담 수정 불가" })
  @ApiResponse({ status: 403, description: "수정 권한 없음" })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateConsultationDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.consultationsService.updateConsultation(id, dto, req.user.id);
  }

  /**
   * 상담 종료
   */
  @Post(":id/close")
  @Roles("PARENT", "COACH")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "상담 종료",
    description: "상담을 종료 상태로 변경합니다. 참여자만 종료 가능.",
  })
  @ApiParam({ name: "id", description: "상담 ID" })
  @ApiResponse({ status: 200, description: "상담 종료 완료" })
  @ApiResponse({ status: 400, description: "이미 종료된 상담" })
  @ApiResponse({ status: 403, description: "종료 권한 없음" })
  async close(@Param("id") id: string, @Request() req: AuthenticatedRequest) {
    return this.consultationsService.closeConsultation(id, req.user.id);
  }

  /**
   * 읽음 처리
   */
  @Post(":id/read")
  @Roles("PARENT", "COACH")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "상담 읽음 처리",
    description:
      "해당 상담의 안읽은 메시지 수를 0으로 초기화합니다. 역할에 따라 자동 처리.",
  })
  @ApiParam({ name: "id", description: "상담 ID" })
  @ApiResponse({ status: 200, description: "읽음 처리 완료" })
  @ApiResponse({ status: 403, description: "접근 권한 없음" })
  async markRead(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.consultationsService.markAsRead(
      id,
      req.user.id,
      req.user.userType,
    );
  }
}
