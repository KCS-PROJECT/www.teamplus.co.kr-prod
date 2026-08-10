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
  NoticeType,
  VALID_DISPLAY_LOCATIONS,
} from "./dto/create-notice.dto";
import { UpdateNoticeDto } from "./dto/update-notice.dto";
import {
  sanitizeStrict,
  sanitizeExtendedHtml,
} from "@/common/utils/sanitize.util";
import { maskProfanity } from "@/common/utils/content-filter.util";
import { resolveViewerTeamIds } from "@/common/utils/team-scope.util";
import {
  isWithinPublicationWindow,
  publicationConditions,
  buildNoticeTeamScopeCondition,
} from "@/common/utils/notice-publication.util";
import {
  resolveNoticeManageTeamIds,
  normalizeTargetTeamId,
  isNoticeSystemRole,
  isNoticeTeamScopedRole,
} from "./utils/notice-manage-scope.util";

/** 고정 공지 최대 개수 — `targetTeamId` 별 독립 풀 (null = 시스템 공지 전용 풀). */
const MAX_PINNED_PER_POOL = 2;
/** Serializable 직렬화 충돌(P2034) bounded retry 횟수. */
const PIN_TX_MAX_RETRIES = 3;

interface NoticeFilter {
  targetType?: string;
  isActive?: boolean;
  displayLocation?: string;
  childBirthYear?: number; // 자녀 출생연도 (학년별 필터)
  teamId?: string; // 클럽 ID (클럽별 필터)
  /**
   * [2026-05-21] 공지 범위 구분.
   *  - 'service' : 공지만 (targetTeamId = null) — 고객지원 > 공지사항
   *  - 'team'    : 팀 공지만 (targetTeamId ∈ 내 소속/관리 팀) — 팀 공지(관리/열람)
   *  - 미지정    : 기존 동작 (teamId 필터 또는 전체)
   */
  scope?: "service" | "team";
  /** scope='team' · scope 미지정일 때 채우는 열람 가능 팀 ID 목록 */
  scopeTeamIds?: string[];
  /**
   * [2026-08-07 · R10-H1] 팀 스코프 우회 — **관리 목록(ADMIN/SYSTEM/OPER) 전용**.
   *   audience 경로에서는 절대 켜지 않는다. 켜면 전 팀 공지가 반환된다.
   */
  skipViewerScope?: boolean;
  /**
   * [2026-08-07 · F-01] 게시 기간 우회 — **관리 목록 전용**.
   *   관리자는 예약·만료 공지를 확인해야 하므로 predicate 를 건너뛴다.
   */
  skipPublicationWindow?: boolean;
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

  /**
   * [Phase 5 · AC 5-1~2] 공지 관리 가능 여부 판정 컨텍스트 — 요청당 **한 번만** 해석한다.
   *   시스템 역할 = 전역·팀 공지 모두 / 팀 역할 = 관리 팀 공지만 / 그 외 = false.
   *   행별 판정은 `canManageWith` 로 O(1) — 목록에서 행마다 권한 쿼리를 만들지 않는다.
   */
  private async resolveManageContext(
    userId?: string,
    userType?: string,
  ): Promise<{ isSystem: boolean; managedIds: Set<string> }> {
    if (!userId) return { isSystem: false, managedIds: new Set() };
    if (isNoticeSystemRole(userType)) {
      return { isSystem: true, managedIds: new Set() };
    }
    if (!isNoticeTeamScopedRole(userType)) {
      return { isSystem: false, managedIds: new Set() };
    }
    const ids = await resolveNoticeManageTeamIds(this.prisma, userId, userType);
    return { isSystem: false, managedIds: new Set(ids) };
  }

  private canManageWith(
    ctx: { isSystem: boolean; managedIds: Set<string> },
    targetTeamId: string | null,
  ): boolean {
    if (ctx.isSystem) return true;
    return targetTeamId !== null && ctx.managedIds.has(targetTeamId);
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
    //
    // [2026-08-07 SECURITY · R10-H1] **scope 생략 시에도** 해석한다.
    //   기존에는 scope='team' 일 때만 해석하고, scope 미지정이면 팀 조건 자체가 없어
    //   `GET /notices` 한 번으로 **전 팀 공지 본문**이 반환됐다(목록 select 에 content 포함).
    //   관리 목록(skipViewerScope)만 이 해석을 건너뛴다.
    if (
      !filters.skipViewerScope &&
      (filters.scope === "team" || filters.scope === undefined)
    ) {
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

    // AND 조건 누적 — 개별 필터가 `where.AND` 를 직접 대입하면 서로 덮어써서
    //   먼저 설정한 조건이 조용히 사라진다(출생연도 필터 ↔ 게시 기간 충돌 사례).
    const andConditions: Prisma.SystemNoticeWhereInput[] = [];

    // [2026-05-21] scope 필터 — 서비스 공지 / 팀 공지 명확 분리.
    //   ⚠️ scope 는 관리 목록에서도 유효하다. skipViewerScope 를 먼저 분기하면
    //      어드민의 `?scope=service` 요청에 팀 공지가 섞인다.
    if (filters.scope === "service") {
      // 서비스 공지: 팀 미지정(targetTeamId = null) 만.
      where.targetTeamId = null;
    } else if (filters.scope === "team") {
      // 팀 공지. 관리 목록은 전체 팀(또는 지정 팀), audience 는 내 열람 팀만.
      where.targetTeamId = filters.skipViewerScope
        ? (filters.teamId ?? { not: null })
        : { in: filters.scopeTeamIds ?? [] };
    } else if (filters.skipViewerScope) {
      // 관리 목록 + scope 미지정 — 팀 스코프를 의도적으로 우회(teamId 지정 시 그 팀만).
      if (filters.teamId) {
        where.targetTeamId = filters.teamId;
      }
    } else {
      // [2026-08-07 · R10-H1] scope 생략 = "내가 볼 수 있는 전부".
      //   기존 레거시 `teamId` 분기는 **viewer 검증 없이** 임의 팀 공지를 반환했고,
      //   teamId 조차 없으면 팀 조건이 통째로 빠져 전 팀 공지가 나갔다.
      //   호출자 실측: `teamId` 파라미터 사용 0건(web·admin 전수) → 레거시 분기 제거.
      //   scope 없이 호출하는 화면 3곳(events·club/news·notice-detail)은 이 기본값으로 무변경 동작한다.
      andConditions.push(
        buildNoticeTeamScopeCondition(filters.scopeTeamIds ?? []),
      );
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
      andConditions.push(
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
      );
    }

    // [2026-08-07 · F-01] 게시 기간 — audience 열람 경로 공통 인가 조건.
    //   관리 목록은 만료·예약 공지를 계속 봐야 하므로 명시적으로 우회한다.
    if (!filters.skipPublicationWindow) {
      andConditions.push(...publicationConditions());
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
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

    // [Phase 5 · AC 5-1~2] canManage — 권한 집합은 요청당 **한 번만** 해석해 전 행에 적용.
    const manageCtx = await this.resolveManageContext(userId, userType);

    const mapped = notices.map((notice) => {
      const base = {
        ...this.mapNotice(notice),
        canManage: this.canManageWith(manageCtx, notice.targetTeamId),
      };
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

    // [2026-07-20 읽음 동기화 B→A] 이 공지를 가리키는 알림함 미읽음 행도 읽음 처리
    //   (벨 카운트·iOS 뱃지 동반 하향). 실패는 메서드 내부에서 격리(예외 미전파).
    //   [Phase 4 · AC 4-3] 응답 전 완료 — 응답 직후 벨 재조회가 스테일 캐시를 읽지 않게.
    await this.notificationsService.markNotificationsReadByLinkUrls(userId, [
      `/notice/${noticeId}`,
    ]);

    return { success: true, noticeId };
  }

  /**
   * 내 미확인 활성 '서비스 공지' 개수
   * 현재 시각 기준 활성 공지(isActive, startAt, expiresAt) 중 내 NoticeRead가 없는 개수.
   * [2026-06-19 사용자 직접 지시] 전체메뉴 '공지사항' 배지와 일치하도록 서비스 공지(targetTeamId=null)
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
    // [2026-07-20 읽음 동기화 B→A] 일괄 읽음한 공지들의 알림함 행도 함께 읽음 처리.
    //   [Phase 4 · AC 4-3] 응답 전 완료 (실패는 메서드 내부 격리).
    await this.notificationsService.markNotificationsReadByLinkUrls(
      userId,
      unread.map((n) => `/notice/${n.id}`),
    );
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

    // [Phase 5 · AC 5-1~2 · P5-R1-03] 관리 컨텍스트는 요청당 1회 — 열람 검증의 관리자 예외와
    // 응답 canManage 가 같은 해석 결과를 공유한다 (만료 팀 공지를 관리자가 열 때 이중 조회 방지).
    const manageCtx = await this.resolveManageContext(userId, userType);

    // 열람 권한 검증 — read 마킹/조회수 증가 이전에 수행 (차단 시 흔적 남기지 않음)
    await this.assertCanViewNotice(existing, userId, userType, manageCtx);

    // 로그인 사용자: 읽음 마킹 (best effort — 실패해도 조회는 진행)
    if (userId) {
      try {
        await this.prisma.noticeRead.upsert({
          where: { noticeId_userId: { noticeId, userId } },
          create: { noticeId, userId },
          update: { readAt: new Date() },
        });
        // [2026-07-20 읽음 동기화 B→A] 공지 상세 열람 = 대응 알림함 행도 읽음 처리.
        //   "공지 내용을 읽었는데 알림/뱃지 미읽음이 그대로" 문제의 근본 해소.
        //   [Phase 4 · AC 4-3] 응답 전 완료 — 상세 열람 직후 벨 카운트가 스테일이지 않게.
        await this.notificationsService.markNotificationsReadByLinkUrls(userId, [
          `/notice/${noticeId}`,
        ]);
      } catch {
        // NoticeRead upsert 실패 시 조회는 계속 진행
      }
    }

    const shouldIncrement = await this.viewCounter.tryIncrement({
      entityType: "notice",
      entityId: noticeId,
      userId,
    });

    // [Phase 5 · AC 5-1] 상세 canManage — 위에서 1회 해석한 컨텍스트 재사용 (P5-R1-03).
    const canManage = this.canManageWith(manageCtx, existing.targetTeamId);

    if (!shouldIncrement) {
      return { ...this.mapNotice(existing), isRead: !!userId, canManage };
    }

    try {
      const updated = await this.prisma.systemNotice.update({
        where: { id: noticeId },
        data: { viewCount: { increment: 1 } },
      });
      return { ...this.mapNotice(updated), isRead: !!userId, canManage };
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
   * 이전/다음 공지 — 전용 API (Phase 5 · AC 5-3~4 · F-14).
   *
   * 기존에는 상세 화면이 `limit=100` 목록을 받아 클라이언트에서 인접을 계산했다 —
   * 101번째부터 부정확하고, 목록·상세의 권한 predicate 가 이중화된다. 서버 단일 계산으로 대체.
   *
   * 모드 계약 (AC 5-3):
   *   · audience(기본) — 상세와 동일한 열람 검증(assertCanViewNotice) 후, **진입 공지와 같은
   *     종류**(팀 공지 → 내 열람 팀 풀 · 서비스 공지 → 서비스 풀)의 **게시 중** 공지만 후보.
   *   · manage — 현재 공지의 관리 권한을 서버가 확인(없으면 **404 은닉**). 후보는 같은 종류의
   *     관리 가능 풀이며 **미게시·예약·만료 포함** (관리 목록과 동일 우회).
   *
   * 정렬 계약 (AC 5-4): `createdAt DESC, id DESC` 결정론 — createdAt 동률은 id 로 판정.
   *   next = 즉시 더 최신 글 · previous = 즉시 더 오래된 글 (현 UI 의미 유지).
   */
  async getAdjacentNotices(
    noticeId: string,
    userId?: string,
    userType?: string,
    mode: "audience" | "manage" = "audience",
  ) {
    const current = await this.prisma.systemNotice.findUnique({
      where: { id: noticeId },
      select: {
        id: true,
        createdAt: true,
        targetTeamId: true,
        isActive: true,
        createdBy: true,
        startAt: true,
        expiresAt: true,
      },
    });
    if (!current) {
      throw new NotFoundException("공지사항을 찾을 수 없습니다.");
    }

    const baseConditions: Prisma.SystemNoticeWhereInput[] = [];

    if (mode === "manage") {
      // 관리 모드 — 권한 없는 요청과 부재 공지는 동일한 404
      const ctx = await this.resolveManageContext(userId, userType);
      if (!this.canManageWith(ctx, current.targetTeamId)) {
        throw new NotFoundException("공지사항을 찾을 수 없습니다.");
      }
      baseConditions.push(
        current.targetTeamId
          ? ctx.isSystem
            ? { targetTeamId: { not: null } }
            : { targetTeamId: { in: Array.from(ctx.managedIds) } }
          : { targetTeamId: null },
      );
    } else {
      // audience — 상세 열람과 동일 검증 (타 팀·비공개는 여기서 404)
      await this.assertCanViewNotice(current, userId, userType);
      const viewerTeamIds =
        current.targetTeamId && userId
          ? await resolveViewerTeamIds(this.prisma, userId, userType)
          : [];
      baseConditions.push(
        current.targetTeamId
          ? { targetTeamId: { in: viewerTeamIds } }
          : { targetTeamId: null },
        { isActive: true },
        ...publicationConditions(),
      );
    }

    // 결정론 인접 판정 — (createdAt, id) 튜플 비교로 동률까지 안정.
    const [next, previous] = await Promise.all([
      // next = 현재보다 (createdAt, id) 가 큰 것 중 가장 작은 것 (즉시 더 최신)
      this.prisma.systemNotice.findFirst({
        where: {
          AND: [
            ...baseConditions,
            {
              OR: [
                { createdAt: { gt: current.createdAt } },
                { createdAt: current.createdAt, id: { gt: current.id } },
              ],
            },
          ],
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, title: true },
      }),
      // previous = 현재보다 작은 것 중 가장 큰 것 (즉시 더 오래됨)
      this.prisma.systemNotice.findFirst({
        where: {
          AND: [
            ...baseConditions,
            {
              OR: [
                { createdAt: { lt: current.createdAt } },
                { createdAt: current.createdAt, id: { lt: current.id } },
              ],
            },
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, title: true },
      }),
    ]);

    return { next, previous };
  }

  /**
   * 공지사항 생성
   *
   * teamId 격리 ([T02-M 2026-05-15] 도입 · **2026-08-06 Phase 0 에서 SoT 교체**):
   *  - ADMIN/SYSTEM/OPER: 모든 팀 또는 전체 공지 작성 가능 (targetTeamId 자유)
   *  - DIRECTOR/COACH: `resolveNoticeManageTeamIds` 가 반환한 팀만 허용
   *      = `active Team.coachId` ∪ `TeamMember(approved · leftAt=null · 관리 역할)`
   *      - `targetTeamId` **키 생략** 시 관리 팀이 하나면 자동 주입, 여럿이면 지정 요구
   *      - 명시적 `null`/`""` 는 전역 공지 요청 → 시스템 역할만 허용
   *  - ACADEMY_DIRECTOR: 팀 도메인 권한이 없어 제외
   *  - 기타 role: 컨트롤러 @Roles 가드로 차단되므로 도달 불가
   *
   * ⚠️ `CoachProfile.teamId` 는 더 이상 권한 근거가 아니다(승인 여부를 반영하지 않아
   *    미승인 코치가 관리자로 취급되던 경로 — Phase 0 에서 제거).
   */
  async createNotice(userId: string, createDto: CreateNoticeDto) {
    // 1) 작성자 userType + 관리 가능 팀 조회
    const author = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { userType: true },
    });
    if (!author) {
      throw new NotFoundException("작성자 정보를 찾을 수 없습니다.");
    }

    const isSystemRole = isNoticeSystemRole(author.userType);
    // [Phase 0] ACADEMY_DIRECTOR 제외 — 가입 시 Team 을 만들지 않아 팀 도메인 권한이 없다.
    const isTeamScoped = isNoticeTeamScopedRole(author.userType);

    // [Phase 0 · F-EX-04] DTO 계약과 런타임을 일치시킨다.
    //   · 키 생략(undefined) → "대상 미지정" → 팀 스코프 작성자는 단일 관리 팀 자동 주입
    //   · 명시적 null·""·공백  → "전역(전체) 공지 요청" → **시스템 역할만 허용**
    //   두 경우를 뭉뚱그리면 DIRECTOR 가 `targetTeamId: null` 을 보냈을 때 403 대신
    //   본인 팀으로 조용히 자동 주입되어, updateNotice 의 전이 계약과도 어긋난다.
    const hasExplicitTarget = createDto.targetTeamId !== undefined;
    const requestedTeamId = normalizeTargetTeamId(createDto.targetTeamId);
    let resolvedTeamId: string | null = requestedTeamId;

    if (isTeamScoped) {
      // [Phase 0 · F-03·F-04] 공지 전용 관리 SoT — CoachProfile 미사용, 승인된 관리 역할만.
      const managedIds = new Set(
        await resolveNoticeManageTeamIds(this.prisma, userId, author.userType),
      );

      if (managedIds.size === 0) {
        throw new ForbiddenException(
          "공지를 작성할 수 있는 팀이 없습니다. (관리하는 팀 미존재)",
        );
      }

      if (hasExplicitTarget && requestedTeamId === null) {
        // 명시적 전역 요청 — 팀 범위 권한자는 전체 공지를 만들 수 없다.
        throw new ForbiddenException(
          "전체 공지는 시스템 관리자만 작성할 수 있습니다.",
        );
      }

      if (!resolvedTeamId) {
        // 키 생략 → 본인 팀으로 자동 주입 (단일 팀이면 자동)
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

    // 점검 공지(maintenance)는 **시스템 역할 + 전역(전체) 공지 전용**.
    //   앱 진입 차단 화면(`GET /app-management/maintenance-notice`, @Public)을 발동시키는
    //   특수 타입이라 팀 관리자가 만들 수 있으면 팀 공지 하나로 전체 앱이 차단된다.
    //   웹 팀 공지 작성 화면에는 type 입력 자체가 없지만, API 직접 호출은 막지 못하므로
    //   서버에서 강제한다 (UI 부재 ≠ 차단).
    //   팀 대상(resolvedTeamId != null) 점검 공지는 판정 쿼리의 targetTeamId:null 필터에
    //   걸리지 않는 죽은 데이터가 되므로 시스템 역할에게도 금지한다.
    if (createDto.type === NoticeType.MAINTENANCE) {
      if (!isSystemRole) {
        throw new ForbiddenException(
          "점검 공지는 시스템 관리자만 작성할 수 있습니다.",
        );
      }
      if (resolvedTeamId !== null) {
        throw new ForbiddenException(
          "점검 공지는 전체 공지로만 작성할 수 있습니다.",
        );
      }
    }

    const validatedLocations = sanitizeLocations(createDto.displayLocations);
    // 게시 상태(공개 + 게시 시작 시각 도래)에서만 생성 시점 푸시.
    //   - isActive=false(임시저장) 또는 startAt 미래(예약 공지)는 발송하지 않는다.
    //     (예약 공지의 도래 시점 발송은 미지원 — 게시 시각에 맞춰 생성할 것)
    const now = new Date();
    const startAt = createDto.startDate ? new Date(createDto.startDate) : null;
    const expiresAt = createDto.endDate ? new Date(createDto.endDate) : null;
    const isActive = createDto.isPublished !== false;
    // [P3-R1-04] 종료 경계 포함 — 이미 만료된 기간으로 생성된 공지는 "유효 게시" 가
    // 아니므로 claim·알림 대상이 아니다 (전환 경로의 withinWindow 판정과 대칭).
    const isPushablePublication =
      isActive &&
      (!startAt || startAt <= now) &&
      (!expiresAt || expiresAt >= now);

    const noticeData = {
      title: sanitizeStrict(createDto.title),
      content: sanitizeExtendedHtml(createDto.content),
      targetType: createDto.type || "all",
      pinned: createDto.isPinned ?? false,
      isActive,
      createdBy: userId,
      displayLocationsJson: validatedLocations as Prisma.InputJsonValue,
      // A군 절대 시점 — 화면이 KST 벽시계를 ISO 로 변환해 보낸 값을 그대로 저장한다.
      //   (규약: 절대 시점은 UTC 저장, 벽시계 변환은 입력 화면 책임)
      startAt,
      expiresAt,
      maintenanceReason: createDto.maintenanceReason
        ? sanitizeStrict(createDto.maintenanceReason)
        : null,
      targetBirthYearFrom: createDto.targetBirthYearFrom ?? null,
      targetBirthYearTo: createDto.targetBirthYearTo ?? null,
      targetTeamId: resolvedTeamId,
      // [Phase 3 · AC 3-9] 게시 알림 생애 1회 claim — 즉시 게시 생성은 이 요청이 곧
      // 첫 게시 이벤트이므로 생성과 동시에 claim 을 소진 기록한다(별도 레이스 없음).
      publishedNotifiedAt: isPushablePublication ? now : null,
    };

    // [Phase 3 · AC 3-7] 고정 생성은 한도 불변식과 같은 Serializable 트랜잭션.
    const notice = createDto.isPinned
      ? await this.withPinSerializableRetry(async (tx) => {
          await this.assertPinCapacity(tx, resolvedTeamId);
          return tx.systemNotice.create({ data: noticeData });
        })
      : await this.prisma.systemNotice.create({ data: noticeData });

    // [2026-05-14] 공지 생성 → 공개 목록 캐시 무효화 (트랜잭션 밖 — AC 3-7)
    await this.invalidateNoticesListCache();

    if (isPushablePublication) {
      this.sendPublishNotification(notice, userId);
    }

    return this.mapNotice(notice);
  }

  /**
   * 게시 알림 발송 (claim 확보 후 commit 뒤에만 호출할 것).
   *
   * [Phase 3 · AC 3-10] 이 호출은 "알림 이벤트 생성의 exactly-once" 를 의미하며
   * WebSocket/FCM 실제 전달은 기존 best-effort 정책 그대로다. 발송 실패를 이유로
   * `publishedNotifiedAt` claim 을 초기화하거나 재발송하지 않는다.
   */
  private sendPublishNotification(
    notice: { id: string; title: string; targetType: string | null; targetTeamId: string | null },
    actorUserId: string,
  ): void {
    // 행위자 미상(레거시 무인자 호출)이면 제외 없이 전체 발송
    const excludeUserIds = actorUserId ? [actorUserId] : [];
    if (notice.targetTeamId) {
      // [2026-07-20 수신자 확대] 팀 공지 → 팀 전체 풀(멤버 ∪ 학부모 ∪ 감독/코치) — 작성자 본인만 제외.
      void this.notificationsService.notifyTeamAudience(
        notice.targetTeamId,
        {
          notificationType: "team_notice_created",
          title: "팀 공지",
          message: notice.title,
          linkUrl: `/notice/${notice.id}`,
        },
        { excludeUserIds },
      );
    } else {
      // [2026-07-20 신규] 시스템/서비스 공지(targetTeamId=null) → 전체 활성 사용자 푸시.
      void this.notificationsService.notifyAllAppUsers(
        {
          notificationType: "system_notice_created",
          title:
            notice.targetType === "maintenance" ? "시스템 점검 안내" : "공지사항",
          message: notice.title,
          linkUrl: `/notice/${notice.id}`,
        },
        { excludeUserIds },
      );
    }
  }

  /**
   * 게시 전환의 생애 1회 알림 claim — **게시 상태 변경과 같은 트랜잭션(tx) 안에서** 호출.
   *
   * [Phase 3 · AC 3-9~10 · P3-R1-03] `updateMany({ id, publishedNotifiedAt: null })` 의
   * 원자적 count 로 claim 을 판정한다 — 동시 전환 2건이 와도 한 트랜잭션만 count=1 을 받는다.
   * 조건: 전환 결과가 "첫 유효 게시"(isActive + 게시기간 내)일 때만.
   * [AC 3-11] 예약 공지(startAt 미래)는 claim 하지 않는다 — 도래 후 명시적 전환에서 처리.
   * 반환된 claimed 는 commit 뒤 sendPublishNotification 호출 여부로만 사용한다.
   */
  private async claimPublishInTx(
    tx: Prisma.TransactionClient,
    row: {
      id: string;
      isActive: boolean;
      startAt: Date | null;
      expiresAt: Date | null;
    },
  ): Promise<boolean> {
    if (!row.isActive) return false;
    const now = new Date();
    const withinWindow =
      (!row.startAt || row.startAt <= now) &&
      (!row.expiresAt || row.expiresAt >= now);
    if (!withinWindow) return false;

    const claim = await tx.systemNotice.updateMany({
      where: { id: row.id, publishedNotifiedAt: null },
      data: { publishedNotifiedAt: now },
    });
    return claim.count === 1; // false = 이미 소진(생애 1회 계약)
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

    // [Phase 0 · F-EX-04] targetTeamId 전이 계약.
    //   기존 가드는 `&& updateDto.targetTeamId`(truthy) 라 **null 과 빈 문자열이 검증을 통과**했다.
    //   → 팀 관리자가 자기 팀 공지를 전역 공지(전체 사용자 노출)로 승격시킬 수 있었다.
    //   이제 키가 존재하면(undefined 아님) 정규화 후 항상 검증한다:
    //     · null(전역 전환) → assertCanManageNotice(null) 이 시스템 역할만 통과시킨다
    //     · 팀 B 이동      → B 관리 권한까지 검증 (A 권한은 위에서 이미 확인)
    if (updateDto.targetTeamId !== undefined) {
      const nextTeamId = normalizeTargetTeamId(updateDto.targetTeamId);
      await this.assertCanManageNotice(userId, nextTeamId);
    }

    // 점검 공지 가드 — create 와 동일 계약 (시스템 역할 + 전역 전용).
    //   UpdateNoticeDto 가 PartialType(CreateNoticeDto) 로 `type` 을 상속하므로 전환 경로가 열려 있고,
    //   [R1-01] `type` 을 **생략**한 채 기존 maintenance 공지를 팀 대상으로 이동하는 경로도 있다.
    //   → 요청 키가 아니라 **수정 결과 상태**(type·대상 팀 모두 "키 있으면 새 값, 없으면 기존 값")로
    //     판정해야 두 경로를 한 가드로 막는다.
    const effectiveType =
      updateDto.type !== undefined ? updateDto.type : notice.targetType;
    if (effectiveType === NoticeType.MAINTENANCE) {
      const editor = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { userType: true },
      });
      if (!isNoticeSystemRole(editor?.userType)) {
        throw new ForbiddenException(
          "점검 공지는 시스템 관리자만 설정할 수 있습니다.",
        );
      }
      const effectiveTeamId =
        updateDto.targetTeamId !== undefined
          ? normalizeTargetTeamId(updateDto.targetTeamId)
          : notice.targetTeamId;
      if (effectiveTeamId !== null) {
        throw new ForbiddenException(
          "점검 공지는 전체 공지로만 설정할 수 있습니다.",
        );
      }
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
    // [2026-08-07 · F-05] 키가 있으면(null 포함) 반영 — `null` 이 곧 "기간 해제" 다.
    //   프론트가 빈 값을 `undefined` 로 보내 키가 사라지던 탓에 한 번 설정한 기간을
    //   지울 수 없었다. 이제 `null` 을 명시적으로 보낸다.
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
      // 정규화 결과를 기록 — `""` 가 그대로 저장되어 아무에게도 안 보이는 고아 공지가 되던 경로 차단.
      updateData.targetTeamId = normalizeTargetTeamId(updateDto.targetTeamId);
    }

    // [Phase 3 · AC 3-6~7] 고정 불변식 — update 상속 경로 포함.
    //   create·togglePin 만 막으면 PATCH { isPinned: true } 가 세 번째 우회가 된다
    //   (웹 수정 폼이 실제로 isPinned 를 항상 전송). 풀 판정은 전이 결과 대상 팀 기준.
    //   [P3-R1-02] 신규 고정(false→true)뿐 아니라 **이미 고정된 공지의 풀 이동**
    //   (targetTeamId 변경)도 목적지 풀 한도를 검사해야 한다 — 안 하면 고정을 유지한 채
    //   팀을 옮겨 목적지 풀에 3번째 고정이 저장된다.
    const becomesPinned = updateDto.isPinned === true && !notice.pinned;
    const effectivePinned =
      updateDto.isPinned !== undefined ? updateDto.isPinned : notice.pinned;
    const nextTargetTeamId =
      updateDto.targetTeamId !== undefined
        ? normalizeTargetTeamId(updateDto.targetTeamId)
        : notice.targetTeamId;
    const poolChanged = nextTargetTeamId !== notice.targetTeamId;
    const needsPinCheck = effectivePinned && (becomesPinned || poolChanged);
    const publishTransition =
      updateDto.isPublished === true && !notice.isActive;

    // [P3-R1-03 · AC 3-9~10] 게시 전환과 생애 1회 claim 은 **같은 트랜잭션** —
    //   isActive=true 커밋과 claim 기록 사이에서 프로세스가 죽으면 "게시됐지만 알림은
    //   영구 누락" 상태가 남는다. 트랜잭션으로 묶으면 둘 다 반영되거나 둘 다 롤백된다.
    //   알림 **호출**은 commit 뒤에만 (claimed 플래그로 전달).
    const runUpdate = async (tx: Prisma.TransactionClient) => {
      if (needsPinCheck) {
        await this.assertPinCapacity(tx, nextTargetTeamId, noticeId);
      }
      const row = await tx.systemNotice.update({
        where: { id: noticeId },
        data: updateData,
      });
      const claimed = publishTransition
        ? await this.claimPublishInTx(tx, row)
        : false;
      return { row, claimed };
    };

    const { row: updated, claimed } = needsPinCheck
      ? await this.withPinSerializableRetry(runUpdate)
      : publishTransition
        ? await this.prisma.$transaction(runUpdate)
        : {
            row: await this.prisma.systemNotice.update({
              where: { id: noticeId },
              data: updateData,
            }),
            claimed: false,
          };

    // [2026-05-14] 공지 수정 → 공개 목록 캐시 무효화 (트랜잭션 밖 — AC 3-7)
    await this.invalidateNoticesListCache();

    if (claimed) {
      this.sendPublishNotification(updated, userId);
    }

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
   * 공지를 작성·관리할 수 있는 팀 목록 (팀 선택기용).
   *
   * [2026-08-07 · Phase 2 · F-02] **쓰기 권한 SoT 와 동일 집합**을 반환한다.
   *   화면이 다른 기준(예: `/teams/my/managed`)으로 팀을 보여주면 목록에는 있는데
   *   저장은 403 이 나는 불일치가 생긴다.
   *
   * 시스템 역할(ADMIN/SYSTEM/OPER)은 전체 공지도 쓸 수 있으므로 팀 제한이 없다 —
   * 화면에서 팀 선택이 필요 없어 빈 배열을 반환한다(선택기 미노출).
   */
  async getManageableTeams(userId: string, userType?: string) {
    if (isNoticeSystemRole(userType)) {
      return { data: [] };
    }

    const teamIds = await resolveNoticeManageTeamIds(
      this.prisma,
      userId,
      userType,
    );
    if (teamIds.length === 0) {
      return { data: [] };
    }

    const teams = await this.prisma.team.findMany({
      where: { id: { in: teamIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return { data: teams };
  }

  /**
   * 관리자용 공지 목록.
   *
   * [T02-M 2026-05-15] teamId 격리:
   *  - ADMIN/SYSTEM/OPER: teamId 자유 (지정 시 해당 팀만, 미지정 시 전체)
   *  - DIRECTOR/COACH: 본인 관리 팀 ID 목록으로 강제 필터 (ACADEMY_DIRECTOR 는 대상 제외 — 빈 결과)
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
      select: { userType: true },
    });
    if (!user) {
      throw new NotFoundException("사용자 정보를 찾을 수 없습니다.");
    }

    const isSystemRole = isNoticeSystemRole(user.userType);

    const page = options.page ?? 1;
    const limit = options.limit ?? 10;

    if (isSystemRole) {
      // 시스템 관리자: 자유 필터.
      //   [2026-08-07] 관리 목록은 **팀 스코프·게시 기간을 의도적으로 우회**한다 —
      //   예약·만료 공지까지 보여야 관리가 가능하다. audience 경로와 구분되는 유일한 지점.
      return this.getNotices(
        {
          targetType: options.targetType,
          isActive: options.isActive,
          displayLocation: options.displayLocation,
          teamId: options.teamId,
          scope: options.scope,
          skipViewerScope: true,
          skipPublicationWindow: true,
        },
        page,
        limit,
        userId,
        // [Phase 5 · AC 5-1] userType 을 전달해야 위임 경로의 canManage 가 시스템 역할로 계산된다
        user.userType,
      );
    }

    // 팀 스코프 사용자: 본인 관리 팀만 (Phase 0 공지 전용 SoT)
    const managedIds = new Set(
      await resolveNoticeManageTeamIds(this.prisma, userId, user.userType),
    );

    // [P3-R1-01 · AC 3-5] teamId 은닉 검사는 빈 관리 집합 조기 반환보다 **먼저** —
    // 관리 팀 0개 사용자가 임의 teamId 로 200 빈 목록을 받으면, 404 를 받는 다른
    // 사용자와의 응답 차이가 존재/권한 정보를 누설한다. 어떤 사용자든 권한 밖
    // teamId 는 동일한 404 여야 한다.
    if (options.teamId && !managedIds.has(options.teamId)) {
      throw new NotFoundException("공지사항을 찾을 수 없습니다.");
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
    // DIRECTOR/COACH 가 teamId 지정 시 본인 관리 팀에 한해 적용.
    // 권한 밖 teamId 의 404 은닉은 위(빈 집합 조기 반환 이전)에서 이미 처리됨 — 여기 도달한
    // teamId 는 관리 팀 확정.
    if (options.teamId) {
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
      // [Phase 5 · AC 5-1~2] 이 분기의 where 는 관리 팀으로 한정돼 있으므로 전 행 canManage=true —
      // 이미 해석한 managedIds 를 재사용하며 추가 권한 쿼리는 없다.
      data: notices.map((n) => ({ ...this.mapNotice(n), canManage: true })),
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
      startAt?: Date | null;
      expiresAt?: Date | null;
    },
    userId?: string,
    userType?: string,
    // [P5-R1-03] 호출자가 이미 관리 컨텍스트를 해석했다면 전달 — 게시기간 밖 팀 공지의
    // 관리자 예외 판정에 재사용해 같은 요청에서 관리 SoT 를 두 번 조회하지 않는다.
    precomputedManageCtx?: { isSystem: boolean; managedIds: Set<string> },
  ): Promise<void> {
    const isSystemRole = isNoticeSystemRole(userType);
    const isAuthor = !!userId && notice.createdBy === userId;
    if (isSystemRole || isAuthor) return;

    if (!notice.isActive) {
      throw new NotFoundException("공지사항을 찾을 수 없습니다.");
    }

    // [Phase 0 · F-EX-01] 게시 기간은 목록만이 아니라 **모든 audience 열람 경로**의 인가 조건이다.
    //   (목록만 필터하면 상세·댓글 직접 링크가 그대로 우회로가 된다)
    const published = isWithinPublicationWindow(notice);

    if (notice.targetTeamId === null) {
      if (!published) {
        throw new NotFoundException("공지사항을 찾을 수 없습니다.");
      }
      return;
    }

    const viewerTeamIds = userId
      ? await resolveViewerTeamIds(this.prisma, userId, userType)
      : [];
    if (!viewerTeamIds.includes(notice.targetTeamId)) {
      throw new NotFoundException("공지사항을 찾을 수 없습니다.");
    }

    // 게시 기간 밖이어도 **해당 팀의 검증된 관리자**는 관리 목적으로 열람할 수 있다
    //   (지난 공지 확인·수정·moderation 동선 보존). 게시 중이면 추가 쿼리 0.
    if (!published) {
      const ctx =
        precomputedManageCtx ??
        (await this.resolveManageContext(userId, userType));
      if (!this.canManageWith(ctx, notice.targetTeamId)) {
        throw new NotFoundException("공지사항을 찾을 수 없습니다.");
      }
    }
  }

  /**
   * 공지 관리 권한 검증 헬퍼.
   *
   *  - ADMIN/SYSTEM/OPER: 모든 공지 관리 허용
   *  - DIRECTOR/COACH: targetTeamId 가 본인 관리 팀(소유 팀 ∪ 승인된 관리 역할)일 때만 허용
   *  - ACADEMY_DIRECTOR: 팀 공지 관리 대상 아님 — 항상 ForbiddenException
   *  - 그 외 role: ForbiddenException
   */
  private async assertCanManageNotice(
    userId: string,
    targetTeamId: string | null,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { userType: true },
    });
    if (!user) {
      throw new ForbiddenException("사용자 정보를 찾을 수 없습니다.");
    }

    if (isNoticeSystemRole(user.userType)) return;

    // [Phase 0 · 결정 4] ACADEMY_DIRECTOR 는 팀 공지 관리 대상에서 제외.
    if (!isNoticeTeamScopedRole(user.userType)) {
      throw new ForbiddenException("공지 관리 권한이 없습니다.");
    }

    // targetTeamId 가 null (전체 공지) 인데 시스템 관리자가 아니면 차단
    if (!targetTeamId) {
      throw new ForbiddenException(
        "전체 공지(targetTeamId=null) 는 시스템 관리자만 관리할 수 있습니다.",
      );
    }

    const managedIds = await resolveNoticeManageTeamIds(
      this.prisma,
      userId,
      user.userType,
    );

    if (!managedIds.includes(targetTeamId)) {
      throw new ForbiddenException(
        "본인이 관리하는 팀의 공지만 처리할 수 있습니다.",
      );
    }
  }

  /**
   * 고정 한도 검사가 필요한 쓰기를 Serializable 트랜잭션 + bounded retry 로 실행.
   *
   * [Phase 3 · AC 3-7] count → write 사이의 레이스로 3번째 고정이 커밋되는 것을
   * Serializable 격리로 차단한다. 직렬화 충돌(P2034)은 재시도하되,
   * 한도 초과(ConflictException) 등 업무 예외는 그대로 전파한다.
   * 외부 알림·캐시 작업은 재시도될 수 있는 트랜잭션 안에 넣지 말 것.
   */
  private async withPinSerializableRetry<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (e) {
        const isSerializationConflict =
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2034";
        if (!isSerializationConflict || attempt >= PIN_TX_MAX_RETRIES) {
          throw e;
        }
      }
    }
  }

  /**
   * 고정 최대 2개 불변식 — 같은 트랜잭션(tx) 안에서 호출해야 원자적이다.
   *
   * [Phase 3 · AC 3-6] 풀 단위: `targetTeamId` 별 독립 (null = 시스템 공지 전용 풀).
   * 게시·기간 상태와 무관하게 `pinned=true` 전체를 센다 — 만료·예약 공지를 편집하는
   * 동안에도 불변식이 흔들리지 않게.
   * [AC 3-8] 초과 시 409 + errorCode=NOTICE_PIN_LIMIT (Web 은 MESSAGES.notice.pinnedFull 매핑).
   */
  private async assertPinCapacity(
    tx: Prisma.TransactionClient,
    targetTeamId: string | null,
    excludeNoticeId?: string,
  ): Promise<void> {
    const pinnedCount = await tx.systemNotice.count({
      where: {
        pinned: true,
        targetTeamId,
        ...(excludeNoticeId ? { id: { not: excludeNoticeId } } : {}),
      },
    });
    if (pinnedCount >= MAX_PINNED_PER_POOL) {
      throw new ConflictException({
        statusCode: 409,
        message: `상단 고정은 최대 ${MAX_PINNED_PER_POOL}개까지 가능합니다.`,
        error: "NOTICE_PIN_LIMIT",
      });
    }
  }

  /**
   * 상단 고정 토글
   *
   * [T02-M 2026-05-15] teamId 격리 — DIRECTOR/COACH 는 본인 관리 팀 공지만 토글 가능.
   * [Phase 3 · AC 3-7] false→true 전환은 create 와 동일한 서버 불변식(Serializable)을 통과해야 한다.
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
    const updated = isPinned
      ? // 고정 해제는 한도와 무관 — 일반 update
        await this.prisma.systemNotice.update({
          where: { id: noticeId },
          data: { pinned: false },
        })
      : await this.withPinSerializableRetry(async (tx) => {
          await this.assertPinCapacity(tx, notice.targetTeamId, noticeId);
          return tx.systemNotice.update({
            where: { id: noticeId },
            data: { pinned: true },
          });
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

    // [Phase 3 · AC 3-9~10 · P3-R1-03] 미게시→게시 전환과 생애 1회 claim 을 같은
    //   트랜잭션으로 기록 — updateNotice(isPublished) 경로와 claim 저장소
    //   (publishedNotifiedAt)를 공유하므로 어느 경로로 전환해도 생애 1회가 유지된다.
    const publishTransition = !notice.isActive;
    const { row: updated, claimed } = await this.prisma.$transaction(
      async (tx) => {
        const row = await tx.systemNotice.update({
          where: { id: noticeId },
          data: { isActive: !notice.isActive },
        });
        const didClaim = publishTransition
          ? await this.claimPublishInTx(tx, row)
          : false;
        return { row, claimed: didClaim };
      },
    );

    // 토글 후 캐시 무효화 (트랜잭션 밖)
    await this.invalidateNoticesListCache();

    if (claimed) {
      this.sendPublishNotification(updated, userId ?? "");
    }

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
  async createComment(
    noticeId: string,
    userId: string,
    content: string,
    userType?: string,
  ) {
    const notice = await this.prisma.systemNotice.findUnique({
      where: { id: noticeId },
      select: {
        id: true,
        title: true,
        targetTeamId: true,
        isActive: true,
        createdBy: true,
        // [Phase 0 · F-EX-01] assertCanViewNotice 의 게시 기간 판정 입력
        startAt: true,
        expiresAt: true,
      },
    });

    if (!notice) {
      throw new NotFoundException("공지사항을 찾을 수 없습니다.");
    }

    // 작성 권한 = 열람 권한 (단일 규칙). 팀 공지는 resolveViewerTeamIds 에 targetTeamId 가
    //   포함되어야 하며, 학부모는 childId 미지정이라 **전체 자녀 중 해당 팀 approved 멤버가
    //   1명 이상**일 때만 통과한다(가입 승인 대기·거절·무소속 자녀만 있으면 차단).
    //   기존에는 가드가 없어 noticeId 만 알면 타 팀 공지에도 댓글 작성 + 감독/코치 알림
    //   발송이 가능했다. 시스템 공지(targetTeamId=null)는 기존대로 전체 허용.
    await this.assertCanViewNotice(notice, userId, userType);

    // UGC 콘텐츠 필터 — XSS 살균 후 비속어 마스킹 (아동·청소년 이용 서비스)
    const sanitizedContent = maskProfanity(sanitizeStrict(content));

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
        linkUrl: `/notice/${noticeId}`,
      });
    }

    return comment;
  }

  /**
   * 댓글 목록 조회.
   *
   * [Phase 0 · F-09] **인증 필수 + 열람 권한 검증** — 상세 조회와 동일한 인가.
   * [Phase 4 · AC 4-4] 비로그인 실명 마스킹 분기 제거 — 컨트롤러가 `AuthGuard("jwt")` 를
   *   강제해 viewerId 없는 요청은 이 메서드에 도달할 수 없다(팀/게시기간 열람 검증도
   *   `assertCanViewNotice` 가 비로그인을 404 로 차단). 도달 불가 분기를 남겨두면
   *   "비로그인 열람이 가능하다"는 오독을 낳으므로 제거한다.
   *
   * @param viewerId 로그인 사용자 ID
   * @param viewerType 로그인 사용자 역할 (열람 권한 판정용)
   */
  async getComments(
    noticeId: string,
    page: number = 1,
    limit: number = 10,
    viewerId?: string,
    viewerType?: string,
  ) {
    const notice = await this.prisma.systemNotice.findUnique({
      where: { id: noticeId },
      select: {
        id: true,
        targetTeamId: true,
        isActive: true,
        createdBy: true,
        startAt: true,
        expiresAt: true,
      },
    });

    if (!notice) {
      throw new NotFoundException("공지사항을 찾을 수 없습니다.");
    }

    // 댓글 열람 = 공지 열람 (단일 규칙). 차단 시 404 로 존재 여부도 감춘다.
    await this.assertCanViewNotice(notice, viewerId, viewerType);

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
      data: comments.map(({ user, ...rest }) => ({
        ...rest,
        user: user ?? null,
        userName: user ? `${user.lastName}${user.firstName}` : "알 수 없음",
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
  /**
   * 댓글 삭제.
   *
   * [Phase 4 · AC 4-1] 두 경로:
   *   · 작성자 본인 — 항상 삭제 가능 (감사 로그 없음, 기존 동작 유지)
   *   · moderation — 해당 공지를 관리할 수 있는 팀 관리자(공지 대상 팀 기준) 또는 시스템 역할.
   *     권한 밖·타 팀·부재 대상은 **동일한 404** — 기존 403("본인 댓글만")은 댓글의 존재를
   *     확인시켜 주는 응답이라 IDOR 은닉 결정으로 대체한다.
   * [AC 4-2] moderation 삭제는 AuditLog 생성과 **하나의 트랜잭션** — 부분 성공(삭제됐는데
   *   기록 없음 / 기록됐는데 삭제 안 됨)이 남지 않는다. 감사에는 식별자만 기록하고
   *   **댓글 본문은 복제하지 않는다**(개인정보 최소화).
   */
  async deleteComment(commentId: string, userId: string, userType?: string) {
    const comment = await this.prisma.noticeComment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        userId: true,
        noticeId: true,
        notice: { select: { targetTeamId: true } },
      },
    });

    if (!comment) {
      throw new NotFoundException("댓글을 찾을 수 없습니다.");
    }

    // 본인 댓글 — 기존 경로 그대로
    if (comment.userId === userId) {
      return this.prisma.noticeComment.delete({ where: { id: commentId } });
    }

    // moderation 권한 판정 — 쓰기 SoT 재사용.
    //   전역 공지(targetTeamId=null) 댓글은 시스템 역할만, 팀 공지 댓글은 해당 팀 관리자도.
    const noticeTeamId = comment.notice?.targetTeamId ?? null;
    let canModerate = isNoticeSystemRole(userType);
    if (!canModerate && noticeTeamId && isNoticeTeamScopedRole(userType)) {
      const managedIds = await resolveNoticeManageTeamIds(
        this.prisma,
        userId,
        userType,
      );
      canModerate = managedIds.includes(noticeTeamId);
    }
    if (!canModerate) {
      // 404 은닉 — 권한 없는 사용자에게 댓글 존재를 확인시켜 주지 않는다
      throw new NotFoundException("댓글을 찾을 수 없습니다.");
    }

    const [deleted] = await this.prisma.$transaction([
      this.prisma.noticeComment.delete({ where: { id: commentId } }),
      this.prisma.auditLog.create({
        data: {
          userId,
          action: "NOTICE_COMMENT_DELETED",
          resource: "NoticeComment",
          oldValue: {
            noticeId: comment.noticeId,
            commentId: comment.id,
            commentOwnerUserId: comment.userId,
          },
        },
      }),
    ]);
    return deleted;
  }
}
