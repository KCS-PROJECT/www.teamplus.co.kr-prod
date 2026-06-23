import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Controller,
  Post,
  Get,
  Put,
  Patch,
  Delete,
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
} from "@nestjs/swagger";
import { ClassesService } from "./classes.service";
import { CreateClassDto } from "./dto/create-class.dto";
import { UpdateClassDto } from "./dto/update-class.dto";
import { CreateClassProductDto } from "./dto/create-product.dto";
import { UpdateClassProductDto } from "./dto/update-product.dto";
import {
  CreateBulkScheduleDto,
  UpdateScheduleDto,
} from "./dto/create-schedule.dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

@ApiTags("Classes")
@Controller("api/v1/teams/:teamId/classes")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
// [2026-05-13 roles-check] 기본 — 인증된 모든 사용자 조회. mutation 은 메서드 레벨 @Roles.
@Roles(
  "ADMIN",
  "DIRECTOR",
  "ACADEMY_DIRECTOR",
  "COACH",
  "PARENT",
  "TEEN",
  "CHILD",
)
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  /**
   * 수업 생성 (감독만)
   */
  @Post()
  @Roles("COACH", "DIRECTOR")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "수업 생성",
    description: "감독만 새로운 수업을 생성할 수 있습니다.",
  })
  @ApiResponse({
    status: 201,
    description: "수업이 성공적으로 생성되었습니다.",
    schema: {
      example: {
        id: "class-uuid",
        teamId: "club-uuid",
        className: "신규 수강생반",
        instructorName: "김철수",
        capacity: 15,
        startTime: "2026-01-04T16:00:00Z",
        endTime: "2026-01-04T17:00:00Z",
        isActive: true,
        createdAt: "2026-01-04T10:00:00Z",
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "올바른 시간을 입력해주세요.",
  })
  @ApiResponse({
    status: 403,
    description: "감독만 수업을 생성할 수 있습니다.",
  })
  async createClass(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Body() createDto: CreateClassDto,
  ) {
    return this.classesService.createClass(req.user.id, teamId, createDto);
  }

  /**
   * 수업 상세 정보 조회
   */
  @Get(":classId")
  @ApiOperation({
    summary: "수업 상세 정보",
    description: "수업의 상세 정보를 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "수업 정보 조회 성공",
  })
  @ApiResponse({
    status: 404,
    description: "수업을 찾을 수 없습니다.",
  })
  async getClass(
    @Request() req: AuthenticatedRequest,
    @Param("classId") classId: string,
  ) {
    return this.classesService.getClass(classId, req.user);
  }

  /**
   * 팀의 수업 목록 조회
   */
  @Get()
  @ApiOperation({
    summary: "팀 수업 목록",
    description: "팀의 모든 수업 목록을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "수업 목록 조회 성공",
    schema: {
      example: [
        {
          id: "class-uuid",
          className: "신규 수강생반",
          instructorName: "김철수",
          capacity: 15,
          startTime: "2026-01-04T16:00:00Z",
          endTime: "2026-01-04T17:00:00Z",
          isActive: true,
          createdAt: "2026-01-04T10:00:00Z",
        },
      ],
    },
  })
  async getTeamClasses(
    @Param("teamId") teamId: string,
    @Query("search") search?: string,
    @Query("category") category?: string,
    @Query("status") status?: string,
    @Query("coachId") coachId?: string,
  ) {
    return this.classesService.getClubClasses(teamId, {
      search,
      category,
      status,
      coachId,
    });
  }

  /**
   * 수업 정보 수정 (감독만)
   */
  @Put(":classId")
  @Roles("COACH", "DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "수업 정보 수정",
    description: "감독만 수업 정보를 수정할 수 있습니다.",
  })
  @ApiResponse({
    status: 200,
    description: "수업 정보가 수정되었습니다.",
  })
  @ApiResponse({
    status: 403,
    description: "감독만 수정할 수 있습니다.",
  })
  @ApiResponse({
    status: 404,
    description: "수업을 찾을 수 없습니다.",
  })
  async updateClass(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Param("classId") classId: string,
    @Body() updateDto: UpdateClassDto,
  ) {
    return this.classesService.updateClass(
      req.user.id,
      teamId,
      classId,
      updateDto,
    );
  }

  /**
   * 수업 활성/비활성 토글
   */
  @Patch(":classId/status")
  @Roles("COACH", "DIRECTOR")
  @ApiOperation({
    summary: "수업 상태 토글",
    description: "수업을 활성화/비활성화합니다.",
  })
  @ApiResponse({ status: 200, description: "상태 변경 완료" })
  async toggleClassStatus(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Param("classId") classId: string,
    @Body("isActive") isActive: boolean,
  ) {
    return this.classesService.toggleClassStatus(
      req.user.id,
      teamId,
      classId,
      isActive,
    );
  }

  /**
   * 수업 삭제 (감독만)
   */
  @Delete(":classId")
  @Roles("COACH", "DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "수업 삭제",
    description: "감독만 수업을 삭제할 수 있습니다.",
  })
  @ApiResponse({
    status: 200,
    description: "수업이 삭제되었습니다.",
  })
  @ApiResponse({
    status: 403,
    description: "감독만 삭제할 수 있습니다.",
  })
  @ApiResponse({
    status: 404,
    description: "수업을 찾을 수 없습니다.",
  })
  async deleteClass(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Param("classId") classId: string,
  ) {
    return this.classesService.deleteClass(req.user.id, teamId, classId);
  }

  /**
   * 수업 일정 일괄 생성 — 기간 + 요일 + 시간 기반
   * Controller prefix 가 이미 `api/v1/teams/:teamId/classes` 이므로
   * `:classId/schedules/bulk` 만 명시 (이전 이중 중첩 URL 버그 수정).
   */
  @Post(":classId/schedules/bulk")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "수업 일정 일괄 생성",
    description:
      "지정 기간(startDate~endDate) 내 선택한 요일 · 시간에 해당하는 일정을 일괄 생성합니다. 이미 존재하는 날짜는 skip 됩니다.",
  })
  @ApiResponse({
    status: 201,
    description: "일정이 일괄 생성되었습니다.",
    schema: {
      example: {
        created: 39,
        skipped: 2,
        schedules: [
          {
            id: "schedule-uuid",
            classId: "class-uuid",
            scheduledDate: "2026-05-04T09:00:00.000Z",
            isCancelled: false,
            createdAt: "2026-04-21T10:00:00.000Z",
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 403,
    description:
      "승인된 수업에만 일정을 생성할 수 있습니다 · 감독 권한 필요 · 1회 최대 200건",
  })
  @ApiResponse({ status: 404, description: "수업을 찾을 수 없습니다." })
  async createBulkClassSchedules(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Param("classId") classId: string,
    @Body() dto: CreateBulkScheduleDto,
  ) {
    return this.classesService.createBulkClassSchedules(
      req.user.id,
      teamId,
      classId,
      dto,
    );
  }

  /**
   * 수업 일정 취소
   */
  @Put(":classId/schedules/:scheduleId/cancel")
  @Roles("COACH", "DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "수업 일정 취소",
    description: "감독이 수업 일정을 취소합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "일정이 취소되었습니다.",
  })
  @ApiResponse({
    status: 403,
    description: "감독만 취소할 수 있습니다.",
  })
  @ApiResponse({
    status: 404,
    description: "일정을 찾을 수 없습니다.",
  })
  async cancelClassSchedule(
    @Request() req: AuthenticatedRequest,
    @Param("scheduleId") scheduleId: string,
    @Body("cancellationReason") cancellationReason?: string,
  ) {
    return this.classesService.cancelClassSchedule(
      req.user.id,
      scheduleId,
      cancellationReason,
    );
  }

  /**
   * 개별 회차 시간·장소 수정
   */
  @Put(":classId/schedules/:scheduleId")
  @Roles("COACH", "DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "수업 회차 시간·장소 수정",
    description: "감독/코치가 특정 회차의 시작·종료 시간과 장소를 수정합니다.",
  })
  @ApiResponse({ status: 200, description: "일정이 수정되었습니다." })
  @ApiResponse({ status: 403, description: "수정 권한 없음 · 취소된 일정" })
  @ApiResponse({ status: 404, description: "일정을 찾을 수 없습니다." })
  async updateClassSchedule(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Param("scheduleId") scheduleId: string,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.classesService.updateClassSchedule(
      req.user.id,
      scheduleId,
      dto,
      { teamId },
    );
  }

  /**
   * 기간별 수업 일정 조회
   */
  @Get(":classId/schedules")
  @ApiOperation({
    summary: "기간별 수업 일정 조회",
    description: "지정된 기간의 수업 일정을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "일정 목록 조회 성공",
  })
  @ApiResponse({
    status: 404,
    description: "수업을 찾을 수 없습니다.",
  })
  async getClassSchedulesByDateRange(
    @Param("classId") classId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    // 범위 미지정 시 해당 수업의 전체 회차를 반환 (수업 상세·일정 관리 화면용).
    // 캘린더 화면은 보고 있는 달의 startDate·endDate 를 명시 전달한다.
    return this.classesService.getClassSchedulesByDateRange(
      classId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  /**
   * 수업 상품 생성 (감독만)
   */
  @Post(":classId/products")
  @Roles("COACH", "DIRECTOR")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "수업 상품 생성",
    description: "감독이 수업에 대한 결제 상품을 생성합니다.",
  })
  @ApiResponse({
    status: 201,
    description: "상품이 생성되었습니다.",
    schema: {
      example: {
        id: "product-uuid",
        classId: "class-uuid",
        productName: "월 8회 수업",
        description: "주 2회 수업 (1개월)",
        price: 240000,
        sessionsPerMonth: 8,
        durationDays: 30,
        createdAt: "2026-01-04T10:00:00Z",
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: "감독만 상품을 생성할 수 있습니다.",
  })
  @ApiResponse({
    status: 404,
    description: "수업을 찾을 수 없습니다.",
  })
  async createClassProduct(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Param("classId") classId: string,
    @Body() createProductDto: CreateClassProductDto,
  ) {
    return this.classesService.createClassProduct(
      req.user.id,
      teamId,
      classId,
      createProductDto,
    );
  }

  /**
   * 수업 상품 목록 조회
   */
  @Get(":classId/products")
  @ApiOperation({
    summary: "수업 상품 목록",
    description:
      "특정 수업의 상품 목록을 조회합니다. PARENT/CHILD/TEEN 은 비활성 패키지가 응답에서 제외됩니다.",
  })
  @ApiResponse({
    status: 200,
    description: "상품 목록 조회 성공",
  })
  @ApiResponse({
    status: 404,
    description: "수업을 찾을 수 없습니다.",
  })
  async getClassProducts(
    @Request() req: AuthenticatedRequest,
    @Param("classId") classId: string,
  ) {
    return this.classesService.getClassProducts(classId, req.user);
  }

  /**
   * 수업 패키지(상품) 수정 (2026-05-22 신규).
   *
   * isActive=false 전환은 본 엔드포인트로 처리 (soft delete 호환).
   */
  @Patch(":classId/products/:productId")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "수업 패키지 수정",
    description:
      "수업 패키지를 부분 수정합니다. isActive=false 로 비활성화하면 결제·노출이 차단됩니다.",
  })
  @ApiResponse({ status: 200, description: "패키지가 수정되었습니다." })
  @ApiResponse({ status: 403, description: "감독/코치만 수정할 수 있습니다." })
  @ApiResponse({ status: 404, description: "패키지를 찾을 수 없습니다." })
  async updateClassProduct(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Param("classId") classId: string,
    @Param("productId") productId: string,
    @Body() dto: UpdateClassProductDto,
  ) {
    return this.classesService.updateClassProduct(
      req.user.id,
      teamId,
      classId,
      productId,
      dto,
    );
  }

  /**
   * 수업 패키지(상품) 삭제 (2026-05-22 신규).
   *
   * 결제·수강 이력이 있으면 자동으로 soft delete (isActive=false).
   */
  @Delete(":classId/products/:productId")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "수업 패키지 삭제",
    description:
      "수업 패키지를 삭제합니다. 결제·수강 이력이 있으면 자동으로 soft delete(isActive=false) 처리됩니다.",
  })
  @ApiResponse({
    status: 200,
    description: "패키지가 삭제되었습니다.",
    schema: {
      example: {
        id: "product-uuid",
        deleted: "soft",
      },
    },
  })
  @ApiResponse({ status: 403, description: "감독/코치만 삭제할 수 있습니다." })
  @ApiResponse({ status: 404, description: "패키지를 찾을 수 없습니다." })
  async deleteClassProduct(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Param("classId") classId: string,
    @Param("productId") productId: string,
  ) {
    return this.classesService.deleteClassProduct(
      req.user.id,
      teamId,
      classId,
      productId,
    );
  }

  /**
   * 2026-05-08: 수업별 결제 현황 — 등록 학생 + 가장 최근 Enrollment + Payment 결합.
   * 코치/감독 결제확인 페이지에서 사용.
   */
  @Get(":classId/payments")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @ApiOperation({
    summary: "수업 결제 현황 (등록 학생 전체)",
    description:
      "수업에 활성 등록된 학생 전원과 각 학생의 가장 최근 Enrollment/Payment 상태를 반환합니다. 미결제 학생은 paymentStatus='unpaid' 로 표기.",
  })
  async getClassPayments(@Param("classId") classId: string) {
    return this.classesService.getClassPayments(classId);
  }
}
