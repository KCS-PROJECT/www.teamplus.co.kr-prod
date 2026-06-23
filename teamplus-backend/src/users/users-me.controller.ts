import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  BadRequestException,
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
  HttpCode,
  HttpStatus,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from "@nestjs/swagger";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "@/prisma/prisma.service";
import { UsersService } from "./users.service";
import { DataExportService } from "./data-export.service";
import { TermsConsentService } from "./terms-consent.service";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
import { UpdateMyProfileDto } from "./dto/update-my-profile.dto";
import { ChangeMyPasswordDto } from "./dto/change-my-password.dto";

@ApiTags("Users - Me")
@Controller("api/v1/users/me")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
export class UsersMeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly dataExportService: DataExportService,
    private readonly termsConsentService: TermsConsentService,
  ) {}

  /**
   * 약관 재동의 필요 여부 조회 (L-02 — 2026-05-21 신규)
   *
   * Web/App 진입 시 호출하여 requiresReconsent=true 면 재동의 모달 표시.
   * 운영 AppSettings.termsVersion · privacyVersion 과 User 동의 버전을 비교.
   */
  @Get("terms-status")
  @ApiOperation({
    summary: "약관 재동의 필요 여부 조회 (L-02)",
    description:
      "AppSettings 운영 약관/개인정보 버전과 User 동의 버전을 비교. 변경 발생 시 재동의 모달 표시 가드용.",
  })
  @ApiResponse({
    status: 200,
    description:
      "{ requiresReconsent: boolean, reasons: ['TERMS_OUTDATED'|...], current, agreed }",
  })
  async getTermsStatus(@Request() req: AuthenticatedRequest) {
    return this.termsConsentService.getStatus(req.user.id);
  }

  /**
   * 약관 재동의 처리 (L-02 — 2026-05-21 신규)
   */
  @Post("terms-consent")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "약관 재동의 처리 (L-02)",
    description:
      "현재 운영 버전을 User.agreedTermsVersion / agreedPrivacyVersion / agreedAt 에 저장.",
  })
  async acceptTerms(@Request() req: AuthenticatedRequest) {
    return this.termsConsentService.accept(req.user.id);
  }

  /**
   * 프로필 수정 (이름, 전화번호)
   */
  @Put("profile")
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
    summary: "프로필 수정",
    description: "로그인한 사용자의 이름, 전화번호를 수정합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "프로필 수정 성공",
    schema: {
      example: {
        id: "user-uuid",
        firstName: "길동",
        lastName: "홍",
        email: "user@example.com",
        phone: "010-1234-5678",
        userType: "PARENT",
        updatedAt: "2026-03-19T10:00:00Z",
      },
    },
  })
  @ApiResponse({ status: 400, description: "잘못된 요청" })
  @ApiResponse({ status: 404, description: "사용자를 찾을 수 없습니다." })
  async updateMyProfile(
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdateMyProfileDto,
  ) {
    return this.usersService.updateMyProfile(req.user.id, dto);
  }

  /**
   * 부모 → 자녀 프로필 사진 변경
   *
   * 자녀(CHILD)가 직접 로그인할 수 없거나 어린 경우 부모가 프로필 사진을 변경.
   * 권한 검증은 service 의 ParentChild 관계로 처리.
   *
   * 이전 아바타 파일은 자동 정리됨 (자녀가 자주 바꾸는 시나리오 디스크 누적 방지).
   *
   * Body: `{ avatarUrl: string }` — 빈 문자열이면 아바타 제거.
   * `POST /files/upload?category=AVATAR&refType=user_avatar&refId=<childId>` 결과 url 을 그대로 전달.
   */
  @Put("children/:childId/avatar")
  @Roles("PARENT", "ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "자녀 프로필 사진 변경 (부모)",
    description:
      "본인 자녀의 프로필 사진(User.avatarUrl)을 변경합니다. ParentChild 관계가 없으면 404. 이전 파일은 자동 정리됩니다.",
  })
  @ApiResponse({ status: 200, description: "자녀 아바타 변경 성공" })
  @ApiResponse({ status: 400, description: "잘못된 avatarUrl 형식" })
  @ApiResponse({
    status: 404,
    description: "본인 자녀가 아니거나 사용자를 찾을 수 없음",
  })
  async updateChildAvatar(
    @Request() req: AuthenticatedRequest,
    @Param("childId") childId: string,
    @Body() body: { avatarUrl?: string },
  ) {
    const avatarUrl = body?.avatarUrl;
    if (avatarUrl !== undefined && avatarUrl !== "") {
      // /uploads/ 또는 http(s) 만 허용 (UpdateMyProfileDto 정규식과 동일)
      if (!/^(\/uploads\/|https?:\/\/)/.test(avatarUrl)) {
        throw new BadRequestException(
          "아바타 URL은 /uploads/ 경로 또는 http(s) URL이어야 합니다.",
        );
      }
      if (avatarUrl.length > 500) {
        throw new BadRequestException("아바타 URL이 너무 깁니다.");
      }
    }
    return this.usersService.updateChildAvatar(
      req.user.id,
      childId,
      avatarUrl ?? "",
    );
  }

  /**
   * 비밀번호 변경 (현재 비밀번호 확인 + 새 비밀번호)
   */
  @Put("password")
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
    summary: "비밀번호 변경",
    description: "현재 비밀번호를 확인한 후 새 비밀번호로 변경합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "비밀번호 변경 성공",
    schema: {
      example: { message: "비밀번호가 변경되었습니다." },
    },
  })
  @ApiResponse({
    status: 400,
    description: "현재 비밀번호 불일치 또는 유효성 검사 실패",
  })
  @ApiResponse({ status: 404, description: "사용자를 찾을 수 없습니다." })
  async changeMyPassword(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ChangeMyPasswordDto,
  ) {
    return this.usersService.changeMyPassword(
      req.user.id,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  /**
   * 내 보호자(학부모) 정보 조회 — CHILD/TEEN 본인이 자신의 학부모 목록을 조회.
   * [2026-05-15] 학생 홈 Hero 카드에 "학부모: 이름/이메일" 표시용.
   */
  @Get("parents")
  @Roles("CHILD", "TEEN", "ADMIN")
  @ApiOperation({
    summary: "내 보호자(학부모) 정보 조회",
    description:
      "로그인한 아동/청소년의 연결된 보호자(학부모) 목록을 반환합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "보호자 목록 조회 성공",
    schema: {
      example: {
        parents: [
          {
            id: "user-uuid",
            name: "홍길동",
            email: "parent@example.com",
            phone: "010-1234-5678",
            relationship: "parent",
            isPrimary: true,
          },
        ],
      },
    },
  })
  async getMyParents(@Request() req: AuthenticatedRequest) {
    const userId = req.user.id;
    const links = await this.prisma.parentChild.findMany({
      where: { childId: userId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: {
        relationship: true,
        isPrimary: true,
        parent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    const parents = links.map((l) => ({
      id: l.parent.id,
      name: `${l.parent.lastName ?? ""}${l.parent.firstName ?? ""}`.trim(),
      email: l.parent.email,
      phone: l.parent.phone,
      relationship: l.relationship,
      isPrimary: l.isPrimary,
    }));

    return { parents };
  }

  /**
   * 내 뱃지 목록 조회 (아동/청소년)
   */
  @Get("badges")
  @Roles("CHILD", "TEEN", "ADMIN")
  @ApiOperation({
    summary: "내 뱃지 목록 조회",
    description:
      "로그인한 아동/청소년이 획득한 뱃지 목록과 총 개수를 반환합니다.",
  })
  @ApiResponse({ status: 200, description: "뱃지 목록 조회 성공" })
  async getMyBadges(@Request() req: AuthenticatedRequest) {
    const userId = req.user.id;

    const childBadges = await this.prisma.childBadge.findMany({
      where: { childId: userId },
      orderBy: [
        { isDisplayed: "desc" },
        { displayOrder: "asc" },
        { earnedAt: "desc" },
      ],
      select: {
        id: true,
        earnedAt: true,
        earnedReason: true,
        isDisplayed: true,
        displayOrder: true,
        badge: {
          select: {
            id: true,
            name: true,
            description: true,
            iconUrl: true,
            category: true,
            rarity: true,
            pointValue: true,
          },
        },
      },
    });

    const mapped = childBadges.map((cb) => ({
      id: cb.id,
      badgeId: cb.badge.id,
      name: cb.badge.name,
      description: cb.badge.description,
      iconUrl: cb.badge.iconUrl,
      category: cb.badge.category,
      rarity: cb.badge.rarity,
      pointValue: cb.badge.pointValue,
      earnedAt: cb.earnedAt,
      earnedReason: cb.earnedReason,
      isDisplayed: cb.isDisplayed,
    }));

    return {
      badgeCount: mapped.length,
      badges: mapped,
    };
  }

  /**
   * 내 클럽 내 랭킹 조회 (아동/청소년)
   * 출석 횟수 기준으로 클럽 내 순위 계산
   */
  @Get("ranking")
  @Roles("CHILD", "TEEN", "ADMIN")
  @ApiOperation({
    summary: "클럽 내 내 랭킹 조회",
    description: "클럽 내 출석 횟수 기준 순위를 반환합니다.",
  })
  @ApiQuery({
    name: "teamId",
    required: false,
    description: "특정 클럽 ID (기본: 첫 번째 클럽)",
  })
  @ApiResponse({ status: 200, description: "랭킹 조회 성공" })
  async getMyRanking(
    @Request() req: AuthenticatedRequest,
    @Query("teamId") teamId?: string,
  ) {
    const userId = req.user.id;

    // 내가 속한 클럽 찾기
    let targetTeamId = teamId;
    if (!targetTeamId) {
      const membership = await this.prisma.teamMember.findFirst({
        where: { userId, approvalStatus: "approved" },
        select: { teamId: true },
        orderBy: { joinedAt: "asc" },
      });
      if (!membership) {
        return { currentRank: 0, totalUsers: 0, score: 0, teamId: null };
      }
      targetTeamId = membership.teamId;
    }

    // 최근 30일 기준 출석 횟수로 랭킹 계산
    const since = new Date();
    since.setDate(since.getDate() - 30);

    // 클럽의 모든 승인된 멤버 목록
    const clubMembers = await this.prisma.teamMember.findMany({
      where: { teamId: targetTeamId, approvalStatus: "approved" },
      select: { userId: true },
    });

    const memberIds = clubMembers.map((m) => m.userId);
    if (!memberIds.length) {
      return { currentRank: 0, totalUsers: 0, score: 0, teamId: targetTeamId };
    }

    // 각 멤버의 출석 횟수 집계
    const attendanceCounts = await this.prisma.classAttendance.groupBy({
      by: ["memberId"],
      where: {
        memberId: { in: memberIds },
        attendanceStatus: "present",
        checkedInAt: { gte: since },
      },
      _count: { id: true },
    });

    // 점수 맵 생성
    const scoreMap = new Map<string, number>();
    for (const m of memberIds) {
      scoreMap.set(m, 0);
    }
    for (const row of attendanceCounts) {
      scoreMap.set(row.memberId, row._count.id);
    }

    // 점수 내림차순 정렬 → 내 순위 계산
    const sorted = Array.from(scoreMap.entries()).sort((a, b) => b[1] - a[1]);
    const myIndex = sorted.findIndex(([id]) => id === userId);
    const myScore = scoreMap.get(userId) ?? 0;

    return {
      currentRank: myIndex >= 0 ? myIndex + 1 : 0,
      totalUsers: memberIds.length,
      score: myScore,
      teamId: targetTeamId,
      // 상위 3명 미리보기 (teen 홈 화면용)
      topRankers: sorted.slice(0, 3).map(([id, score], i) => ({
        rank: i + 1,
        userId: id,
        score,
      })),
    };
  }

  /**
   * 이번달 출석률 조회
   */
  @Get("attendance-rate")
  @Roles("CHILD", "TEEN", "PARENT", "ADMIN")
  @ApiOperation({
    summary: "출석률 조회",
    description: "이번달 출석률 및 출석 횟수를 반환합니다.",
  })
  @ApiQuery({
    name: "period",
    required: false,
    description: "조회 기간 (month|all, 기본: month)",
  })
  @ApiResponse({ status: 200, description: "출석률 조회 성공" })
  async getAttendanceRate(
    @Request() req: AuthenticatedRequest,
    @Query("period") period: string = "month",
  ) {
    const userId = req.user.id;

    let since: Date | undefined;
    if (period === "month") {
      since = new Date();
      since.setDate(1);
      since.setHours(0, 0, 0, 0);
    }

    const [totalCount, attendedCount] = await Promise.all([
      this.prisma.classAttendance.count({
        where: {
          memberId: userId,
          ...(since ? { createdAt: { gte: since } } : {}),
        },
      }),
      this.prisma.classAttendance.count({
        where: {
          memberId: userId,
          attendanceStatus: "present",
          ...(since ? { createdAt: { gte: since } } : {}),
        },
      }),
    ]);

    const rate =
      totalCount > 0 ? Math.round((attendedCount / totalCount) * 100) : 0;

    return {
      rate,
      attendedCount,
      totalCount,
      period: period === "month" ? "month" : "all",
    };
  }

  /**
   * 내 로그인 기록 조회 (AuditLog)
   */
  @Get("login-history")
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
    summary: "내 로그인 기록",
    description:
      "본인의 최근 로그인 기록(성공/실패)을 최신 순으로 조회합니다. limit 기본 20, 최대 100.",
  })
  @ApiQuery({ name: "limit", required: false, type: Number })
  async getMyLoginHistory(
    @Request() req: AuthenticatedRequest,
    @Query("limit") limitParam?: string,
  ) {
    const userId: string = req.user.id;
    const parsed = limitParam ? parseInt(limitParam, 10) : 20;
    const limit = Math.max(1, Math.min(100, isNaN(parsed) ? 20 : parsed));

    const logs = await this.prisma.auditLog.findMany({
      where: {
        userId,
        action: { in: ["login_success", "login_failed"] },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        action: true,
        resource: true,
        ipAddress: true,
        newValue: true,
        createdAt: true,
      },
    });

    const entries = logs.map((log) => {
      const meta = (log.newValue ?? {}) as Record<string, unknown>;
      return {
        id: log.id,
        action: log.action,
        success: log.action === "login_success",
        ipAddress: log.ipAddress,
        userAgent: typeof meta.userAgent === "string" ? meta.userAgent : null,
        reason: typeof meta.reason === "string" ? meta.reason : null,
        createdAt: log.createdAt,
      };
    });

    return { entries, count: entries.length };
  }

  /**
   * 내 디바이스 목록 조회 (UserDevice)
   * 보안상 fcmToken은 앞 8글자만 마스킹 반환
   */
  @Get("devices")
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
    summary: "내 디바이스 목록",
    description: "현재 활성화된 내 디바이스(푸시 토큰) 목록을 조회합니다.",
  })
  async getMyDevices(@Request() req: AuthenticatedRequest) {
    const userId: string = req.user.id;
    const devices = await this.prisma.userDevice.findMany({
      where: { userId, isActive: true },
      orderBy: { lastSeenAt: "desc" },
      select: {
        id: true,
        platform: true,
        deviceModel: true,
        osVersion: true,
        appVersion: true,
        lastSeenAt: true,
        createdAt: true,
        fcmToken: true,
      },
    });

    return {
      devices: devices.map((d) => ({
        id: d.id,
        platform: d.platform,
        deviceModel: d.deviceModel,
        osVersion: d.osVersion,
        appVersion: d.appVersion,
        lastSeenAt: d.lastSeenAt,
        createdAt: d.createdAt,
        // 전체 fcmToken 노출 금지 — 앞 8자만
        tokenPreview: d.fcmToken ? d.fcmToken.substring(0, 8) : null,
      })),
      count: devices.length,
    };
  }

  /**
   * 디바이스(FCM 토큰) 등록/갱신 (upsert)
   *
   * Flutter 앱이 부팅 시 또는 토큰 갱신 시(`onTokenRefresh`) 호출.
   * 동일 (userId, fcmToken) 쌍은 중복 생성하지 않고 lastSeenAt + isActive=true 로 갱신한다.
   *
   * Body:
   *   - fcmToken: FCM registration token (필수)
   *   - platform: "ios" | "android" (필수)
   *   - deviceModel?, osVersion?, appVersion? (선택)
   */
  @Post("devices")
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
    summary: "내 디바이스 등록/갱신",
    description:
      "FCM 푸시 토큰을 등록하거나 갱신합니다. 동일 토큰은 lastSeenAt 만 갱신됩니다.",
  })
  @ApiResponse({
    status: 200,
    description: "등록/갱신 성공",
    schema: {
      example: {
        success: true,
        deviceId: "ckxxx...",
        upserted: "created",
      },
    },
  })
  async registerDevice(
    @Request() req: AuthenticatedRequest,
    @Body()
    body: {
      fcmToken: string;
      platform: string;
      deviceId?: string;
      deviceModel?: string;
      osVersion?: string;
      appVersion?: string;
    },
  ) {
    const userId: string = req.user.id;

    if (!body?.fcmToken || typeof body.fcmToken !== "string") {
      return { success: false, message: "fcmToken은 필수입니다." };
    }
    const platform = (body.platform || "").toLowerCase();
    if (platform !== "ios" && platform !== "android") {
      return {
        success: false,
        message: "platform 은 'ios' 또는 'android' 여야 합니다.",
      };
    }

    // 앱 발급 안정적 디바이스 식별자(선택). 빈 문자열은 null 로 정규화.
    // 구버전 앱은 미전송(null) → fcmToken 기반 fallback 경로.
    const deviceId =
      typeof body.deviceId === "string" && body.deviceId.trim() !== ""
        ? body.deviceId.trim()
        : null;

    const commonData = {
      platform,
      deviceModel: body.deviceModel ?? null,
      osVersion: body.osVersion ?? null,
      appVersion: body.appVersion ?? null,
      isActive: true,
      lastSeenAt: new Date(),
    };

    // one-user-one-device 정책 (트랜잭션 원자성):
    //   (B-token) 같은 fcmToken 을 가진 "다른 사용자"의 active row 비활성화.
    //             같은 물리 디바이스(같은 토큰)가 타 계정에 active 로 남아 발생하는
    //             크로스유저 푸시 누수 차단 — **앱 버전 무관 항상 적용**(deviceId 없어도 동작).
    //   (B-device) deviceId 전송 시 같은 deviceId 의 "다른 사용자" active row 비활성화.
    //             fcmToken 회전(onTokenRefresh)으로 토큰이 바뀌어도 기기 정체성 유지.
    //   (upsert)  deviceId 있으면 (userId,deviceId), 없으면 (userId,fcmToken) 키로 upsert.
    //   (A)       같은 사용자의 "다른 디바이스" active row 비활성화 → user 당 active 1개 수렴.
    const device = await this.prisma.$transaction(async (tx) => {
      // deviceId 경로: 같은 user 가 이 fcmToken 을 다른 deviceId/NULL 로 가진 stale row 는
      //   (userId,fcmToken) 유니크 충돌을 일으키므로 제거(토큰을 이 deviceId 로 이전).
      if (deviceId) {
        await tx.userDevice.deleteMany({
          where: {
            userId,
            fcmToken: body.fcmToken,
            OR: [{ deviceId: { not: deviceId } }, { deviceId: null }],
          },
        });
      }

      // (B-token) 다른 사용자의 같은 fcmToken active → 비활성화(이력 보존).
      await tx.userDevice.updateMany({
        where: {
          fcmToken: body.fcmToken,
          userId: { not: userId },
          isActive: true,
        },
        data: { isActive: false },
      });

      // (B-device) 다른 사용자의 같은 deviceId active → 비활성화.
      if (deviceId) {
        await tx.userDevice.updateMany({
          where: { deviceId, userId: { not: userId }, isActive: true },
          data: { isActive: false },
        });
      }

      // (upsert) deviceId 우선 키, 없으면 fcmToken 키(하위호환).
      let existed: boolean;
      let upserted: { id: string };
      if (deviceId) {
        const prev = await tx.userDevice.findUnique({
          where: { userId_deviceId: { userId, deviceId } },
          select: { id: true },
        });
        existed = prev !== null;
        upserted = await tx.userDevice.upsert({
          where: { userId_deviceId: { userId, deviceId } },
          update: { fcmToken: body.fcmToken, ...commonData },
          create: { userId, deviceId, fcmToken: body.fcmToken, ...commonData },
          select: { id: true },
        });
      } else {
        const prev = await tx.userDevice.findUnique({
          where: { userId_fcmToken: { userId, fcmToken: body.fcmToken } },
          select: { id: true },
        });
        existed = prev !== null;
        upserted = await tx.userDevice.upsert({
          where: { userId_fcmToken: { userId, fcmToken: body.fcmToken } },
          update: { ...commonData },
          create: { userId, fcmToken: body.fcmToken, ...commonData },
          select: { id: true },
        });
      }

      // (A) 방금 등록/갱신한 디바이스를 제외한 같은 사용자의 다른 활성 디바이스 비활성화.
      await tx.userDevice.updateMany({
        where: { userId, id: { not: upserted.id }, isActive: true },
        data: { isActive: false },
      });

      return { id: upserted.id, existed };
    });

    return {
      success: true,
      deviceId: device.id,
      upserted: device.existed ? "updated" : "created",
    };
  }

  /**
   * 특정 디바이스 로그아웃 (soft delete)
   * 본인의 디바이스만 삭제 가능
   */
  @Delete("devices/:deviceId")
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
    summary: "디바이스 로그아웃",
    description:
      "특정 디바이스의 푸시 토큰을 비활성화합니다. (soft delete, 본인 소유만 가능)",
  })
  async logoutDevice(
    @Request() req: AuthenticatedRequest,
    @Param("deviceId") deviceId: string,
  ) {
    const userId: string = req.user.id;

    // 1) 서버 발급 cuid(구버전 앱: 응답의 deviceId=UserDevice.id)로 우선 조회.
    const byId = await this.prisma.userDevice.findUnique({
      where: { id: deviceId },
      select: { id: true, userId: true },
    });
    if (byId) {
      if (byId.userId !== userId) {
        return { success: false, message: "디바이스를 찾을 수 없습니다." };
      }
      await this.prisma.userDevice.update({
        where: { id: deviceId },
        data: { isActive: false },
      });
      return { success: true, id: deviceId };
    }

    // 2) 앱 안정 deviceId(신버전 앱)로 간주하여 (userId, deviceId) 비활성화(멱등).
    const res = await this.prisma.userDevice.updateMany({
      where: { userId, deviceId, isActive: true },
      data: { isActive: false },
    });
    if (res.count === 0) {
      return { success: false, message: "디바이스를 찾을 수 없습니다." };
    }
    return { success: true, id: deviceId };
  }

  // ==================== Sprint 6: 내 QR ====================

  /**
   * 내 프로필 QR 토큰 발급
   * - JWT 서명, 15분 TTL
   * - type='profile_qr' payload로 일반 access token과 구분
   */
  @Get("qr-token")
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
    summary: "내 프로필 QR 토큰 발급",
    description: "15분 유효한 프로필 QR 토큰을 발급합니다.",
  })
  async getMyQrToken(@Request() req: AuthenticatedRequest) {
    const userId: string = req.user.id;
    const expiresIn = 15 * 60; // 15분
    const token = await this.jwtService.signAsync(
      { sub: userId, type: "profile_qr" },
      { expiresIn },
    );
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    return { token, expiresAt, ttl: expiresIn };
  }

  /**
   * QR 토큰 검증 및 공개 프로필 반환
   * - 스캐너가 호출 (로그인 사용자만)
   * - 공개 필드만 반환: 이름, 역할, 프로필 이미지
   */
  @Get("qr-token/verify")
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
    summary: "QR 토큰 검증",
    description: "스캔한 QR 토큰을 검증하고 공개 프로필을 반환합니다.",
  })
  @ApiQuery({ name: "token", required: true })
  async verifyMyQrToken(@Query("token") token?: string) {
    if (!token) {
      return { success: false, message: "토큰이 없습니다." };
    }
    try {
      const decoded = await this.jwtService.verifyAsync<{
        sub: string;
        type: string;
      }>(token);
      if (decoded.type !== "profile_qr") {
        return { success: false, message: "유효하지 않은 QR 토큰입니다." };
      }
      const user = await this.prisma.user.findUnique({
        where: { id: decoded.sub },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          userType: true,
          avatarUrl: true,
        },
      });
      if (!user) {
        return { success: false, message: "사용자를 찾을 수 없습니다." };
      }
      return {
        success: true,
        profile: {
          id: user.id,
          name: `${user.lastName}${user.firstName}`,
          userType: user.userType,
          avatarUrl: user.avatarUrl,
        },
      };
    } catch {
      return { success: false, message: "만료되었거나 잘못된 QR 토큰입니다." };
    }
  }

  // ==================== PIPA §35 개인정보 다운로드 ====================

  /**
   * 개인정보 내보내기 요청 (30일 1회 제한)
   */
  @Post("data-export")
  @Roles(
    "PARENT",
    "COACH",
    "CHILD",
    "ADMIN",
    "TEEN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
  )
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: "개인정보 내보내기 요청",
    description:
      "PIPA §35 기반 개인정보 열람 요청. 30일에 1회 가능. 처리 완료 후 7일간 다운로드 가능.",
  })
  @ApiResponse({
    status: 202,
    description: "요청 접수 (비동기 처리 중)",
    schema: {
      example: {
        id: "req-id",
        status: "processing",
        expiresAt: "2026-04-25T00:00:00.000Z",
      },
    },
  })
  @ApiResponse({ status: 400, description: "30일 내 중복 요청" })
  async requestDataExport(@Request() req: AuthenticatedRequest) {
    return this.dataExportService.requestExport(req.user.id);
  }

  /**
   * 개인정보 내보내기 상태 조회
   */
  @Get("data-export/status")
  @Roles(
    "PARENT",
    "COACH",
    "CHILD",
    "ADMIN",
    "TEEN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
  )
  @ApiOperation({ summary: "개인정보 내보내기 상태 조회" })
  @ApiResponse({ status: 200, description: "상태 조회 성공" })
  async getDataExportStatus(@Request() req: AuthenticatedRequest) {
    return this.dataExportService.getLatestStatus(req.user.id);
  }

  /**
   * 개인정보 JSON 다운로드 (ready 상태 + 7일 유효)
   */
  @Get("data-export/:requestId/download")
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
    summary: "개인정보 JSON 다운로드",
    description: "status=ready 요청의 개인정보를 JSON 파일로 다운로드합니다.",
  })
  @ApiResponse({ status: 200, description: "JSON 파일 다운로드" })
  @ApiResponse({ status: 400, description: "준비 미완료 또는 만료" })
  @ApiResponse({ status: 403, description: "본인 요청만 다운로드 가능" })
  async downloadDataExport(
    @Request() req: AuthenticatedRequest,
    @Param("requestId") requestId: string,
    @Res() res: Response,
  ) {
    const data = await this.dataExportService.downloadExport(
      req.user.id,
      requestId,
    );
    const json = JSON.stringify(data, null, 2);
    const filename = `teamplus_personal_data_${req.user.id}_${Date.now()}.json`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", Buffer.byteLength(json, "utf8").toString());
    res.send(json);
  }

  /**
   * 내 수상 포트폴리오 조회 (C-4 수상 이력)
   * GET /api/v1/users/me/portfolio?teamId=
   */
  @Get("portfolio")
  @Roles(
    "PARENT",
    "TEEN",
    "CHILD",
    "COACH",
    "ADMIN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
  )
  @ApiOperation({
    summary: "내 선수 포트폴리오 (수업 이력 + 수상 기록)",
    description:
      "teamId 미지정 시 가장 최근 승인된 클럽 멤버십을 기준으로 조회합니다.",
  })
  @ApiQuery({ name: "teamId", required: false, description: "특정 클럽 ID" })
  @ApiResponse({ status: 200, description: "포트폴리오 조회 성공" })
  @ApiResponse({ status: 404, description: "승인된 클럽 멤버십이 없습니다." })
  async getMyPortfolio(
    @Request() req: AuthenticatedRequest,
    @Query("teamId") teamId?: string,
  ) {
    const where: { userId: string; approvalStatus: string; teamId?: string } = {
      userId: req.user.id,
      approvalStatus: "approved",
    };
    if (teamId) where.teamId = teamId;

    const member = await this.prisma.teamMember.findFirst({
      where,
      select: {
        id: true,
        team: { select: { id: true, name: true } },
      },
      orderBy: { joinedAt: "desc" },
    });

    if (!member) {
      return {
        memberId: null,
        club: null,
        classHistories: [],
        playerAwards: [],
      };
    }

    const [classHistories, playerAwards] = await Promise.all([
      this.prisma.playerClassHistory.findMany({
        where: { memberId: member.id },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          totalSessions: true,
          attendedSessions: true,
          attendanceRate: true,
          status: true,
          finalScore: true,
          certificateUrl: true,
          coachComment: true,
          class: { select: { id: true, className: true, levelRequired: true } },
        },
        orderBy: { startDate: "desc" },
      }),
      this.prisma.playerAward.findMany({
        where: { memberId: member.id, isDisplayed: true },
        select: {
          id: true,
          awardName: true,
          awardType: true,
          awardedAt: true,
          season: true,
          description: true,
          certificateUrl: true,
          imageUrl: true,
          displayOrder: true,
          tournament: { select: { id: true, name: true } },
        },
        orderBy: [{ displayOrder: "asc" }, { awardedAt: "desc" }],
      }),
    ]);

    return {
      memberId: member.id,
      team: { id: member.team.id, name: member.team.name },
      classHistories,
      playerAwards,
    };
  }
}
