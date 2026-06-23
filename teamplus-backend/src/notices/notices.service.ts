import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { ViewCounterService } from "@/common/view-counter/view-counter.service";
import { RedisService } from "@/redis/redis.service";
import { NotificationsService } from "@/notifications/notifications.service";
import {
  CreateNoticeDto,
  VALID_DISPLAY_LOCATIONS,
} from "./dto/create-notice.dto";
import { UpdateNoticeDto } from "./dto/update-notice.dto";
import {
  sanitizeStrict,
  sanitizeExtendedHtml,
} from "@/common/utils/sanitize.util";
import { resolveViewerTeamIds } from "@/common/utils/team-scope.util";

interface NoticeFilter {
  targetType?: string;
  isActive?: boolean;
  displayLocation?: string;
  childBirthYear?: number; // 자녀 출생연도 (학년별 필터)
  teamId?: string; // 클럽 ID (클럽별 필터)
  /**
   * [2026-05-21] 공지 범위 구분.
   *  - 'service' : 서비스 공지만 (targetTeamId = null) — 고객지원 > 서비스 공지사항
   *  - 'team'    : 팀 공지만 (targetTeamId ∈ 내 소속/관리 팀) — 팀 공지(관리/열람)
   *  - 미지정    : 기존 동작 (teamId 필터 또는 전체)
   */
  scope?: "service" | "team";
  /** scope='team' 일 때 controller 가 채우는 열람 가능 팀 ID 목록 */
  scopeTeamIds?: string[];
}

function safeParseLocations(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  if (typeof value === "string") {
    try {
      return safeParseLocations(JSON.parse(value));
    } catch {
      return [];
    }
  }

  return [];
}

function serializeLocations(value: unknown): string {
  return JSON.stringify(safeParseLocations(value));
}

function sanitizeLocations(locations: string[] | undefined): string[] {
  if (!locations || !Array.isArray(locations)) return [];
  return locations.filter((loc) =>
    (VALID_DISPLAY_LOCATIONS as readonly string[]).includes(loc),
  );
}

@Injectable()
export class NoticesService {
  // [2026-05-14] 공개 공지 목록 캐싱 — 인증 없는 호출 (userId 미지정) 시
  //   동일 필터 결과를 60초 TTL 로 Redis 에 저장. 공지 생성/수정/삭제 시 무효화.
  private readonly NOTICES_CACHE_TTL = 60;
  private readonly NOTICES_CACHE_VERSION_KEY = "notices:list:version";

  constructor(
    private readonly prisma: PrismaService,
    private readonly viewCounter: ViewCounterService,
    private readonly redis: RedisService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** 캐시 무효화 — 생성/수정/삭제 후 호출. version 키 증가로 모든 list 키 자동 만료. */
  async invalidateNoticesListCache(): Promise<void> {
    try {
      await this.redis.del(this.NOTICES_CACHE_VERSION_KEY);
    } catch {
      /* Redis 일시 오류 무시 */
    }
  }

  private mapNotice<
    T extends {
      pinned: boolean;
      isActive: boolean;
      displayLocationsJson: unknown;
    },
  >(notice: T) {
    const displayLocations = safeParseLocations(notice.displayLocationsJson);

    return {
      ...notice,
      isPinned: notice.pinned,
      isPublished: notice.isActive,
      displayLocationsJson: serializeLocations(displayLocations),
      displayLocations,
    };
  }

  /**
   * 공지사항 목록 조회
   * - userId가 있으면 NoticeRead LEFT JOIN으로 isRead 주입 (Sprint 2)
   */
  async getNotices(
    filters: NoticeFilter,
    page: number = 1,
    limit: number = 10,
    userId?: string,
    userType?: string,
    childId?: string,
  ) {
    // [2026-05-21] scope='team' — 내가 열람 가능한 팀 ID 해석 (감독/코치/학생 소속 + 학부모 자녀 경유).
    // childId 지정 시(학부모 자녀 선택) 해당 자녀 소속 팀으로만 좁힘.
    if (filters.scope === "team") {
      filters.scopeTeamIds = userId
        ? await resolveViewerTeamIds(this.prisma, userId, userType, { childId })
        : [];
    }
    // [2026-05-14] 공개 호출(userId 없음) 만 캐싱. 인증 호출은 사용자별 read 상태가
    //   join 되어 결과가 사용자마다 다르므로 캐싱 비효율.
    const cacheKey = !userId
      ? `notices:list:v1:${JSON.stringify({ filters, page, limit })}`
      : null;
    if (cacheKey) {
      try {
        const cached = await this.redis.get<unknown>(cacheKey);
        if (cached) return cached;
      } catch {
        /* Redis 미가용 시 통과 */
      }
    }

    const skip = (page - 1) * limit;

    const where: Prisma.SystemNoticeWhereInput = {};

    if (filters.targetType) {
      where.targetType = filters.targetType;
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    // [2026-05-21] scope 필터 — 서비스 공지 / 팀 공지 명확 분리.
    if (filters.scope === "service") {
      // 서비스 공지: 팀 미지정(targetTeamId = null) 만.
      where.targetTeamId = null;
    } else if (filters.scope === "team") {
      // 팀 공지: 내 소속/관리 팀 대상 공지만. 소속 팀 0개면 빈 결과.
      where.targetTeamId = { in: filters.scopeTeamIds ?? [] };
    } else if (filters.teamId) {
      // (레거시) 팀 필터: 특정 팀 대상 공지 OR 전체 대상 공지
      where.OR = [{ targetTeamId: filters.teamId }, { targetTeamId: null }];
    }

    // displayLocation 필터: PostgreSQL JsonB array_contains로 DB 레벨 필터
    const filterLocation = filters.displayLocation;
    if (filterLocation) {
      where.displayLocationsJson = {
        array_contains: [filterLocation],
      };
    }

    // 학년(출생연도) 필터: DB 레벨로 처리
    const filterBirthYear = filters.childBirthYear;
    if (filterBirthYear !== undefined) {
      where.AND = [
        {
          OR: [
            { targetBirthYearFrom: null },
            { targetBirthYearFrom: { lte: filterBirthYear } },
          ],
        },
        {
          OR: [
            { targetBirthYearTo: null },
            { targetBirthYearTo: { gte: filterBirthYear } },
          ],
        },
      ];
    }

    const [notices, total] = await Promise.all([
      this.prisma.systemNotice.findMany({
        where,
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          content: true,
          maintenanceReason: true,
          targetType: true,
          pinned: true,
          isActive: true,
          createdAt: true,
          expiresAt: true,
          startAt: true,
          displayLocationsJson: true,
          targetBirthYearFrom: true,
          targetBirthYearTo: true,
          targetTeamId: true,
          ...(userId
            ? {
                reads: {
                  where: { userId },
                  select: { readAt: true },
                  take: 1,
                },
              }
            : {}),
        },
      }),
      this.prisma.systemNotice.count({ where }),
    ]);

    const mapped = notices.map((notice) => {
      const base = this.mapNotice(notice);
      if (userId) {
        // reads가 select 되었을 때만 isRead 주입
        const reads = (notice as unknown as { reads?: { readAt: Date }[] })
          .reads;
        return { ...base, isRead: Array.isArray(reads) && reads.length > 0 };
      }
      return base;
    });

    const result = {
      data: mapped,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };

    // 캐시 저장 (인증 없는 호출만)
    if (cacheKey) {
      try {
        await this.redis.set(cacheKey, result, this.NOTICES_CACHE_TTL);
      } catch {
        /* Redis 일시 오류 무시 — 응답은 정상 반환 */
      }
    }

    return result;
  }

  /**
   * 공지 읽음 마킹 (upsert)
   */
  async markNoticeAsRead(noticeId: string, userId: string) {
    // 공지 존재 확인
    const existing = await this.prisma.systemNotice.findUnique({
      where: { id: noticeId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException("공지사항을 찾을 수 없습니다.");
    }

    await this.prisma.noticeRead.upsert({
      where: {
        noticeId_userId: { noticeId, userId },
      },
      create: { noticeId, userId },
      update: { readAt: new Date() },
    });

    return { success: true, noticeId };
  }

  /**
   * 내 미확인 활성 '서비스 공지' 개수
   * 현재 시각 기준 활성 공지(isActive, startAt, expiresAt) 중 내 NoticeRead가 없는 개수.
   * [2026-06-19 사용자 직접 지시] 전체메뉴 '서비스 공지사항' 배지와 일치하도록 서비스 공지(targetTeamId=null)
   *   만 집계 — 팀 공지가 섞여 15/18 등으로 부풀던 문제 해소.
   */
  async getUnreadNoticeCount(userId: string) {
    const now = new Date();
    const where: Prisma.SystemNoticeWhereInput = {
      isActive: true,
      targetTeamId: null, // 서비스 공지만 (팀 공지 제외)
      AND: [
        {
          OR: [{ startAt: null }, { startAt: { lte: now } }],
        },
        {
          OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
        },
      ],
      reads: { none: { userId } },
    };

    const unreadCount = await this.prisma.systemNotice.count({ where });
    return { unreadCount };
  }

  /**
   * 내 서비스 공지 전체 읽음 처리
   * [2026-06-19 사용자 직접 지시] 활성 서비스 공지(targetTeamId=null) 중 미읽음을 모두 NoticeRead 생성.
   */
  async markAllServiceNoticesRead(userId: string) {
    const now = new Date();
    const unread = await this.prisma.systemNotice.findMany({
      where: {
        isActive: true,
        targetTeamId: null,
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
        ],
        reads: { none: { userId } },
      },
      select: { id: true },
    });
    if (unread.length === 0) return { marked: 0 };
    await this.prisma.noticeRead.createMany({
      data: unread.map((n) => ({ noticeId: n.id, userId })),
      skipDuplicates: true,
    });
    return { marked: unread.length };
  }

  /**
   * 공지사항 상세 조회
   * - 1일 1회 조회수 제한: ViewCounterService.tryIncrement 성공 시에만 increment
   * - userId가 있으면 NoticeRead upsert로 읽음 마킹 (Sprint 2)
   * - 존재하지 않는 공지는 P2025 → NotFoundException으로 변환
   * - 열람 권한 검증: 시스템 공지=전원 / 팀 공지=열람 가능 팀 / 미게시=작성자·관리자 한정
   */
  async getNotice(noticeId: string, userId?: string, userType?: string) {
    // 선행: 공지 존재 여부 확인 (미존재 시 뷰 로그를 남기지 않기 위함)
    const existing = await this.prisma.systemNotice.findUnique({
      where: { id: noticeId },
    });
    if (!existing) {
      throw new NotFoundException("공지사항을 찾을 수 없습니다.");
    }

    // 열람 권한 검증 — read 마킹/조회수 증가 이전에 수행 (차단 시 흔적 남기지 않음)
    await this.assertCanViewNotice(existing, userId, userType);

    // 로그인 사용자: 읽음 마킹 (best effort — 실패해도 조회는 진행)
    if (userId) {
      try {
        await this.prisma.noticeRead.upsert({
          where: { noticeId_userId: { noticeId, userId } },
          create: { noticeId, userId },
          update: { readAt: new Date() },
        });
      } catch {
        // NoticeRead upsert 실패 시 조회는 계속 진행
      }
    }

    const shouldIncrement = await this.viewCounter.tryIncrement({
      entityType: "notice",
      entityId: noticeId,
      userId,
    });

    if (!shouldIncrement) {
      return { ...this.mapNotice(existing), isRead: !!userId };
    }

    try {
      const updated = await this.prisma.systemNotice.update({
        where: { id: noticeId },
        data: { viewCount: { increment: 1 } },
      });
      return { ...this.mapNotice(updated), isRead: !!userId };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new NotFoundException("공지사항을 찾을 수 없습니다.");
      }
      throw error;
    }
  }

  /**
   * 공지사항 생성
   *
   * [T02-M 2026-05-15] teamId 격리:
   *  - ADMIN/SYSTEM/OPER: 모든 팀 또는 전체 공지 작성 가능 (targetTeamId 자유)
   *  - DIRECTOR/COACH: 본인이 관리하는 팀 ID 만 허용 (자동 주입 또는 검증)
   *      - dto.targetTeamId 미지정 시 본인 coachProfile.teamId 자동 주입
   *      - dto.targetTeamId 지정 시 본인이 coachId 인 팀인지 검증
   *  - 기타 role: 컨트롤러 @Roles 가드로 차단되므로 도달 불가
   */
  async createNotice(userId: string, createDto: CreateNoticeDto) {
    // 1) 작성자 userType + 관리 가능 팀 조회
    const author = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        userType: true,
        coachProfile: { select: { teamId: true } },
      },
    });
    if (!author) {
      throw new NotFoundException("작성자 정보를 찾을 수 없습니다.");
    }

    const isSystemRole =
      author.userType === "ADMIN" ||
      author.userType === "SYSTEM" ||
      author.userType === "OPER";
    const isTeamScoped =
      author.userType === "DIRECTOR" ||
      author.userType === "ACADEMY_DIRECTOR" ||
      author.userType === "COACH";

    let resolvedTeamId: string | null = createDto.targetTeamId ?? null;

    if (isTeamScoped) {
      // 본인이 관리하는 팀 목록 (coachId 기준)
      const managedTeams = await this.prisma.team.findMany({
        where: { coachId: userId, isActive: true },
        select: { id: true },
      });
      const managedIds = new Set(managedTeams.map((t) => t.id));
      // coachProfile.teamId 도 본인 팀에 포함
      if (author.coachProfile?.teamId) {
        managedIds.add(author.coachProfile.teamId);
      }

      if (managedIds.size === 0) {
        throw new ForbiddenException(
          "공지를 작성할 수 있는 팀이 없습니다. (관리하는 팀 미존재)",
        );
      }

      if (!resolvedTeamId) {
        // dto.targetTeamId 미지정 → 본인 팀으로 자동 주입 (단일 팀이면 자동)
        if (managedIds.size === 1) {
          resolvedTeamId = Array.from(managedIds)[0]!;
        } else {
          throw new ForbiddenException(
            "관리하는 팀이 여러 개입니다. targetTeamId 를 지정해주세요.",
          );
        }
      } else if (!managedIds.has(resolvedTeamId)) {
        throw new ForbiddenException(
          "본인이 관리하는 팀에 대해서만 공지를 작성할 수 있습니다.",
        );
      }
    } else if (!isSystemRole) {
      // 안전망: 가드에서 차단되지만 이중 보호
      throw new ForbiddenException("공지를 작성할 권한이 없습니다.");
    }

    const validatedLocations = sanitizeLocations(createDto.displayLocations);
    const notice = await this.prisma.systemNotice.create({
      data: {
        title: sanitizeStrict(createDto.title),
        content: sanitizeExtendedHtml(createDto.content),
        targetType: createDto.type || "all",
        pinned: createDto.isPinned ?? false,
        isActive: createDto.isPublished !== false,
        createdBy: userId,
        displayLocationsJson: validatedLocations as Prisma.InputJsonValue,
        startAt: createDto.startDate ? new Date(createDto.startDate) : null,
        expiresAt: createDto.endDate ? new Date(createDto.endDate) : null,
        maintenanceReason: createDto.maintenanceReason
          ? sanitizeStrict(createDto.maintenanceReason)
          : null,
        targetBirthYearFrom: createDto.targetBirthYearFrom ?? null,
        targetBirthYearTo: createDto.targetBirthYearTo ?? null,
        targetTeamId: resolvedTeamId,
      },
    });

    // [2026-05-14] 공지 생성 → 공개 목록 캐시 무효화
    await this.invalidateNoticesListCache();

    // 팀 지정 공지면 해당 팀 소속 학생의 학부모에게 푸시 (실패는 공지 저장에 영향 없음)
    if (resolvedTeamId) {
      void this.notificationsService.notifyTeamParents(resolvedTeamId, {
        notificationType: "team_notice_created",
        title: "팀 공지",
        message: notice.title,
        linkUrl: `/notices/${notice.id}`,
      });
    }

    return this.mapNotice(notice);
  }

  /**
   * 공지사항 수정
   *
   * [T02-M 2026-05-15] teamId 격리 — DIRECTOR/COACH 는 본인이 관리하는 팀 공지만 수정 가능.
   */
  async updateNotice(
    userId: string,
    noticeId: string,
    updateDto: UpdateNoticeDto,
  ) {
    const notice = await this.prisma.systemNotice.findUnique({
      where: { id: noticeId },
    });

    if (!notice) {
      throw new NotFoundException("공지사항을 찾을 수 없습니다.");
    }

    await this.assertCanManageNotice(userId, notice.targetTeamId);

    // DIRECTOR/COACH 는 targetTeamId 를 본인 관리 팀 밖으로 변경 불가
    if (updateDto.targetTeamId !== undefined && updateDto.targetTeamId) {
      await this.assertCanManageNotice(userId, updateDto.targetTeamId);
    }

    const updateData: Prisma.SystemNoticeUpdateInput = {};

    if (updateDto.title !== undefined) {
      updateData.title = sanitizeStrict(updateDto.title);
    }
    if (updateDto.content !== undefined) {
      updateData.content = sanitizeExtendedHtml(updateDto.content);
    }
    if (updateDto.type !== undefined) {
      updateData.targetType = updateDto.type;
    }
    if (updateDto.isPinned !== undefined) {
      updateData.pinned = updateDto.isPinned;
    }
    if (updateDto.isPublished !== undefined) {
      updateData.isActive = updateDto.isPublished;
    }
    if (updateDto.maintenanceReason !== undefined) {
      updateData.maintenanceReason = updateDto.maintenanceReason
        ? sanitizeStrict(updateDto.maintenanceReason)
        : null;
    }
    if (updateDto.displayLocations !== undefined) {
      updateData.displayLocationsJson = sanitizeLocations(
        updateDto.displayLocations,
      ) as Prisma.InputJsonValue;
    }
    if (updateDto.startDate !== undefined) {
      updateData.startAt = updateDto.startDate
        ? new Date(updateDto.startDate)
        : null;
    }
    if (updateDto.endDate !== undefined) {
      updateData.expiresAt = updateDto.endDate
        ? new Date(updateDto.endDate)
        : null;
    }
    if (updateDto.targetBirthYearFrom !== undefined) {
      updateData.targetBirthYearFrom = updateDto.targetBirthYearFrom ?? null;
    }
    if (updateDto.targetBirthYearTo !== undefined) {
      updateData.targetBirthYearTo = updateDto.targetBirthYearTo ?? null;
    }
    if (updateDto.targetTeamId !== undefined) {
      updateData.targetTeamId = updateDto.targetTeamId ?? null;
    }

    const updated = await this.prisma.systemNotice.update({
      where: { id: noticeId },
      data: updateData,
    });

    // [2026-05-14] 공지 수정 → 공개 목록 캐시 무효화
    await this.invalidateNoticesListCache();

    return this.mapNotice(updated);
  }

  /**
   * 공지사항 삭제
   *
   * [T02-M 2026-05-15] teamId 격리 — DIRECTOR/COACH 는 본인 관리 팀 공지만 삭제 가능.
   */
  async deleteNotice(noticeId: string, userId?: string) {
    const notice = await this.prisma.systemNotice.findUnique({
      where: { id: noticeId },
    });

    if (!notice) {
      throw new NotFoundException("공지사항을 찾을 수 없습니다.");
    }

    if (userId) {
      await this.assertCanManageNotice(userId, notice.targetTeamId);
    }

    await this.prisma.systemNotice.delete({
      where: { id: noticeId },
    });

    // [2026-05-14] 공지 삭제 → 공개 목록 캐시 무효화
    await this.invalidateNoticesListCache();

    return { message: "공지사항이 삭제되었습니다." };
  }

  /**
   * 관리자용 공지 목록.
   *
   * [T02-M 2026-05-15] teamId 격리:
   *  - ADMIN/SYSTEM/OPER: teamId 자유 (지정 시 해당 팀만, 미지정 시 전체)
   *  - DIRECTOR/ACADEMY_DIRECTOR/COACH: 본인 관리 팀 ID 목록으로 강제 필터
   */
  async getAdminNotices(
    userId: string,
    options: {
      targetType?: string;
      isActive?: boolean;
      displayLocation?: string;
      teamId?: string;
      scope?: "service" | "team";
      page?: number;
      limit?: number;
    },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        userType: true,
        coachProfile: { select: { teamId: true } },
      },
    });
    if (!user) {
      throw new NotFoundException("사용자 정보를 찾을 수 없습니다.");
    }

    const isSystemRole =
      user.userType === "ADMIN" ||
      user.userType === "SYSTEM" ||
      user.userType === "OPER";

    const page = options.page ?? 1;
    const limit = options.limit ?? 10;

    if (isSystemRole) {
      // 시스템 관리자: 자유 필터
      return this.getNotices(
        {
          targetType: options.targetType,
          isActive: options.isActive,
          displayLocation: options.displayLocation,
          teamId: options.teamId,
          scope: options.scope,
        },
        page,
        limit,
        userId,
      );
    }

    // 팀 스코프 사용자: 본인 관리 팀만
    const managedTeams = await this.prisma.team.findMany({
      where: { coachId: userId, isActive: true },
      select: { id: true },
    });
    const managedIds = new Set(managedTeams.map((t) => t.id));
    if (user.coachProfile?.teamId) {
      managedIds.add(user.coachProfile.teamId);
    }

    if (managedIds.size === 0) {
      return {
        data: [],
        pagination: { total: 0, page, limit, totalPages: 0 },
      };
    }

    const skip = (page - 1) * limit;
    const where: Prisma.SystemNoticeWhereInput = {
      targetTeamId: { in: Array.from(managedIds) },
    };
    if (options.targetType) where.targetType = options.targetType;
    if (options.isActive !== undefined) where.isActive = options.isActive;
    if (options.displayLocation) {
      where.displayLocationsJson = {
        array_contains: [options.displayLocation],
      };
    }
    // DIRECTOR/COACH 가 teamId 지정 시 본인 관리 팀에 한해 적용
    if (options.teamId) {
      if (!managedIds.has(options.teamId)) {
        throw new ForbiddenException(
          "본인이 관리하는 팀의 공지만 조회할 수 있습니다.",
        );
      }
      where.targetTeamId = options.teamId;
    }

    const [notices, total] = await Promise.all([
      this.prisma.systemNotice.findMany({
        where,
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          content: true,
          maintenanceReason: true,
          targetType: true,
          pinned: true,
          isActive: true,
          createdAt: true,
          expiresAt: true,
          startAt: true,
          displayLocationsJson: true,
          targetBirthYearFrom: true,
          targetBirthYearTo: true,
          targetTeamId: true,
        },
      }),
      this.prisma.systemNotice.count({ where }),
    ]);

    return {
      data: notices.map((n) => this.mapNotice(n)),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 공지 열람 권한 검증 헬퍼 (상세 조회용).
   *
   *  - ADMIN/SYSTEM/OPER · 작성자 본인: 전체 허용 (미게시 편집 프리필 포함)
   *  - 미게시(isActive=false): 위 대상 외 차단
   *  - 활성 시스템 공지(targetTeamId=null): 모든 로그인 사용자 허용 (추가 쿼리 0)
   *  - 활성 팀 공지: resolveViewerTeamIds 에 targetTeamId 포함 시에만 허용
   *  - 차단 시 NotFoundException(404) — 존재 여부 비노출 (IDOR 방어)
   */
  private async assertCanViewNotice(
    notice: {
      targetTeamId: string | null;
      isActive: boolean;
      createdBy: string | null;
    },
    userId?: string,
    userType?: string,
  ): Promise<void> {
    const isSystemRole =
      userType === "ADMIN" || userType === "SYSTEM" || userType === "OPER";
    const isAuthor = !!userId && notice.createdBy === userId;
    if (isSystemRole || isAuthor) return;

    if (!notice.isActive) {
      throw new NotFoundException("공지사항을 찾을 수 없습니다.");
    }
    if (notice.targetTeamId === null) return;

    const viewerTeamIds = userId
      ? await resolveViewerTeamIds(this.prisma, userId, userType)
      : [];
    if (!viewerTeamIds.includes(notice.targetTeamId)) {
      throw new NotFoundException("공지사항을 찾을 수 없습니다.");
    }
  }

  /**
   * 공지 관리 권한 검증 헬퍼.
   *
   *  - ADMIN/SYSTEM/OPER: 모든 공지 관리 허용
   *  - DIRECTOR/ACADEMY_DIRECTOR/COACH: targetTeamId 가 본인 관리 팀일 때만 허용
   *  - 그 외 role: ForbiddenException
   */
  private async assertCanManageNotice(
    userId: string,
    targetTeamId: string | null,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        userType: true,
        coachProfile: { select: { teamId: true } },
      },
    });
    if (!user) {
      throw new ForbiddenException("사용자 정보를 찾을 수 없습니다.");
    }

    const isSystemRole =
      user.userType === "ADMIN" ||
      user.userType === "SYSTEM" ||
      user.userType === "OPER";
    if (isSystemRole) return;

    const isTeamScoped =
      user.userType === "DIRECTOR" ||
      user.userType === "ACADEMY_DIRECTOR" ||
      user.userType === "COACH";
    if (!isTeamScoped) {
      throw new ForbiddenException("공지 관리 권한이 없습니다.");
    }

    // targetTeamId 가 null (전체 공지) 인데 시스템 관리자가 아니면 차단
    if (!targetTeamId) {
      throw new ForbiddenException(
        "전체 공지(targetTeamId=null) 는 시스템 관리자만 관리할 수 있습니다.",
      );
    }

    const managedTeams = await this.prisma.team.findMany({
      where: { coachId: userId, isActive: true },
      select: { id: true },
    });
    const managedIds = new Set(managedTeams.map((t) => t.id));
    if (user.coachProfile?.teamId) {
      managedIds.add(user.coachProfile.teamId);
    }

    if (!managedIds.has(targetTeamId)) {
      throw new ForbiddenException(
        "본인이 관리하는 팀의 공지만 처리할 수 있습니다.",
      );
    }
  }

  /**
   * 상단 고정 토글
   *
   * [T02-M 2026-05-15] teamId 격리 — DIRECTOR/COACH 는 본인 관리 팀 공지만 토글 가능.
   */
  async togglePin(noticeId: string, userId?: string) {
    const notice = await this.prisma.systemNotice.findUnique({
      where: { id: noticeId },
    });

    if (!notice) {
      throw new NotFoundException("공지사항을 찾을 수 없습니다.");
    }

    if (userId) {
      await this.assertCanManageNotice(userId, notice.targetTeamId);
    }

    const isPinned = notice.pinned;
    const updated = await this.prisma.systemNotice.update({
      where: { id: noticeId },
      data: {
        pinned: !isPinned,
      },
    });

    // 토글 후 캐시 무효화
    await this.invalidateNoticesListCache();

    const newIsPinned = updated.pinned;
    return {
      id: updated.id,
      isPinned: newIsPinned,
      message: newIsPinned
        ? "상단에 고정되었습니다."
        : "고정이 해제되었습니다.",
    };
  }

  /**
   * 공개 상태 토글
   *
   * [T02-M 2026-05-15] teamId 격리 — DIRECTOR/COACH 는 본인 관리 팀 공지만 토글 가능.
   */
  async togglePublish(noticeId: string, userId?: string) {
    const notice = await this.prisma.systemNotice.findUnique({
      where: { id: noticeId },
    });

    if (!notice) {
      throw new NotFoundException("공지사항을 찾을 수 없습니다.");
    }

    if (userId) {
      await this.assertCanManageNotice(userId, notice.targetTeamId);
    }

    const updated = await this.prisma.systemNotice.update({
      where: { id: noticeId },
      data: {
        isActive: !notice.isActive,
      },
    });

    // 토글 후 캐시 무효화
    await this.invalidateNoticesListCache();

    return {
      id: updated.id,
      isPublished: updated.isActive,
      message: updated.isActive ? "공개되었습니다." : "비공개 처리되었습니다.",
    };
  }

  // ==================== 이벤트 RSVP ====================

  /**
   * 이벤트 참가 신청 (RSVP)
   * ClubEventRegistration을 사용하여 참가 등록
   * noticeId(eventId)를 기반으로 ClubEvent를 조회하여 등록 처리
   */
  async createRsvp(eventId: string, userId: string) {
    // 이벤트 확인
    const event = await this.prisma.teamEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        status: true,
        capacity: true,
        teamId: true,
        _count: { select: { registrations: true } },
      },
    });

    if (!event) {
      throw new NotFoundException("이벤트를 찾을 수 없습니다.");
    }

    if (event.status !== "published") {
      throw new NotFoundException("참가 신청 가능한 이벤트가 아닙니다.");
    }

    // 정원 확인
    if (event.capacity && event._count.registrations >= event.capacity) {
      throw new ConflictException("정원이 마감되었습니다.");
    }

    // 회원 조회 (해당 클럽의 승인된 멤버여야 함)
    const member = await this.prisma.teamMember.findFirst({
      where: {
        userId,
        teamId: event.teamId,
        approvalStatus: "approved",
      },
      select: { id: true },
    });

    if (!member) {
      throw new NotFoundException("해당 클럽의 회원 정보를 찾을 수 없습니다.");
    }

    // 중복 신청 확인 (@@unique([eventId, memberId]))
    const existing = await this.prisma.teamEventRegistration.findUnique({
      where: {
        eventId_memberId: { eventId, memberId: member.id },
      },
    });

    if (existing) {
      if (existing.status === "cancelled") {
        // 취소 후 재신청
        const updated = await this.prisma.teamEventRegistration.update({
          where: { id: existing.id },
          data: { status: "pending" },
        });
        return updated;
      }
      throw new ConflictException("이미 참가 신청한 이벤트입니다.");
    }

    const registration = await this.prisma.teamEventRegistration.create({
      data: {
        eventId,
        memberId: member.id,
        status: "pending",
      },
    });

    return registration;
  }

  /**
   * 이벤트 참가 취소
   */
  async cancelRsvp(eventId: string, userId: string) {
    // 회원 조회
    const member = await this.prisma.teamMember.findFirst({
      where: { userId, approvalStatus: "approved" },
      select: { id: true },
    });

    if (!member) {
      throw new NotFoundException("회원 정보를 찾을 수 없습니다.");
    }

    const registration = await this.prisma.teamEventRegistration.findUnique({
      where: {
        eventId_memberId: { eventId, memberId: member.id },
      },
    });

    if (!registration || registration.status === "cancelled") {
      throw new NotFoundException("참가 신청 기록을 찾을 수 없습니다.");
    }

    await this.prisma.teamEventRegistration.update({
      where: { id: registration.id },
      data: { status: "cancelled" },
    });

    return { message: "참가 신청이 취소되었습니다." };
  }

  // ==================== 댓글 ====================

  /**
   * 댓글 작성
   */
  async createComment(noticeId: string, userId: string, content: string) {
    const notice = await this.prisma.systemNotice.findUnique({
      where: { id: noticeId },
      select: { id: true, title: true, targetTeamId: true },
    });

    if (!notice) {
      throw new NotFoundException("공지사항을 찾을 수 없습니다.");
    }

    const sanitizedContent = sanitizeStrict(content);

    const comment = await this.prisma.noticeComment.create({
      data: { noticeId, userId, content: sanitizedContent },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    // [2026-06-19 사용자 직접 지시] 공지에 댓글이 달리면 팀 감독/코치에게 공지 알림 발송.
    //   (감독/코치 알림 '공지' 탭에 노출 — notice_comment_added → deriveCategory 'notice'.)
    if (notice.targetTeamId) {
      void this.notificationsService.notifyTeamManagers(notice.targetTeamId, {
        notificationType: "notice_comment_added",
        title: "공지 새 댓글",
        message: `"${notice.title}" 공지에 새 댓글이 달렸어요.`,
        linkUrl: `/notices/${noticeId}`,
      });
    }

    return comment;
  }

  /**
   * 댓글 목록 조회
   */
  async getComments(noticeId: string, page: number = 1, limit: number = 10) {
    const notice = await this.prisma.systemNotice.findUnique({
      where: { id: noticeId },
      select: { id: true },
    });

    if (!notice) {
      throw new NotFoundException("공지사항을 찾을 수 없습니다.");
    }

    const skip = (page - 1) * limit;
    const [comments, total] = await Promise.all([
      this.prisma.noticeComment.findMany({
        where: { noticeId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.noticeComment.count({ where: { noticeId } }),
    ]);

    return {
      data: comments.map((c) => ({
        ...c,
        userName: c.user
          ? `${c.user.lastName}${c.user.firstName}`
          : "알 수 없음",
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 댓글 삭제 (본인만 가능)
   */
  async deleteComment(commentId: string, userId: string) {
    const comment = await this.prisma.noticeComment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw new NotFoundException("댓글을 찾을 수 없습니다.");
    }

    if (comment.userId !== userId) {
      throw new ForbiddenException("본인 댓글만 삭제할 수 있습니다.");
    }

    return this.prisma.noticeComment.delete({ where: { id: commentId } });
  }
}
