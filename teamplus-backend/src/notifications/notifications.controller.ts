import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Controller,
  Get,
  Patch,
  Delete,
  Post,
  Param,
  Query,
  Body,
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
import { Throttle } from "@nestjs/throttler";
import { NotificationsService } from "./notifications.service";
import { AdminPushDto } from "./dto/admin-push.dto";
import { SendTeamPushDto } from "./dto/send-team-push.dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

@ApiTags("Notifications")
@Controller("api/v1/notifications")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // ─── 정적 GET 라우트 (동적 :notificationId 보다 먼저 선언 필수) ───

  /**
   * 사용자 알림 목록 조회
   */
  @Get()
  @Roles(
    "PARENT",
    "COACH",
    "CHILD",
    "ADMIN",
    "TEEN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
  )
  @ApiOperation({
    summary: "알림 목록 조회",
    description: "사용자의 알림 목록을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "알림 목록 조회 성공",
    schema: {
      example: [
        {
          id: "notification-uuid",
          notificationType: "payment_success",
          title: "결제 완료",
          message: "₩240,000를 결제하셨습니다.",
          isRead: false,
          createdAt: "2026-01-04T10:00:00Z",
        },
      ],
    },
  })
  async getUserNotifications(
    @Request() req: AuthenticatedRequest,
    @Query("limit") limit?: string,
    @Query("skip") skip?: string,
    @Query("types") types?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    const parsedSkip = skip ? parseInt(skip, 10) : 0;
    const typesArray = types
      ? types.split(",").map((t) => t.trim()).filter(Boolean)
      : undefined;
    return this.notificationsService.getUserNotifications(
      req.user.id,
      parsedLimit,
      parsedSkip,
      typesArray,
    );
  }

  /**
   * 읽지 않은 알림 개수 조회
   */
  @Get("stats/unread")
  @Roles(
    "PARENT",
    "COACH",
    "CHILD",
    "ADMIN",
    "TEEN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
  )
  @ApiOperation({
    summary: "읽지 않은 알림 개수",
    description: "사용자의 읽지 않은 알림 개수를 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "조회 성공",
    schema: {
      example: {
        unreadCount: 5,
      },
    },
  })
  async getUnreadCount(@Request() req: AuthenticatedRequest) {
    return this.notificationsService.getUnreadCount(req.user.id);
  }

  /**
   * notificationType 별 전체/미읽음 카운트 조회 — 탭 뱃지 및 카테고리 통계용
   */
  @Get("stats/by-type")
  @Roles(
    "PARENT",
    "COACH",
    "CHILD",
    "ADMIN",
    "TEEN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
  )
  @ApiOperation({
    summary: "타입별 알림 카운트",
    description:
      "사용자의 알림을 notificationType 별로 그룹화하여 전체/미읽음 카운트를 반환합니다. 프론트엔드에서 카테고리로 집계.",
  })
  @ApiResponse({
    status: 200,
    description: "조회 성공",
    schema: {
      example: {
        byType: {
          payment_success: { total: 5, unread: 2 },
          class_reminder: { total: 3, unread: 0 },
        },
      },
    },
  })
  async getStatsByType(@Request() req: AuthenticatedRequest) {
    return this.notificationsService.getStatsByType(req.user.id);
  }

  /**
   * 내 알림 수신 설정 조회
   */
  @Get("preferences/me")
  @Roles(
    "PARENT",
    "COACH",
    "CHILD",
    "ADMIN",
    "TEEN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
  )
  @ApiOperation({
    summary: "내 알림 설정 조회",
    description:
      "사용자의 알림 수신 설정을 조회합니다. 최초 호출 시 기본값으로 생성됩니다.",
  })
  async getMyNotificationPreference(@Request() req: AuthenticatedRequest) {
    return this.notificationsService.getMyNotificationPreference(req.user.id);
  }

  /**
   * 내 알림 수신 설정 수정
   */
  @Patch("preferences/me")
  @Roles(
    "PARENT",
    "COACH",
    "CHILD",
    "ADMIN",
    "TEEN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "내 알림 설정 수정",
    description: "사용자의 알림 수신 설정을 부분 업데이트합니다.",
  })
  async updateMyNotificationPreference(
    @Request() req: AuthenticatedRequest,
    @Body()
    body: {
      pushEnabled?: boolean;
      smsEnabled?: boolean;
      emailEnabled?: boolean;
      soundEnabled?: boolean;
      vibrationEnabled?: boolean;
      quietHoursEnabled?: boolean;
      quietHoursStart?: string | null;
      quietHoursEnd?: string | null;
      categories?: Record<string, boolean>;
    },
  ) {
    return this.notificationsService.updateMyNotificationPreference(
      req.user.id,
      body,
    );
  }

  /**
   * 내 알림 전체 읽음 처리
   */
  @Patch("read-all")
  @Roles(
    "PARENT",
    "COACH",
    "CHILD",
    "ADMIN",
    "TEEN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "내 알림 전체 읽음 처리",
    description: "사용자의 읽지 않은 알림을 모두 읽음 처리합니다.",
  })
  async markAllAsRead(@Request() req: AuthenticatedRequest) {
    return this.notificationsService.markAllAsRead(req.user.id);
  }

  /**
   * 내 알림 전체 삭제
   */
  @Delete("all")
  @Roles(
    "PARENT",
    "COACH",
    "CHILD",
    "ADMIN",
    "TEEN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "내 알림 전체 삭제",
    description: "사용자의 모든 알림을 삭제합니다.",
  })
  async deleteAllNotifications(@Request() req: AuthenticatedRequest) {
    return this.notificationsService.deleteAllNotifications(req.user.id);
  }

  /**
   * 오래된 알림 삭제
   */
  @Delete("old")
  @Roles(
    "PARENT",
    "COACH",
    "CHILD",
    "ADMIN",
    "TEEN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "오래된 알림 삭제",
    description:
      "지정 일수 이전(기본 30일)에 생성된 알림을 삭제합니다. days: 1~365",
  })
  @ApiQuery({ name: "days", required: false, type: Number })
  async deleteOldNotifications(
    @Request() req: AuthenticatedRequest,
    @Query("days") days?: string,
  ) {
    const parsedDays = days ? parseInt(days, 10) : 30;
    return this.notificationsService.deleteOldNotifications(
      req.user.id,
      isNaN(parsedDays) ? 30 : parsedDays,
    );
  }

  /**
   * 알림 통계 (관리자용)
   */
  @Get("admin/stats")
  @Roles("ADMIN")
  @ApiOperation({
    summary: "알림 통계",
    description: "전체 알림 통계를 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "통계 조회 성공",
    schema: {
      example: {
        totalNotifications: 100,
        unreadCount: 25,
        readCount: 75,
        typeStats: {
          payment_success: 30,
          membership_approved: 20,
          class_created: 50,
        },
        alimtalk: {
          sent: 85,
          failed: 5,
          pending: 10,
        },
      },
    },
  })
  async getNotificationStats(@Query("userId") userId?: string) {
    return this.notificationsService.getNotificationStats(userId);
  }

  /**
   * 실패한 알림톡 조회 (관리자용)
   */
  @Get("admin/failed-alimtalks")
  @Roles("ADMIN")
  @ApiOperation({
    summary: "실패한 알림톡 조회",
    description: "실패한 알림톡 목록을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "조회 성공",
  })
  async getFailedAlimtalks(@Query("limit") limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    return this.notificationsService.getFailedAlimtalks(parsedLimit);
  }

  /**
   * 관리자 Push 발송 이력 조회
   * PushNotificationLog 기반 — 날짜 범위, 상태, 검색어 필터 지원
   */
  @Get("admin/push-history")
  @Roles("ADMIN")
  @ApiOperation({
    summary: "Push 발송 이력 조회",
    description:
      "관리자가 발송한 Push 알림 이력을 페이지네이션으로 조회합니다. 날짜 범위, 상태(pending/sent/failed/partial), 제목·본문 검색을 지원합니다.",
  })
  @ApiQuery({
    name: "page",
    required: false,
    type: Number,
    description: "페이지 번호 (기본: 1)",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: "페이지당 항목 수 (기본: 20)",
  })
  @ApiQuery({
    name: "startDate",
    required: false,
    description: "시작일 (YYYY-MM-DD)",
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    description: "종료일 (YYYY-MM-DD)",
  })
  @ApiQuery({
    name: "status",
    required: false,
    description: "발송 상태 필터 (pending | sent | failed | partial)",
  })
  @ApiQuery({
    name: "search",
    required: false,
    description: "제목 또는 본문 검색어",
  })
  @ApiResponse({
    status: 200,
    description: "Push 이력 조회 성공",
    schema: {
      example: {
        data: [
          {
            id: "push-log-uuid",
            title: "공지사항",
            body: "새로운 공지사항이 등록되었습니다.",
            targetType: "all",
            targetValue: null,
            sentBy: "admin-uuid",
            sentAt: "2026-03-07T10:00:00Z",
            totalCount: 150,
            successCount: 148,
            failCount: 2,
            status: "sent",
            createdAt: "2026-03-07T10:00:00Z",
          },
        ],
        pagination: {
          total: 50,
          page: 1,
          limit: 20,
          totalPages: 3,
        },
      },
    },
  })
  async getPushHistory(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("status") status?: string,
    @Query("search") search?: string,
  ) {
    return this.notificationsService.getPushHistory({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      status,
      search,
    });
  }

  // ─── 동적 파라미터 라우트 (정적 라우트 뒤에 선언) ───

  /**
   * 특정 알림 조회
   */
  @Get(":notificationId")
  @Roles(
    "PARENT",
    "COACH",
    "CHILD",
    "ADMIN",
    "TEEN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
  )
  @ApiOperation({
    summary: "알림 상세 조회",
    description: "특정 알림의 상세 정보를 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "알림 조회 성공",
  })
  @ApiResponse({
    status: 404,
    description: "알림을 찾을 수 없습니다.",
  })
  async getNotification(
    @Request() req: AuthenticatedRequest,
    @Param("notificationId") notificationId: string,
  ) {
    return this.notificationsService.getNotification(
      notificationId,
      req.user.id,
    );
  }

  /**
   * 관리자 전체 Push 발송
   */
  @Post("admin/push")
  @Roles("ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "관리자 Push 발송",
    description:
      "전체(all)·역할별(role)·특정 개인(specific, userIds[])에게 FCM Push를 발송합니다. " +
      "광고성 메시지(isMarketing=true)는 야간(KST 21:00~08:00) 발송이 제한됩니다.",
  })
  @ApiResponse({ status: 200, description: "발송 완료" })
  @ApiResponse({ status: 400, description: "야간 광고성 발송 제한" })
  async sendAdminPush(
    @Body() body: AdminPushDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.notificationsService.sendAdminPush(
      body.title,
      body.bodyText,
      body.targetType,
      body.role,
      req.user.id,
      body.isMarketing ?? false,
      body.userIds,
    );
  }

  /**
   * 팀 Push 발송 대상 조회 (코치/감독)
   * — 발송 가능한 멤버/학부모/매니저 목록을 그룹별로 반환.
   */
  @Get("team/:teamId/recipients")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR")
  @ApiOperation({
    summary: "팀 Push 발송 대상 조회",
    description:
      "코치/감독이 자신이 관리하는 팀의 발송 대상(멤버/학부모/매니저)을 그룹별로 조회합니다.",
  })
  @ApiResponse({ status: 200, description: "조회 성공" })
  @ApiResponse({ status: 403, description: "팀 매니저 권한 없음" })
  async getTeamPushRecipients(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
  ) {
    return this.notificationsService.getTeamPushRecipientsForManager(
      req.user.id,
      teamId,
    );
  }

  /**
   * 팀 Push 발송 (코치/감독)
   * — 선택한 회원(멤버/학부모/매니저)에게 인앱 알림 + 푸시 발송.
   */
  @Post("team/:teamId/push")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR")
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 1분에 10회 제한 (발송 남용 방지)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "팀 Push 발송",
    description:
      "코치/감독이 자신이 관리하는 팀의 특정 회원(멤버/학부모/매니저)에게 알림과 푸시를 발송합니다. " +
      "대상은 서버에서 팀 소속 여부를 교차검증합니다.",
  })
  @ApiResponse({ status: 200, description: "발송 완료" })
  @ApiResponse({ status: 403, description: "팀 매니저 권한 없음 또는 대상 불일치" })
  async sendTeamPush(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Body() dto: SendTeamPushDto,
  ) {
    return this.notificationsService.sendTeamPush(req.user.id, teamId, dto);
  }

  /**
   * 알림 읽음 처리
   */
  @Patch(":notificationId/read")
  @Roles(
    "PARENT",
    "COACH",
    "CHILD",
    "ADMIN",
    "TEEN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "알림 읽음 처리",
    description: "알림을 읽음 상태로 변경합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "읽음 처리 성공",
  })
  @ApiResponse({
    status: 400,
    description: "이미 읽은 알림입니다.",
  })
  @ApiResponse({
    status: 404,
    description: "알림을 찾을 수 없습니다.",
  })
  async markAsRead(
    @Request() req: AuthenticatedRequest,
    @Param("notificationId") notificationId: string,
  ) {
    return this.notificationsService.markAsRead(notificationId, req.user.id);
  }

  /**
   * 알림 삭제
   */
  @Delete(":notificationId")
  @Roles(
    "PARENT",
    "COACH",
    "CHILD",
    "ADMIN",
    "TEEN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "알림 삭제",
    description: "알림을 삭제합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "삭제 성공",
  })
  @ApiResponse({
    status: 404,
    description: "알림을 찾을 수 없습니다.",
  })
  async deleteNotification(
    @Request() req: AuthenticatedRequest,
    @Param("notificationId") notificationId: string,
  ) {
    return this.notificationsService.deleteNotification(
      notificationId,
      req.user.id,
    );
  }
}
