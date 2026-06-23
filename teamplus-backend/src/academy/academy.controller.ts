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
  ApiQuery,
} from "@nestjs/swagger";
import { AcademyService } from "./academy.service";
import { ClassesService } from "@/classes/classes.service";
import { CreateAcademyDto } from "./dto/create-academy.dto";
import { UpdateAcademyDto } from "./dto/update-academy.dto";
import { JoinAcademyDto } from "./dto/join-academy.dto";
import { ApproveMemberDto } from "./dto/approve-member.dto";
import { AddCoachDto } from "./dto/add-coach.dto";
import { BroadcastNoticeDto } from "./dto/broadcast-notice.dto";
import { CreateClassDto } from "@/classes/dto/create-class.dto";
import { UpdateClassDto } from "@/classes/dto/update-class.dto";
import {
  CreateBulkScheduleDto,
  UpdateScheduleDto,
} from "@/classes/dto/create-schedule.dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
import { AuditAction } from "@/common/decorators";
import {
  GetClassesSummaryQueryDto,
  SearchAcademyStudentsQueryDto,
  GetClassStudentsQueryDto,
  GetAcademyStudentsQueryDto,
} from "./dto/academy-students.dto";

@ApiTags("Academy Management")
@Controller("api/v1/academies")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
export class AcademyController {
  constructor(
    private readonly academyService: AcademyService,
    private readonly classesService: ClassesService,
  ) {}

  /**
   * 아카데미 생성
   */
  @Post()
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "아카데미 생성",
    description:
      "새 아카데미를 생성합니다. 코치, 감독, 아카데미 감독만 가능합니다.",
  })
  @ApiResponse({ status: 201, description: "아카데미 생성 성공" })
  @ApiResponse({ status: 403, description: "권한이 없습니다." })
  async createAcademy(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateAcademyDto,
  ) {
    return this.academyService.createAcademy(req.user.id, dto);
  }

  /**
   * 내 아카데미 목록
   */
  @Get("my/list")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR")
  @ApiOperation({
    summary: "내 아카데미 목록 조회",
    description: "내가 관리하는 아카데미 목록을 조회합니다.",
  })
  @ApiResponse({ status: 200, description: "아카데미 목록 조회 성공" })
  async getMyAcademies(@Request() req: AuthenticatedRequest) {
    return this.academyService.getMyAcademies(req.user.id);
  }

  /**
   * 아카데미 상세 조회
   */
  @Get(":academyId")
  @Roles(
    "ADMIN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
    "COACH",
    "PARENT",
    "TEEN",
    "CHILD",
  )
  @ApiOperation({
    summary: "아카데미 상세 조회",
    description: "특정 아카데미의 상세 정보를 조회합니다.",
  })
  @ApiResponse({ status: 200, description: "아카데미 상세 조회 성공" })
  @ApiResponse({ status: 404, description: "아카데미를 찾을 수 없습니다." })
  async getAcademyDetail(@Param("academyId") academyId: string) {
    return this.academyService.getAcademyDetail(academyId);
  }

  /**
   * 아카데미 수정
   */
  @Put(":academyId")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR")
  @ApiOperation({
    summary: "아카데미 수정",
    description: "아카데미 정보를 수정합니다. 아카데미 감독만 가능합니다.",
  })
  @ApiResponse({ status: 200, description: "아카데미 수정 성공" })
  @ApiResponse({
    status: 403,
    description: "아카데미 감독만 수정할 수 있습니다.",
  })
  @ApiResponse({ status: 404, description: "아카데미를 찾을 수 없습니다." })
  async updateAcademy(
    @Request() req: AuthenticatedRequest,
    @Param("academyId") academyId: string,
    @Body() dto: UpdateAcademyDto,
  ) {
    return this.academyService.updateAcademy(req.user.id, academyId, dto);
  }

  /**
   * 아카데미 비활성화 (소프트 삭제)
   */
  @Delete(":academyId")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR")
  @AuditAction({
    action: "academy.delete",
    resource: "Academy",
    includeKeys: ["academyId"],
  })
  @ApiOperation({
    summary: "아카데미 비활성화",
    description: "아카데미를 비활성화합니다. 아카데미 감독만 가능합니다.",
  })
  @ApiResponse({ status: 200, description: "아카데미 비활성화 성공" })
  @ApiResponse({
    status: 403,
    description: "아카데미 감독만 삭제할 수 있습니다.",
  })
  @ApiResponse({ status: 404, description: "아카데미를 찾을 수 없습니다." })
  async deleteAcademy(
    @Request() req: AuthenticatedRequest,
    @Param("academyId") academyId: string,
  ) {
    return this.academyService.deleteAcademy(req.user.id, academyId);
  }

  /**
   * 아카데미 가입 신청
   */
  @Post("join")
  @Roles("PARENT", "TEEN")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "아카데미 가입 신청",
    description:
      "아카데미 코드를 사용하여 가입을 신청합니다. 학부모, 청소년만 가능합니다.",
  })
  @ApiResponse({ status: 201, description: "가입 신청 성공" })
  @ApiResponse({
    status: 404,
    description: "해당 코드의 아카데미를 찾을 수 없습니다.",
  })
  @ApiResponse({ status: 409, description: "이미 가입된 아카데미입니다." })
  async joinAcademy(
    @Request() req: AuthenticatedRequest,
    @Body() dto: JoinAcademyDto,
  ) {
    return this.academyService.joinAcademy(req.user.id, dto);
  }

  /**
   * 멤버 목록 조회
   * @deprecated 수강생 탭은 /classes-summary 및 /classes/:classId/students 로 대체됨 (SPEC_ACADEMY_STUDENTS_REDESIGN)
   */
  @Get(":academyId/members")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR")
  @ApiOperation({
    summary: "멤버 목록 조회",
    description: "아카데미 멤버 목록을 조회합니다.",
  })
  @ApiQuery({
    name: "status",
    required: false,
    description: "상태 필터 (PENDING, ACTIVE, INACTIVE, BLOCKED)",
  })
  @ApiQuery({ name: "page", required: false, description: "페이지 번호" })
  @ApiQuery({ name: "limit", required: false, description: "페이지당 개수" })
  @ApiResponse({ status: 200, description: "멤버 목록 조회 성공" })
  async getMembers(
    @Param("academyId") academyId: string,
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.academyService.getMembers(
      academyId,
      status,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /**
   * 멤버 승인/거절
   * @deprecated 학원 가입 승인 워크플로는 오픈클래스 정책상 제거됨 (SPEC_ACADEMY_STUDENTS_REDESIGN §1)
   */
  @Put(":academyId/members/:memberId/approve")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR")
  @AuditAction({
    action: "academy.member.approve",
    resource: "AcademyMember",
    includeKeys: ["academyId", "memberId", "status"],
  })
  @ApiOperation({
    summary: "멤버 승인/거절",
    description:
      "가입 신청한 멤버를 승인 또는 거절합니다. 아카데미 감독만 가능합니다.",
  })
  @ApiResponse({ status: 200, description: "멤버 상태 변경 성공" })
  @ApiResponse({
    status: 403,
    description: "아카데미 감독만 승인/거절할 수 있습니다.",
  })
  @ApiResponse({ status: 404, description: "해당 멤버를 찾을 수 없습니다." })
  async approveMember(
    @Request() req: AuthenticatedRequest,
    @Param("academyId") academyId: string,
    @Param("memberId") memberId: string,
    @Body() dto: ApproveMemberDto,
  ) {
    return this.academyService.approveMember(
      req.user.id,
      academyId,
      memberId,
      dto,
    );
  }

  /**
   * 멤버 제거
   * @deprecated AcademyMember 기반 관리는 오픈클래스 정책상 제거됨 (SPEC_ACADEMY_STUDENTS_REDESIGN §1)
   */
  @Delete(":academyId/members/:memberId")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR")
  @AuditAction({
    action: "academy.member.remove",
    resource: "AcademyMember",
    includeKeys: ["academyId", "memberId"],
  })
  @ApiOperation({
    summary: "멤버 제거",
    description: "아카데미 멤버를 제거합니다. 아카데미 감독만 가능합니다.",
  })
  @ApiResponse({ status: 200, description: "멤버 제거 성공" })
  @ApiResponse({
    status: 403,
    description: "아카데미 감독만 멤버를 제거할 수 있습니다.",
  })
  @ApiResponse({ status: 404, description: "해당 멤버를 찾을 수 없습니다." })
  async removeMember(
    @Request() req: AuthenticatedRequest,
    @Param("academyId") academyId: string,
    @Param("memberId") memberId: string,
  ) {
    return this.academyService.removeMember(req.user.id, academyId, memberId);
  }

  /**
   * 코치 추가
   */
  @Post(":academyId/coaches")
  @Roles("DIRECTOR", "ACADEMY_DIRECTOR")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "코치 추가",
    description: "아카데미에 코치를 추가합니다. 아카데미 감독만 가능합니다.",
  })
  @ApiResponse({ status: 201, description: "코치 추가 성공" })
  @ApiResponse({
    status: 403,
    description: "아카데미 감독만 코치를 추가할 수 있습니다.",
  })
  @ApiResponse({ status: 409, description: "이미 등록된 코치입니다." })
  async addCoach(
    @Request() req: AuthenticatedRequest,
    @Param("academyId") academyId: string,
    @Body() dto: AddCoachDto,
  ) {
    return this.academyService.addCoach(req.user.id, academyId, dto);
  }

  /**
   * 코치 제거
   */
  @Delete(":academyId/coaches/:coachId")
  @Roles("DIRECTOR", "ACADEMY_DIRECTOR")
  @AuditAction({
    action: "academy.coach.remove",
    resource: "AcademyCoach",
    includeKeys: ["academyId", "coachId"],
  })
  @ApiOperation({
    summary: "코치 제거",
    description: "아카데미 코치를 제거합니다. 아카데미 감독만 가능합니다.",
  })
  @ApiResponse({ status: 200, description: "코치 제거 성공" })
  @ApiResponse({
    status: 403,
    description: "아카데미 감독만 코치를 제거할 수 있습니다.",
  })
  @ApiResponse({ status: 404, description: "해당 코치를 찾을 수 없습니다." })
  async removeCoach(
    @Request() req: AuthenticatedRequest,
    @Param("academyId") academyId: string,
    @Param("coachId") coachId: string,
  ) {
    return this.academyService.removeCoach(req.user.id, academyId, coachId);
  }

  /**
   * 코치 목록 조회
   */
  @Get(":academyId/coaches")
  @Roles(
    "ADMIN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
    "COACH",
    "PARENT",
    "TEEN",
    "CHILD",
  )
  @ApiOperation({
    summary: "코치 목록 조회",
    description: "아카데미 소속 코치 목록을 조회합니다.",
  })
  @ApiResponse({ status: 200, description: "코치 목록 조회 성공" })
  async getCoaches(@Param("academyId") academyId: string) {
    return this.academyService.getCoaches(academyId);
  }

  /**
   * 아카데미 수업 생성 (ClassesService 위임)
   */
  @Post(":academyId/classes")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "아카데미 수업 생성",
    description:
      "아카데미에 수업을 생성합니다. 아카데미 감독 또는 소속 코치만 가능합니다.",
  })
  @ApiResponse({ status: 201, description: "수업 생성 성공" })
  @ApiResponse({
    status: 403,
    description: "아카데미 감독 또는 소속 코치만 수업을 생성할 수 있습니다.",
  })
  async createAcademyClass(
    @Request() req: AuthenticatedRequest,
    @Param("academyId") academyId: string,
    @Body() dto: CreateClassDto,
  ) {
    return this.classesService.createAcademyClass(req.user.id, academyId, dto);
  }

  /**
   * 아카데미 수업 수정 (PR-E C3 fix · 2026-05-15)
   *
   * `updateAcademyClass` 위임. 학원 감독·코치만 본인 학원 수업 수정 가능.
   * 회의록 R-1 권한 배타: 팀 DIRECTOR 는 차단, ADMIN 만 디버깅 허용.
   * visibleTeamIds 전달 시 ClassTeamVisibility 전체 replace (오픈클래스 노출 팀 교체).
   */
  @Put(":academyId/classes/:classId")
  @Roles("COACH", "ACADEMY_DIRECTOR", "ADMIN")
  @ApiOperation({
    summary: "아카데미 수업 수정",
    description:
      "아카데미 수업을 수정합니다. 학원 감독 또는 활성 학원 코치만 가능합니다. visibleTeamIds 전달 시 노출 팀 전체 교체.",
  })
  @ApiResponse({ status: 200, description: "수업이 수정되었습니다." })
  @ApiResponse({
    status: 403,
    description: "이 아카데미의 감독/코치만 수업을 수정할 수 있습니다.",
  })
  @ApiResponse({ status: 404, description: "수업을 찾을 수 없습니다." })
  async updateAcademyClass(
    @Request() req: AuthenticatedRequest,
    @Param("academyId") academyId: string,
    @Param("classId") classId: string,
    @Body() dto: UpdateClassDto,
  ) {
    return this.classesService.updateAcademyClass(
      req.user.id,
      academyId,
      classId,
      dto,
    );
  }

  /**
   * 아카데미 수업 삭제 (PR-E C3 fix · 2026-05-15)
   *
   * `deleteAcademyClass` 위임. 활성 수강생이 있으면 409 반환.
   * 회의록 R-1 권한 배타: 팀 DIRECTOR 는 차단, ADMIN 만 디버깅 허용.
   */
  @Delete(":academyId/classes/:classId")
  @Roles("COACH", "ACADEMY_DIRECTOR", "ADMIN")
  @ApiOperation({
    summary: "아카데미 수업 삭제",
    description:
      "아카데미 수업을 삭제합니다. 학원 감독 또는 활성 학원 코치만 가능. 활성 수강생이 있으면 삭제 불가.",
  })
  @ApiResponse({ status: 200, description: "수업이 삭제되었습니다." })
  @ApiResponse({
    status: 403,
    description: "이 아카데미의 감독/코치만 수업을 삭제할 수 있습니다.",
  })
  @ApiResponse({
    status: 409,
    description: "활성 수강생이 있는 수업은 삭제할 수 없습니다.",
  })
  async deleteAcademyClass(
    @Request() req: AuthenticatedRequest,
    @Param("academyId") academyId: string,
    @Param("classId") classId: string,
  ) {
    return this.classesService.deleteAcademyClass(
      req.user.id,
      academyId,
      classId,
    );
  }

  /**
   * 2026-05-19: 아카데미 수업 결제 현황 — 등록 학생 + 최근 Enrollment + Payment 결합.
   *
   * 팀용 `GET /teams/:teamId/classes/:classId/payments` 와 동일 응답 구조를 학원 도메인에
   * 미러링. 학원 수업(Class.teamId IS NULL, Class.academyId NOT NULL) 의 결제 확인 페이지에서 사용.
   *
   * `ClassesService.getClassPayments(classId)` 는 도메인 무관 작동하므로 그대로 재사용.
   * academyId 는 URL 의미·권한 가드용 (향후 service 권한 검증 강화 시 학원 소속 매칭 확인 추가).
   */
  @Get(":academyId/classes/:classId/payments")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @ApiOperation({
    summary: "아카데미 수업 결제 현황 (등록 학생 전체)",
    description:
      "학원 수업에 활성 등록된 학생 전원과 각 학생의 가장 최근 Enrollment/Payment 상태를 반환합니다. 팀용 엔드포인트와 동일 응답 구조.",
  })
  @ApiResponse({ status: 200, description: "결제 현황 조회 성공" })
  @ApiResponse({ status: 404, description: "수업을 찾을 수 없습니다." })
  async getAcademyClassPayments(
    @Param("academyId") _academyId: string,
    @Param("classId") classId: string,
  ) {
    return this.classesService.getClassPayments(classId);
  }

  /**
   * 아카데미 수업 일정 일괄 생성 (다건) — 기간 + 요일 + 시간 기반
   *
   * 팀용 `POST /teams/:teamId/classes/:classId/schedules/bulk` 와 동일 패턴.
   * createAcademyClass 등록 시 일정 누락된 케이스의 복구 경로로도 사용.
   */
  @Post(":academyId/classes/:classId/schedules/bulk")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "오픈클래스 일정 일괄 생성",
    description:
      "지정 기간(startDate~endDate) 내 선택한 요일·시간에 해당하는 일정을 일괄 생성합니다. 이미 존재하는 날짜는 skip. 결제 완료 수강생 RSVP 자동 생성. 1회 최대 200건.",
  })
  @ApiResponse({
    status: 201,
    description: "일정이 일괄 생성되었습니다.",
    schema: {
      example: {
        created: 16,
        skipped: 0,
        schedules: [
          {
            id: "schedule-uuid",
            classId: "class-uuid",
            scheduledDate: "2026-05-15T18:00:00.000Z",
            isCancelled: false,
            createdAt: "2026-05-14T10:00:00.000Z",
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 403,
    description:
      "학원 감독/코치만 일정을 생성할 수 있습니다 · 승인된 수업 · 1회 최대 200건",
  })
  @ApiResponse({ status: 404, description: "수업을 찾을 수 없습니다." })
  async createAcademyBulkSchedules(
    @Request() req: AuthenticatedRequest,
    @Param("academyId") academyId: string,
    @Param("classId") classId: string,
    @Body() dto: CreateBulkScheduleDto,
  ) {
    return this.classesService.bulkAddAcademySchedules(
      req.user.id,
      academyId,
      classId,
      dto,
    );
  }

  /**
   * 아카데미 수업 일정 목록 조회 (기간별)
   *
   * 팀용 `GET /teams/:teamId/classes/:classId/schedules` 와 동일 패턴.
   * 학원 수업의 일정 페이지가 일정 목록을 조회할 때 호출.
   */
  @Get(":academyId/classes/:classId/schedules")
  @Roles(
    "ADMIN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
    "COACH",
    "PARENT",
    "TEEN",
    "CHILD",
  )
  @ApiOperation({
    summary: "오픈클래스 일정 목록 조회",
    description: "학원 수업의 기간별 일정 목록을 조회합니다.",
  })
  @ApiQuery({
    name: "startDate",
    required: false,
    description: "조회 시작일 (YYYY-MM-DD)",
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    description: "조회 종료일 (YYYY-MM-DD)",
  })
  @ApiResponse({ status: 200, description: "일정 목록 조회 성공" })
  async getAcademyClassSchedules(
    @Param("academyId") _academyId: string,
    @Param("classId") classId: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    // service 메서드는 classId 만으로 조회 (권한 검증 없음 — 기존 팀 endpoint 와 동일)
    // path 의 academyId 는 RESTful 의미 유지용 (잘못된 academyId 라도 다른 학원의 수업
    //   classId 를 모르면 데이터 노출 위험 없음).
    // 범위 미지정 시 해당 수업의 전체 회차를 반환 (수업 상세·일정 관리 화면용).
    return this.classesService.getClassSchedulesByDateRange(
      classId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  /**
   * 아카데미 수업 일정 취소
   *
   * 팀용 `PUT /teams/:teamId/classes/:classId/schedules/:scheduleId/cancel` 와
   * 동일 패턴. cancelClassSchedule 의 expectedOwner.academyId 옵션을 통해
   * path academyId 일치 검증 + 학원 권한 가드 적용.
   */
  @Put(":academyId/classes/:classId/schedules/:scheduleId/cancel")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "오픈클래스 일정 취소",
    description:
      "학원 수업의 일정을 취소합니다. 학원 감독 또는 소속 코치만 가능. 출석/크레딧 복원은 팀 패턴과 동일.",
  })
  @ApiResponse({ status: 200, description: "일정이 취소되었습니다." })
  @ApiResponse({
    status: 403,
    description: "학원 감독/코치만 일정을 취소할 수 있습니다.",
  })
  @ApiResponse({ status: 404, description: "일정을 찾을 수 없습니다." })
  async cancelAcademyClassSchedule(
    @Request() req: AuthenticatedRequest,
    @Param("academyId") academyId: string,
    @Param("scheduleId") scheduleId: string,
    @Body("cancellationReason") cancellationReason?: string,
  ) {
    return this.classesService.cancelClassSchedule(
      req.user.id,
      scheduleId,
      cancellationReason,
      { academyId },
    );
  }

  /**
   * 아카데미 수업 회차 시간·장소 수정
   *
   * 팀용 `PUT /teams/:teamId/classes/:classId/schedules/:scheduleId` 와 동일 패턴.
   * updateClassSchedule 의 expectedOwner.academyId 옵션으로 path 일치 검증 + 학원 가드 적용.
   */
  @Put(":academyId/classes/:classId/schedules/:scheduleId")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "오픈클래스 회차 시간·장소 수정",
    description:
      "학원 수업 회차의 시작·종료 시간과 장소를 수정합니다. 학원 감독 또는 소속 코치만 가능.",
  })
  @ApiResponse({ status: 200, description: "일정이 수정되었습니다." })
  @ApiResponse({ status: 403, description: "수정 권한 없음 · 취소된 일정" })
  @ApiResponse({ status: 404, description: "일정을 찾을 수 없습니다." })
  async updateAcademyClassSchedule(
    @Request() req: AuthenticatedRequest,
    @Param("academyId") academyId: string,
    @Param("scheduleId") scheduleId: string,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.classesService.updateClassSchedule(
      req.user.id,
      scheduleId,
      dto,
      { academyId },
    );
  }

  /**
   * 아카데미 수업 목록 조회
   */
  @Get(":academyId/classes")
  @Roles(
    "ADMIN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
    "COACH",
    "PARENT",
    "TEEN",
    "CHILD",
  )
  @ApiOperation({
    summary: "아카데미 수업 목록 조회",
    description: "아카데미의 수업 목록을 조회합니다.",
  })
  @ApiResponse({ status: 200, description: "수업 목록 조회 성공" })
  async getAcademyClasses(
    @Param("academyId") academyId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.academyService.getAcademyClasses(academyId, req.user);
  }

  /**
   * 아카데미 브로드캐스트 공지 발송
   */
  @Post(":academyId/notices")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "아카데미 공지 발송",
    description:
      "아카데미 감독이 활성 수강생 전원에게 브로드캐스트 공지를 발송합니다.",
  })
  @ApiResponse({ status: 200, description: "공지 발송 성공" })
  @ApiResponse({ status: 403, description: "권한이 없습니다." })
  async broadcastNotice(
    @Request() req: AuthenticatedRequest,
    @Param("academyId") academyId: string,
    @Body() dto: BroadcastNoticeDto,
  ) {
    return this.academyService.broadcastNotice(req.user.id, academyId, dto);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 신규 수강생 탭 API (SPEC_ACADEMY_STUDENTS_REDESIGN v1.0 · 2026-05-18)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * 수업 카드 리스트 + 학원 요약 카운트 (Master 화면)
   * SPEC v3 2026-05-18 — 수업 카드 IA 재활성화. /academy/{id}?tab=students 기본 모드 데이터 소스.
   */
  @Get(":academyId/classes-summary")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "ACADEMY_DIRECTOR")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "학원 수업 요약 목록",
    description:
      "수업 카드 리스트와 학원 수강생 요약 카운트를 반환합니다. ADMIN은 모든 학원, ACADEMY_DIRECTOR는 자기 학원만 조회 가능.",
  })
  @ApiResponse({
    status: 200,
    description: "수업 요약 목록 조회 성공",
    schema: {
      example: {
        success: true,
        data: {
          summary: {
            uniqueStudentCount: 47,
            totalClassCount: 8,
            activeClassCount: 6,
            endedClassCount: 2,
          },
          classes: [
            {
              id: "class-id",
              className: "화/목 19:00 정기 레슨",
              trainingType: "lesson",
              scheduleSummary: "매주 화·목",
              durationMinutes: 90,
              startDate: "2026-04-01",
              endDate: "2026-12-31",
              status: "active",
              enrollmentCount: 12,
              pendingCount: 2,
            },
          ],
          pagination: { total: 8, page: 1, limit: 20 },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: "접근 권한이 없습니다." })
  @ApiResponse({ status: 404, description: "아카데미를 찾을 수 없습니다." })
  async getClassesSummary(
    @Request() req: AuthenticatedRequest,
    @Param("academyId") academyId: string,
    @Query() query: GetClassesSummaryQueryDto,
  ) {
    return this.academyService.getClassesSummary(
      academyId,
      req.user.id,
      req.user.userType,
      query,
    );
  }

  /**
   * 학원 수강생 단일 리스트 (활성 수업의 paid enrollment 학생 unique)
   * SPEC v2 2026-05-18 — 학생 단위 unique 리스트 + 검색 + 정렬 + 페이지네이션 통합
   */
  @Get(":academyId/students")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "ACADEMY_DIRECTOR")
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      "학원 수강생 단일 리스트 (활성 수업의 paid enrollment 학생 unique)",
    description:
      "학원에 등록된 활성 수업의 paid 상태 수강생을 학생 단위로 unique 반환합니다. 검색, 정렬, 페이지네이션을 통합 지원합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "수강생 리스트 조회 성공",
    schema: {
      example: {
        success: true,
        data: {
          summary: { uniqueStudentCount: 47, activeClassCount: 6 },
          results: [
            {
              childId: "child-id",
              childName: "김민준",
              parentId: "parent-id",
              parentName: "안부모",
              parentPhone: "010-XXXX-XXXX",
              enrolledClasses: [
                {
                  classId: "class-id",
                  className: "정기 레슨",
                  status: "paid",
                  trainingType: "lesson",
                },
              ],
              lastPaidAt: "2026-04-12T10:00:00.000Z",
            },
          ],
          pagination: { total: 47, page: 1, limit: 20 },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: "권한 없음 (자기 학원 아님)" })
  @ApiResponse({ status: 404, description: "학원 없음" })
  async getAcademyStudents(
    @Param("academyId") academyId: string,
    @Request() req: AuthenticatedRequest,
    @Query() query: GetAcademyStudentsQueryDto,
  ) {
    return this.academyService.getAcademyStudents(
      academyId,
      req.user.id,
      req.user.userType,
      query,
    );
  }

  /**
   * 학원 내 학생 통합 검색
   * @deprecated 2026-05-18 SPEC v2 — 학생 단위 단일 리스트 endpoint(`GET /students`) 로 통합.
   *   Frontend 마이그레이션 완료 후 제거 예정. 새 코드는 `GET :academyId/students` 사용.
   */
  @Get(":academyId/students/search")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "ACADEMY_DIRECTOR")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "학원 수강생 통합 검색",
    description:
      "학원에 등록된 수강생을 이름으로 검색합니다. 자녀 단위로 그룹화하여 반환합니다. 빈 검색어는 빈 결과를 반환합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "수강생 검색 성공",
    schema: {
      example: {
        success: true,
        data: {
          results: [
            {
              childId: "child-id",
              childName: "김민준",
              parentId: "parent-id",
              parentName: "안부모",
              parentPhone: "010-XXXX-XXXX",
              enrolledClasses: [
                {
                  classId: "class-id",
                  className: "화/목 레슨",
                  status: "paid",
                },
              ],
            },
          ],
          pagination: { total: 3, page: 1, limit: 20 },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: "접근 권한이 없습니다." })
  async searchStudents(
    @Request() req: AuthenticatedRequest,
    @Param("academyId") academyId: string,
    @Query() query: SearchAcademyStudentsQueryDto,
  ) {
    return this.academyService.searchStudents(
      academyId,
      req.user.id,
      req.user.userType,
      query,
    );
  }

  /**
   * 특정 수업의 수강생 목록 (Detail 화면)
   */
  @Get(":academyId/classes/:classId/students")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "ACADEMY_DIRECTOR")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "수업별 수강생 목록",
    description:
      "특정 수업의 수강생 목록을 반환합니다. classId가 해당 academyId 소속인지 검증합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "수강생 목록 조회 성공",
    schema: {
      example: {
        success: true,
        data: {
          classInfo: {
            id: "class-id",
            className: "화/목 19:00 정기 레슨",
            scheduleSummary: "매주 화·목",
            durationMinutes: 90,
            enrollmentCount: 12,
            pendingCount: 2,
          },
          students: [
            {
              enrollmentId: "enrollment-id",
              childId: "child-id",
              childName: "김민준",
              parentId: "parent-id",
              parentName: "안부모",
              parentPhone: "010-XXXX-XXXX",
              status: "paid",
              paidAt: "2026-04-12T00:00:00.000Z",
              requestedAt: "2026-04-10T00:00:00.000Z",
            },
          ],
          pagination: { total: 12, page: 1, limit: 20 },
        },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: "해당 수업에 접근 권한이 없습니다.",
  })
  @ApiResponse({ status: 404, description: "아카데미를 찾을 수 없습니다." })
  async getClassStudents(
    @Request() req: AuthenticatedRequest,
    @Param("academyId") academyId: string,
    @Param("classId") classId: string,
    @Query() query: GetClassStudentsQueryDto,
  ) {
    return this.academyService.getClassStudents(
      academyId,
      classId,
      req.user.id,
      req.user.userType,
      query,
    );
  }
}
