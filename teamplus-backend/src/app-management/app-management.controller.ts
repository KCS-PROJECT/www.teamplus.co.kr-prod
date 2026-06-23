import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from "@nestjs/swagger";
import { AppManagementService } from "./app-management.service";
import { RolesGuard } from "@/auth/roles.guard";
import { Roles } from "@/auth/roles.decorator";
import { Public } from "@/auth/public.decorator";
import { UpdateAppSettingsDto } from "./dto/update-app-settings.dto";

const VALID_ROLES = [
  "PARENT",
  "COACH",
  "TEEN",
  "CHILD",
  "DIRECTOR",
  "ADMIN",
  "all",
] as const;
type ValidRole = (typeof VALID_ROLES)[number];

@ApiTags("App Management")
@ApiBearerAuth()
@Controller("api/v1/app")
export class AppManagementController {
  constructor(private readonly service: AppManagementService) {}

  // ==================== 배너 ====================

  @Get("banners")
  @Public()
  @ApiOperation({ summary: "배너 목록 조회" })
  @ApiQuery({ name: "isActive", required: false, type: Boolean })
  @ApiQuery({
    name: "role",
    required: false,
    description: "역할 필터 (PARENT|COACH|TEEN|CHILD|DIRECTOR|all)",
  })
  @ApiQuery({
    name: "displayLocation",
    required: false,
    description:
      "노출 위치 필터 (app_home|app_popup|app_mypage|web_home|web_popup|web_dashboard)",
  })
  getBanners(
    @Query("isActive") isActive?: string,
    @Query("role") role?: string,
    @Query("displayLocation") displayLocation?: string,
  ) {
    // C-2: role 파라미터 화이트리스트 검증 (SQL 인젝션 방지)
    const validatedRole =
      role && (VALID_ROLES as readonly string[]).includes(role)
        ? (role as ValidRole)
        : undefined;
    return this.service.getBanners({
      isActive,
      role: validatedRole,
      displayLocation,
    });
  }

  @Post("banners")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "배너 생성" })
  createBanner(
    @Body()
    body: {
      title: string;
      imageUrl: string;
      linkUrl?: string;
      linkType?: string;
      targetRoles?: string[];
      displayLocations?: string[];
      sortOrder?: number;
      isActive?: boolean;
      startAt?: string;
      endAt?: string;
    },
  ) {
    return this.service.createBanner({
      ...body,
      startAt: body.startAt ? new Date(body.startAt) : undefined,
      endAt: body.endAt ? new Date(body.endAt) : undefined,
    });
  }

  @Put("banners/:id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  @ApiOperation({ summary: "배너 수정" })
  updateBanner(
    @Param("id") id: string,
    @Body()
    body: {
      title?: string;
      imageUrl?: string;
      linkUrl?: string;
      linkType?: string;
      targetRoles?: string[];
      displayLocations?: string[];
      sortOrder?: number;
      isActive?: boolean;
      startAt?: string;
      endAt?: string;
    },
  ) {
    return this.service.updateBanner(id, {
      ...body,
      startAt: body.startAt ? new Date(body.startAt) : undefined,
      endAt: body.endAt ? new Date(body.endAt) : undefined,
    });
  }

  @Delete("banners/:id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "배너 삭제" })
  deleteBanner(@Param("id") id: string) {
    return this.service.deleteBanner(id);
  }

  // ==================== FAQ ====================

  @Get("faqs")
  @Public()
  @ApiOperation({ summary: "FAQ 목록 조회" })
  @ApiQuery({ name: "category", required: false })
  getFaqs(@Query("category") category?: string) {
    return this.service.getFaqs(category);
  }

  @Post("faqs")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "FAQ 생성" })
  createFaq(
    @Body()
    body: {
      category: string;
      question: string;
      answer: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.service.createFaq(body);
  }

  @Put("faqs/:id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  @ApiOperation({ summary: "FAQ 수정" })
  updateFaq(
    @Param("id") id: string,
    @Body()
    body: {
      category?: string;
      question?: string;
      answer?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.service.updateFaq(id, body);
  }

  @Delete("faqs/:id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "FAQ 삭제" })
  deleteFaq(@Param("id") id: string) {
    return this.service.deleteFaq(id);
  }

  // ==================== 피드백 ====================

  @Get("feedback")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  @ApiOperation({ summary: "피드백 목록 조회" })
  @ApiQuery({ name: "status", required: false })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  getFeedbacks(
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.service.getFeedbacks(
      status,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Post("feedback")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "DIRECTOR", "COACH", "PARENT", "TEEN", "CHILD")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "앱 피드백 제출 (사용자)" })
  submitUserFeedback(
    @Request() req: { user: { id: string } },
    @Body() body: { content: string; category: string; rating?: number },
  ) {
    return this.service.createUserFeedback(
      req.user.id,
      body.content,
      body.category,
      body.rating,
    );
  }

  /**
   * 내 피드백 목록 (본인)
   * 정적 경로 → feedback/:id 보다 먼저 선언
   */
  @Get("feedback/mine")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "DIRECTOR", "COACH", "PARENT", "TEEN", "CHILD")
  @ApiOperation({ summary: "내 피드백 목록 조회" })
  @ApiQuery({ name: "status", required: false })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  getMyFeedbacks(
    @Request() req: { user: { id: string } },
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.service.getMyFeedbacks(
      req.user.id,
      status,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /**
   * 내 피드백 상세 (본인)
   */
  @Get("feedback/mine/:id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "DIRECTOR", "COACH", "PARENT", "TEEN", "CHILD")
  @ApiOperation({ summary: "내 피드백 상세 조회" })
  getMyFeedbackDetail(
    @Request() req: { user: { id: string } },
    @Param("id") id: string,
  ) {
    return this.service.getMyFeedbackDetail(req.user.id, id);
  }

  @Patch("feedback/:id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  @ApiOperation({ summary: "피드백 상태 변경" })
  updateFeedbackStatus(
    @Param("id") id: string,
    @Body() body: { status: string; adminNote?: string },
  ) {
    return this.service.updateFeedbackStatus(id, body.status, body.adminNote);
  }

  // ==================== 약관 ====================

  @Get("terms")
  @Public()
  @ApiOperation({ summary: "약관 목록 조회" })
  @ApiQuery({
    name: "type",
    required: false,
    description: "service | privacy | marketing | refund",
  })
  getTerms(@Query("type") type?: string) {
    return this.service.getTerms(type);
  }

  @Post("terms")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "약관 생성" })
  createTerms(
    @Body()
    body: {
      type: string;
      title: string;
      content: string;
      version: string;
      isActive?: boolean;
      publishedAt?: string;
    },
  ) {
    return this.service.createTerms({
      ...body,
      publishedAt: body.publishedAt ? new Date(body.publishedAt) : undefined,
    });
  }

  @Put("terms/:id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  @ApiOperation({ summary: "약관 수정" })
  updateTerms(
    @Param("id") id: string,
    @Body()
    body: {
      type?: string;
      title?: string;
      content?: string;
      version?: string;
      isActive?: boolean;
      publishedAt?: string;
    },
  ) {
    return this.service.updateTerms(id, {
      ...body,
      publishedAt: body.publishedAt ? new Date(body.publishedAt) : undefined,
    });
  }

  @Delete("terms/:id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "약관 비활성화 (소프트 삭제)" })
  deleteTerms(@Param("id") id: string) {
    return this.service.deleteTerms(id);
  }

  // ==================== 앱 버전 ====================

  @Get("versions")
  @Public()
  @ApiOperation({ summary: "앱 버전 목록 조회" })
  getVersions() {
    return this.service.getVersions();
  }

  /**
   * 앱 cold start 시 호출되는 최신 버전 통합 정보.
   * `AppVersionService.fetchLatestVersionInfo()` (teamplus-app) 의 호출 대상.
   * 미로그인 상태(앱 최초 진입)에서도 호출되므로 @Public() 처리.
   */
  @Get("versions/latest")
  @Public()
  @ApiOperation({ summary: "최신 앱 버전 정보 (iOS/Android 통합)" })
  getLatestVersion() {
    return this.service.getLatestVersion();
  }

  @Post("versions")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "앱 버전 등록" })
  createVersion(
    @Body()
    body: {
      platform: string;
      version: string;
      minVersion: string;
      forceUpdate?: boolean;
      releaseNotes?: string;
      storeUrl?: string;
      isActive?: boolean;
    },
  ) {
    return this.service.createVersion(body);
  }

  // ==================== 프리미엄 이벤트 ====================

  @Get("premium-events")
  @Public()
  @ApiOperation({ summary: "프리미엄 이벤트 목록 조회" })
  @ApiQuery({ name: "isActive", required: false, type: Boolean })
  getPremiumEvents(@Query("isActive") isActive?: string) {
    return this.service.getPremiumEvents(isActive);
  }

  @Get("premium-events/featured")
  @Public()
  @ApiOperation({ summary: "노출 중 프리미엄 이벤트 1건 조회" })
  getFeaturedPremiumEvent() {
    return this.service.getFeaturedPremiumEvent();
  }

  @Post("premium-events")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "프리미엄 이벤트 생성" })
  createPremiumEvent(
    @Body()
    body: {
      title: string;
      subtitle?: string;
      description: string;
      eventDate: string;
      venueName: string;
      venueAddress?: string;
      benefits?: string[];
      ctaLabel?: string;
      ctaUrl?: string;
      imageUrl?: string;
      isActive?: boolean;
      sortOrder?: number;
      startAt?: string;
      endAt?: string;
    },
  ) {
    return this.service.createPremiumEvent({
      ...body,
      eventDate: new Date(body.eventDate),
      startAt: body.startAt ? new Date(body.startAt) : undefined,
      endAt: body.endAt ? new Date(body.endAt) : undefined,
    });
  }

  @Put("premium-events/:id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  @ApiOperation({ summary: "프리미엄 이벤트 수정" })
  updatePremiumEvent(
    @Param("id") id: string,
    @Body()
    body: {
      title?: string;
      subtitle?: string;
      description?: string;
      eventDate?: string;
      venueName?: string;
      venueAddress?: string;
      benefits?: string[];
      ctaLabel?: string;
      ctaUrl?: string;
      imageUrl?: string;
      isActive?: boolean;
      sortOrder?: number;
      startAt?: string;
      endAt?: string;
    },
  ) {
    return this.service.updatePremiumEvent(id, {
      ...body,
      eventDate: body.eventDate ? new Date(body.eventDate) : undefined,
      startAt: body.startAt ? new Date(body.startAt) : undefined,
      endAt: body.endAt ? new Date(body.endAt) : undefined,
    });
  }

  @Delete("premium-events/:id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "프리미엄 이벤트 비활성화" })
  deletePremiumEvent(@Param("id") id: string) {
    return this.service.deletePremiumEvent(id);
  }

  // ==================== 앱 설정 ====================

  @Get("settings")
  @Public()
  @ApiOperation({
    summary: "앱 설정 조회 (공개 - 점검 모드, 버전 정보 등 포함)",
  })
  getSettings() {
    return this.service.getAppSettings();
  }

  @Get("maintenance-notice")
  @Public()
  @ApiOperation({
    summary: "현재 활성 시스템 점검 공지 조회 (앱 진입 차단용 · 공개)",
    description:
      "점검 공지(targetType=maintenance)가 '서버 현재 시각' 기준으로 활성이면 제목·내용·기간을 반환합니다. 점검 여부 판정은 서버 시각으로 수행하므로 디바이스 시각과 무관합니다. 활성 공지가 없으면 maintenance=null. serverTime(ISO8601/UTC)은 앱이 예상완료·점검기간을 단말 시계가 아닌 서버 시각 기준으로 표시하기 위한 현재 서버 시각입니다.",
  })
  async getMaintenanceNotice() {
    const notice = await this.service.getActiveMaintenanceNotice();
    const base = {
      maintenance: notice,
      // serverTime: 앱 표시 판정용 '서버 현재 시각'(단말 시계 오차·조작과 무관).
      serverTime: new Date().toISOString(),
    };
    if (!notice) return base;
    // 고객센터 안내(전화·운영시간)를 서버/관리자 설정값으로 동적 제공 — 앱 하드코딩 제거.
    const settings = await this.service.getAppSettings();
    return {
      ...base,
      customerCenter: {
        phone: settings.supportPhone ?? null,
        hours: settings.supportHours ?? null,
      },
    };
  }

  @Put("settings")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  @ApiOperation({ summary: "앱 설정 전체 저장 (어드민 전용)" })
  putSettings(
    @Body() dto: UpdateAppSettingsDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.service.updateAppSettings(dto, req.user.id);
  }

  @Patch("settings")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  @ApiOperation({ summary: "앱 설정 부분 수정 (어드민 전용)" })
  patchSettings(
    @Body() dto: UpdateAppSettingsDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.service.updateAppSettings(dto, req.user.id);
  }
}
