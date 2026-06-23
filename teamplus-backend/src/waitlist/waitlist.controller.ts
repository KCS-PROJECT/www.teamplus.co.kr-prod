import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
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
} from "@nestjs/swagger";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { WaitlistService } from "./waitlist.service";
import { CreateWaitlistDto } from "./dto/create-waitlist.dto";
import {
  WaitlistSingleResponseDto,
  WaitlistListResponseDto,
} from "./dto/waitlist-response.dto";

/**
 * Waitlist Controller
 *
 * 수업 정원 초과 시 대기자 관리 API
 *
 * - POST   /api/v1/waitlist              대기자 등록
 * - GET    /api/v1/waitlist/my           내 대기 목록
 * - GET    /api/v1/waitlist/class/:id    수업별 대기자 목록 (코치/관리자)
 * - DELETE /api/v1/waitlist/:id          대기 취소
 * - POST   /api/v1/waitlist/:id/confirm  대기자 확정 (승격 후 사용자 응답)
 */
@ApiTags("Waitlist")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(
  "ADMIN",
  "DIRECTOR",
  "ACADEMY_DIRECTOR",
  "COACH",
  "PARENT",
  "TEEN",
  "CHILD",
)
@Controller("api/v1/waitlist")
export class WaitlistController {
  private readonly logger = new Logger(WaitlistController.name);

  constructor(private readonly waitlistService: WaitlistService) {}

  /**
   * 대기자 등록
   */
  @Post()
  @ApiOperation({
    summary: "대기자 등록",
    description: "정원이 초과된 수업에 대기 등록합니다.",
  })
  @ApiResponse({
    status: 201,
    description: "대기자 등록 성공",
    type: WaitlistSingleResponseDto,
  })
  @ApiResponse({ status: 404, description: "수업을 찾을 수 없음" })
  @ApiResponse({ status: 409, description: "이미 대기 중인 수업" })
  async createWaitlist(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateWaitlistDto,
  ): Promise<WaitlistSingleResponseDto> {
    const userId = req.user.id;
    this.logger.log(`대기자 등록 요청: userId=${userId}`);

    const waitlist = await this.waitlistService.createWaitlist(userId, dto);

    return { success: true, data: waitlist };
  }

  /**
   * 내 대기 목록 조회
   */
  @Get("my")
  @ApiOperation({
    summary: "내 대기 목록 조회",
    description: "내가 등록한 대기 목록을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "대기 목록 조회 성공",
    type: WaitlistListResponseDto,
  })
  async getMyWaitlists(
    @Request() req: AuthenticatedRequest,
  ): Promise<WaitlistListResponseDto> {
    const userId = req.user.id;
    this.logger.log(`내 대기 목록 조회: userId=${userId}`);

    const waitlists = await this.waitlistService.getMyWaitlists(userId);

    return { success: true, data: waitlists, total: waitlists.length };
  }

  /**
   * 수업별 대기자 목록 조회 (코치/관리자)
   */
  @Get("class/:classId")
  @ApiOperation({
    summary: "수업별 대기자 목록 조회",
    description: "특정 수업의 전체 대기자 목록을 조회합니다. (코치/관리자용)",
  })
  @ApiParam({ name: "classId", description: "수업 ID" })
  @ApiResponse({
    status: 200,
    description: "대기자 목록 조회 성공",
    type: WaitlistListResponseDto,
  })
  @ApiResponse({ status: 404, description: "수업을 찾을 수 없음" })
  async getWaitlistByClass(
    @Request() req: AuthenticatedRequest,
    @Param("classId") classId: string,
  ): Promise<WaitlistListResponseDto> {
    const userId = req.user.id;
    this.logger.log(`수업별 대기자 목록 조회: classId=${classId}`);

    const waitlists = await this.waitlistService.getWaitlistByClass(
      classId,
      userId,
    );

    return { success: true, data: waitlists, total: waitlists.length };
  }

  /**
   * 대기 취소
   */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "대기 취소",
    description: "대기 등록을 취소합니다.",
  })
  @ApiParam({ name: "id", description: "대기 ID" })
  @ApiResponse({ status: 204, description: "대기 취소 성공" })
  @ApiResponse({ status: 400, description: "이미 취소/만료된 대기" })
  @ApiResponse({ status: 403, description: "본인 대기만 취소 가능" })
  @ApiResponse({ status: 404, description: "대기를 찾을 수 없음" })
  async cancelWaitlist(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<void> {
    const userId = req.user.id;
    this.logger.log(`대기 취소 요청: userId=${userId}, waitlistId=${id}`);

    await this.waitlistService.cancelWaitlist(userId, id);
  }

  /**
   * 대기자 확정 (승격 후 사용자 확인)
   */
  @Post(":id/confirm")
  @ApiOperation({
    summary: "대기자 확정",
    description: "승격 알림을 받은 대기자가 24시간 내 확정 신청을 합니다.",
  })
  @ApiParam({ name: "id", description: "대기 ID" })
  @ApiResponse({
    status: 200,
    description: "대기자 확정 성공",
    type: WaitlistSingleResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "승격된 대기가 아님 또는 기한 만료",
  })
  @ApiResponse({ status: 403, description: "본인 대기만 확정 가능" })
  @ApiResponse({ status: 404, description: "대기를 찾을 수 없음" })
  async confirmWaitlist(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<WaitlistSingleResponseDto> {
    const userId = req.user.id;
    this.logger.log(`대기자 확정 요청: userId=${userId}, waitlistId=${id}`);

    const waitlist = await this.waitlistService.confirmWaitlist(userId, id);

    return { success: true, data: waitlist };
  }
}
