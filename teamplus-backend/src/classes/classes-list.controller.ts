import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from "@nestjs/swagger";
import { ClassesService } from "./classes.service";
import { GetClassesQueryDto } from "./dto/get-classes-query.dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";

@ApiTags("Classes")
@Controller("api/v1/classes")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
// 수업 상세/목록은 수강 신청 전 모든 인증 사용자가 조회할 수 있어야 함.
// (학부모·자녀: 신청 전 검토 / 코치·감독·관리자: 관리 목적)
// 각 엔드포인트에 @Roles() 명시로 접근 권한을 코드 레벨에 드러냄.
export class ClassesListController {
  constructor(private readonly classesService: ClassesService) {}

  /**
   * 전체 수업 목록 조회 (클럽 무관)
   */
  @Get()
  @Roles(
    "PARENT",
    "CHILD",
    "TEEN",
    "COACH",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
    "ADMIN",
  )
  @ApiOperation({
    summary: "전체 수업 목록 조회",
    description:
      "클럽과 무관하게 전체 활성 수업 목록을 조회합니다. 자녀 나이, 수업 유형으로 필터링 가능합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "수업 목록 조회 성공",
    schema: {
      example: {
        data: [
          {
            id: "class-uuid",
            className: "신규 수강생반",
            description: "아이스하키 입문 수업",
            trainingType: "regular",
            instructorName: "김철수",
            capacity: 15,
            ageMin: 7,
            ageMax: 12,
            levelRequired: "beginner",
            startTime: "2026-01-04T16:00:00Z",
            endTime: "2026-01-04T17:00:00Z",
            isActive: true,
            createdAt: "2026-01-04T10:00:00Z",
            _count: { enrollments: 5 },
          },
        ],
        pagination: {
          total: 42,
          page: 1,
          limit: 20,
          totalPages: 3,
        },
      },
    },
  })
  async getAllClasses(
    @Request() req: AuthenticatedRequest,
    @Query() query: GetClassesQueryDto,
  ) {
    return this.classesService.getAllClasses(query, req.user);
  }

  /**
   * 수업 상세 조회 (클럽 무관)
   */
  @Get(":classId")
  @Roles(
    "PARENT",
    "CHILD",
    "TEEN",
    "COACH",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
    "ADMIN",
  )
  @ApiOperation({
    summary: "수업 상세 조회",
    description:
      "classId만으로 수업 상세 정보를 조회합니다. 상품 목록과 향후 5개 일정을 포함합니다.",
  })
  @ApiParam({
    name: "classId",
    description: "수업 ID",
    example: "class-uuid",
  })
  @ApiResponse({
    status: 200,
    description: "수업 상세 조회 성공",
  })
  @ApiResponse({
    status: 404,
    description: "수업을 찾을 수 없습니다.",
  })
  async getClassById(
    @Request() req: AuthenticatedRequest,
    @Param("classId") classId: string,
  ) {
    return this.classesService.getClassById(classId, req.user);
  }

  /**
   * [추가 2026-05-15] 수업 스케줄 조회 — teamId 무관 단일 진입점.
   *  기존 `/teams/:teamId/classes/:classId/schedules` 는 teamId 가 필수라 오픈클래스
   *  (teamId=null, academyId 만 존재) 일정을 가져올 수 없었음. 감독/코치 캘린더
   *  페이지(useCalendar)가 오픈클래스 일정도 머지할 수 있도록 본 단축 엔드포인트 추가.
   */
  @Get(":classId/schedules")
  @Roles(
    "PARENT",
    "CHILD",
    "TEEN",
    "COACH",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
    "ADMIN",
  )
  @ApiOperation({
    summary: "수업 일정 조회 (classId 단독)",
    description:
      "classId 만으로 수업 스케줄을 기간별 조회합니다. 오픈클래스/정규수업 모두 동일 응답.",
  })
  @ApiParam({ name: "classId", description: "수업 ID" })
  async getClassSchedulesById(
    @Param("classId") classId: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    // 범위 미지정 시 해당 수업의 전체 회차를 반환 (수업 상세·일정 관리 화면용).
    return this.classesService.getClassSchedulesByDateRange(
      classId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  /**
   * 수업별 결제 현황 — classId 단독(도메인 무관) 단축 엔드포인트.
   *  팀/학원 공용 결제확인 페이지(students/page.tsx)가 teamId 없이 호출.
   *  기존 `/teams/:teamId/classes/:classId/payments` 와 동일 서비스 위임.
   */
  @Get(":classId/payments")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @ApiOperation({
    summary: "수업 결제 현황 (classId 단독)",
    description:
      "수업에 활성 등록된 학생 전원과 각 학생의 가장 최근 Enrollment/Payment 상태를 반환합니다. 미결제 학생은 paymentStatus='unpaid' 로 표기.",
  })
  @ApiParam({ name: "classId", description: "수업 ID" })
  async getClassPaymentsById(@Param("classId") classId: string) {
    return this.classesService.getClassPayments(classId);
  }

  /**
   * [신규 2026-05-13] 명단관리 — 코치/감독이 학생을 수업에 직접 배치.
   *  ClassRegistration(active) 생성. 이미 존재하면 active 로 복구.
   *  Body: { userId: string }
   */
  @Post(":classId/registrations")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "수업 학생 배치 (코치/감독)",
    description:
      "수업에 학생을 직접 배치합니다. ClassRegistration 을 생성/복구합니다.",
  })
  @ApiResponse({ status: 201, description: "배치 성공" })
  @ApiResponse({ status: 404, description: "수업/학생을 찾을 수 없습니다." })
  async assignStudent(
    @Request() req: AuthenticatedRequest,
    @Param("classId") classId: string,
    @Body() body: { userId: string },
  ) {
    return this.classesService.assignStudentToClass(
      req.user.id,
      classId,
      body.userId,
    );
  }

  /**
   * [신규 2026-05-13] 명단관리 — 코치/감독이 학생 배치 해제.
   *  ClassRegistration.status 를 inactive 로 변경 (soft).
   */
  @Delete(":classId/registrations/:userId")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "수업 학생 배치 해제 (코치/감독)",
    description:
      "수업에서 학생 배치를 해제합니다. ClassRegistration.status='inactive'.",
  })
  @ApiResponse({ status: 200, description: "해제 성공" })
  async unassignStudent(
    @Request() req: AuthenticatedRequest,
    @Param("classId") classId: string,
    @Param("userId") userId: string,
  ) {
    return this.classesService.unassignStudentFromClass(
      req.user.id,
      classId,
      userId,
    );
  }
}
