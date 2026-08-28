import {
  Injectable,
  NotFoundException,
  OnModuleInit,
  BadRequestException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { UpdateAppSettingsDto } from "./dto/update-app-settings.dto";
import { describeProviders } from "@/payments/constants/payment-provider.constant";
import { ACTIVE_PAYMENT_PROVIDER_CACHE_KEY } from "@/payments/payment-provider.util";
import {
  APP_SETTINGS_CACHE_KEY,
  APP_SETTINGS_CACHE_TTL,
} from "./app-settings-cache";

// 배너 노출 위치 화이트리스트 (Notice의 VALID_DISPLAY_LOCATIONS와 동일 기준)
const VALID_BANNER_DISPLAY_LOCATIONS = [
  "top",
  "middle",
  "bottom",
  // legacy (하위 호환)
  "app_home",
  "app_popup",
  "app_mypage",
  "web_home",
  "web_popup",
  "web_dashboard",
] as const;

const VALID_BANNER_ROLES = [
  "all",
  "PARENT",
  "COACH",
  "TEEN",
  "CHILD",
  "DIRECTOR",
] as const;

function parseJsonStringArray(
  value: Prisma.JsonValue | string | null | undefined,
): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parseJsonStringArray(parsed);
    } catch {
      return [];
    }
  }

  return [];
}

function serializeJsonStringArray(
  value: Prisma.JsonValue | string | null | undefined,
): string {
  return JSON.stringify(parseJsonStringArray(value));
}

function sanitizeBannerLocations(locations: string[] | undefined): string[] {
  if (!locations || !Array.isArray(locations)) return [];
  return locations.filter((loc) =>
    (VALID_BANNER_DISPLAY_LOCATIONS as readonly string[]).includes(loc),
  );
}

function sanitizeBannerRoles(roles: string[] | undefined): string[] {
  if (!roles || !Array.isArray(roles)) return ["all"];
  const sanitized = roles.filter((role) =>
    (VALID_BANNER_ROLES as readonly string[]).includes(role),
  );
  return sanitized.length > 0 ? sanitized : ["all"];
}

@Injectable()
export class AppManagementService implements OnModuleInit {
  private readonly logger = new Logger(AppManagementService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private config: ConfigService, // 결제사 키 설정 여부 판정 (전역 모듈)
  ) {}

  async onModuleInit() {
    try {
      // targetRolesJson이 빈 배열인 기존 배너를 'all'로 마이그레이션
      const banners = await this.prisma.appBanner.findMany({
        select: { id: true, targetRolesJson: true },
      });

      await Promise.all(
        banners
          .filter(
            (banner) =>
              parseJsonStringArray(banner.targetRolesJson).length === 0,
          )
          .map((banner) =>
            this.prisma.appBanner.update({
              where: { id: banner.id },
              data: { targetRolesJson: ["all"] as Prisma.InputJsonValue },
            }),
          ),
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2021"
      ) {
        this.logger.warn(
          "Skipping AppBanner startup backfill because `app_banners` does not exist in the current database. Apply the app-management migrations before using banner or popup features.",
        );
        return;
      }

      throw error;
    }
  }

  // ==================== 배너 ====================

  private isValidUrl(url: string | undefined | null): boolean {
    if (!url) return true;
    // http(s):// 외부 URL 또는 / 시작 내부 경로 모두 허용
    return /^https?:\/\/.+/.test(url) || /^\//.test(url);
  }

  private validateDateRange(startAt?: Date, endAt?: Date): void {
    if (startAt && endAt && startAt > endAt) {
      throw new BadRequestException(
        "노출 시작일은 종료일보다 늦을 수 없습니다.",
      );
    }
  }

  private normalizeBenefits(benefits?: string[]): string[] {
    if (!Array.isArray(benefits)) {
      return [];
    }
    return benefits
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private mapBanner(banner: {
    id: string;
    title: string;
    imageUrl: string;
    linkUrl: string | null;
    linkType: string;
    targetRole: string | null;
    targetRolesJson: Prisma.JsonValue;
    displayLocationsJson: Prisma.JsonValue;
    sortOrder: number;
    isActive: boolean;
    startAt: Date | null;
    endAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const targetRoles = parseJsonStringArray(banner.targetRolesJson);
    const displayLocations = parseJsonStringArray(banner.displayLocationsJson);

    return {
      ...banner,
      targetRolesJson: serializeJsonStringArray(targetRoles),
      displayLocationsJson: serializeJsonStringArray(displayLocations),
      targetRoles,
      displayLocations,
    };
  }

  private mapPremiumEvent<T extends { benefitsJson: Prisma.JsonValue }>(
    event: T,
  ) {
    return {
      ...event,
      benefitsJson: parseJsonStringArray(event.benefitsJson),
    };
  }

  async getBanners({
    isActive,
    role,
    displayLocation,
  }: { isActive?: string; role?: string; displayLocation?: string } = {}) {
    const now = new Date();

    if (role) {
      // 웹 클라이언트: isActive=true + 날짜 유효성 필터
      // targetRolesJson 필터는 애플리케이션 레벨에서 처리 (varchar/jsonb 호환)
      const banners = await this.prisma.appBanner.findMany({
        where: {
          isActive: true,
          AND: [
            { OR: [{ startAt: null }, { startAt: { lte: now } }] },
            { OR: [{ endAt: null }, { endAt: { gte: now } }] },
          ],
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      });
      const mapped = banners
        .map((b) => this.mapBanner(b))
        .filter((b) => {
          if (b.targetRoles.length === 0 || b.targetRoles.includes("all"))
            return true;
          return b.targetRoles.includes(role);
        });
      // displayLocation 필터링은 파싱 후 서비스 레이어에서 처리 (Notice 패턴과 동일)
      return displayLocation
        ? mapped.filter(
            (b) =>
              b.displayLocations.length === 0 ||
              b.displayLocations.includes(displayLocation),
          )
        : mapped;
    }

    // 어드민: isActive 필터만 (전체 배너 관리)
    const banners = await this.prisma.appBanner.findMany({
      where: {
        ...(isActive !== undefined && { isActive: isActive === "true" }),
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
    return banners.map((b) => this.mapBanner(b));
  }

  async createBanner(data: {
    title: string;
    imageUrl: string;
    linkUrl?: string;
    linkType?: string;
    targetRoles?: string[];
    displayLocations?: string[];
    sortOrder?: number;
    isActive?: boolean;
    startAt?: Date;
    endAt?: Date;
  }) {
    if (!this.isValidUrl(data.linkUrl)) {
      throw new BadRequestException(
        "유효하지 않은 linkUrl 형식입니다. http(s)://로 시작해야 합니다.",
      );
    }
    if (!this.isValidUrl(data.imageUrl)) {
      throw new BadRequestException(
        "유효하지 않은 imageUrl 형식입니다. http(s)://로 시작해야 합니다.",
      );
    }
    const { targetRoles, displayLocations, ...rest } = data;
    const banner = await this.prisma.appBanner.create({
      data: {
        ...rest,
        targetRolesJson: sanitizeBannerRoles(
          targetRoles,
        ) as Prisma.InputJsonValue,
        displayLocationsJson: sanitizeBannerLocations(
          displayLocations,
        ) as Prisma.InputJsonValue,
      },
    });
    return this.mapBanner(banner);
  }

  async updateBanner(
    id: string,
    data: Partial<{
      title: string;
      imageUrl: string;
      linkUrl: string;
      linkType: string;
      targetRoles: string[];
      displayLocations: string[];
      sortOrder: number;
      isActive: boolean;
      startAt: Date;
      endAt: Date;
    }>,
  ) {
    const banner = await this.prisma.appBanner.findUnique({ where: { id } });
    if (!banner) throw new NotFoundException("배너를 찾을 수 없습니다.");
    if (data.linkUrl !== undefined && !this.isValidUrl(data.linkUrl)) {
      throw new BadRequestException(
        "유효하지 않은 linkUrl 형식입니다. http(s)://로 시작해야 합니다.",
      );
    }
    if (data.imageUrl !== undefined && !this.isValidUrl(data.imageUrl)) {
      throw new BadRequestException(
        "유효하지 않은 imageUrl 형식입니다. http(s)://로 시작해야 합니다.",
      );
    }
    const { targetRoles, displayLocations, ...rest } = data;
    const updated = await this.prisma.appBanner.update({
      where: { id },
      data: {
        ...rest,
        ...(targetRoles !== undefined && {
          targetRolesJson: sanitizeBannerRoles(
            targetRoles,
          ) as Prisma.InputJsonValue,
        }),
        ...(displayLocations !== undefined && {
          displayLocationsJson: sanitizeBannerLocations(
            displayLocations,
          ) as Prisma.InputJsonValue,
        }),
      },
    });
    return this.mapBanner(updated);
  }

  async deleteBanner(id: string) {
    const banner = await this.prisma.appBanner.findUnique({ where: { id } });
    if (!banner) throw new NotFoundException("배너를 찾을 수 없습니다.");
    await this.prisma.appBanner.delete({ where: { id } });
    return { message: "배너가 삭제되었습니다." };
  }

  // ==================== FAQ ====================

  async getFaqs(category?: string) {
    const where = category ? { category, isActive: true } : { isActive: true };
    return this.prisma.appFaq.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
  }

  async createFaq(data: {
    category: string;
    question: string;
    answer: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    return this.prisma.appFaq.create({ data });
  }

  async updateFaq(
    id: string,
    data: Partial<{
      category: string;
      question: string;
      answer: string;
      sortOrder: number;
      isActive: boolean;
    }>,
  ) {
    const faq = await this.prisma.appFaq.findUnique({ where: { id } });
    if (!faq) throw new NotFoundException("FAQ를 찾을 수 없습니다.");
    return this.prisma.appFaq.update({ where: { id }, data });
  }

  async deleteFaq(id: string) {
    const faq = await this.prisma.appFaq.findUnique({ where: { id } });
    if (!faq) throw new NotFoundException("FAQ를 찾을 수 없습니다.");
    await this.prisma.appFaq.delete({ where: { id } });
    return { message: "FAQ가 삭제되었습니다." };
  }

  // ==================== 피드백 ====================

  async getFeedbacks(status?: string, page = 1, limit = 20) {
    const where = status ? { status } : {};
    const skip = (page - 1) * limit;

    const [feedbacks, total] = await Promise.all([
      this.prisma.appFeedback.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      this.prisma.appFeedback.count({ where }),
    ]);

    // 첨부파일 배치 조회 후 각 피드백에 부착 (작성자 이름/팀은 스칼라 필드로 이미 포함)
    const attMap = await this.attachmentsByFeedback(feedbacks.map((f) => f.id));

    return {
      data: feedbacks.map((f) => ({
        ...f,
        attachments: attMap.get(f.id) ?? [],
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async updateFeedbackStatus(id: string, status: string, adminNote?: string) {
    const feedback = await this.prisma.appFeedback.findUnique({
      where: { id },
    });
    if (!feedback) throw new NotFoundException("피드백을 찾을 수 없습니다.");

    // 어드민이 답변 달면 adminReplyAt 세팅 + 사용자 알림
    const hasNewReply =
      adminNote !== undefined && adminNote !== feedback.adminNote;

    const updated = await this.prisma.appFeedback.update({
      where: { id },
      data: {
        status,
        ...(adminNote !== undefined ? { adminNote } : {}),
        ...(hasNewReply ? { adminReplyAt: new Date() } : {}),
      },
    });

    // 답변 알림 생성 (비동기, best effort — 실패해도 응답은 진행)
    if (hasNewReply && feedback.userId) {
      try {
        await this.prisma.notification.create({
          data: {
            userId: feedback.userId,
            notificationType: "feedback_reply",
            title: "피드백에 답변이 도착했습니다",
            message:
              "보내주신 피드백에 관리자가 답변을 남겼어요. 내 피드백에서 확인해보세요.",
            isRead: false,
            linkUrl: "/feedback?tab=history",
          },
        });
      } catch {
        // notification 생성 실패 무시
      }
    }

    return updated;
  }

  /**
   * 본인의 피드백 목록 조회
   */
  async getMyFeedbacks(userId: string, status?: string, page = 1, limit = 20) {
    const where: { userId: string; status?: string } = { userId };
    if (status) where.status = status;
    const skip = (page - 1) * limit;

    const [feedbacks, total] = await Promise.all([
      this.prisma.appFeedback.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          category: true,
          content: true,
          rating: true,
          status: true,
          authorName: true,
          teamName: true,
          adminNote: true,
          adminReplyAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.appFeedback.count({ where }),
    ]);

    const attMap = await this.attachmentsByFeedback(feedbacks.map((f) => f.id));

    return {
      data: feedbacks.map((f) => ({
        ...f,
        attachments: attMap.get(f.id) ?? [],
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * 본인의 피드백 상세 조회
   */
  async getMyFeedbackDetail(userId: string, id: string) {
    const feedback = await this.prisma.appFeedback.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        category: true,
        content: true,
        rating: true,
        status: true,
        authorName: true,
        teamName: true,
        adminNote: true,
        adminReplyAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!feedback || feedback.userId !== userId) {
      throw new NotFoundException("피드백을 찾을 수 없습니다.");
    }
    const attMap = await this.attachmentsByFeedback([feedback.id]);
    // userId는 응답에서 제외 (정보 노출 최소화)
    const { userId: _ignore, ...rest } = feedback;
    return { ...rest, attachments: attMap.get(feedback.id) ?? [] };
  }

  async createUserFeedback(
    userId: string,
    content: string,
    category: string,
    rating?: number,
    attachmentFileIds?: string[],
  ) {
    // 이름/팀은 클라이언트 입력을 받지 않고 로그인 신원으로 강제 귀속(위조 차단)
    const prefill = await this.getFeedbackPrefill(userId);
    const finalAuthorName = prefill.authorName || null;
    const finalTeamName = prefill.teamName || null;

    const created = await this.prisma.appFeedback.create({
      data: {
        userId,
        content,
        category,
        authorName: finalAuthorName,
        teamName: finalTeamName,
        ...(rating !== undefined ? { rating } : {}),
      },
      select: {
        id: true,
        category: true,
        content: true,
        rating: true,
        status: true,
        authorName: true,
        teamName: true,
        createdAt: true,
      },
    });

    // 첨부 파일 연결 — 통합 files 모듈의 refType/refId 방식 재사용
    //   (프론트가 먼저 업로드해 받은 fileId 들을 이 피드백에 귀속시킨다)
    if (attachmentFileIds && attachmentFileIds.length > 0) {
      await this.prisma.uploadedFile.updateMany({
        where: { id: { in: attachmentFileIds } },
        data: { refType: "app_feedback", refId: created.id },
      });
    }

    const attMap = await this.attachmentsByFeedback([created.id]);
    return { ...created, attachments: attMap.get(created.id) ?? [] };
  }

  /**
   * 피드백 작성 폼 자동 채움용 — 로그인 사용자의 이름/소속 팀명
   */
  async getFeedbackPrefill(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    const authorName = user
      ? `${user.lastName ?? ""}${user.firstName ?? ""}`.trim()
      : "";

    const membership = await this.prisma.teamMember.findFirst({
      where: { userId, approvalStatus: "approved" },
      orderBy: { joinedAt: "desc" },
      select: { team: { select: { name: true } } },
    });

    return { authorName, teamName: membership?.team?.name ?? "" };
  }

  /**
   * 피드백 첨부파일 배치 조회 (N+1 방지) — refType="app_feedback" 로 연결된 파일
   */
  private async attachmentsByFeedback(feedbackIds: string[]) {
    const map = new Map<
      string,
      Array<{
        id: string;
        url: string;
        thumbUrl: string | null;
        originalName: string;
      }>
    >();
    if (feedbackIds.length === 0) return map;

    const files = await this.prisma.uploadedFile.findMany({
      where: { refType: "app_feedback", refId: { in: feedbackIds } },
      select: {
        id: true,
        url: true,
        thumbUrl: true,
        originalName: true,
        refId: true,
      },
      orderBy: { createdAt: "asc" },
    });

    for (const f of files) {
      if (!f.refId) continue;
      const arr = map.get(f.refId) ?? [];
      arr.push({
        id: f.id,
        url: f.url,
        thumbUrl: f.thumbUrl,
        originalName: f.originalName,
      });
      map.set(f.refId, arr);
    }
    return map;
  }

  // ==================== 약관 ====================
  //
  // 게시 여부는 isActive 토글이 아니라 **시행일(publishedAt)** 이 결정한다.
  //   현행(current)  = type 별 publishedAt <= now 중 가장 늦은 1건
  //   예정(upcoming) = type 별 publishedAt >  now 중 가장 이른 1건
  //   isActive       = "철회" 표시 (잘못 등록했거나 예약을 취소한 행의 무효화)
  // 이렇게 두면 미래 시행일로 미리 등록해 둔 버전이 시행일에 자동으로 현행이 된다.
  // 상세: claudedocs/terms-versioning-redesign-2026-08-10.md

  /** 레거시 축약형 type 을 표준형으로 흡수 (조회측 alias — 웹 normalizePolicyType 과 동일 규칙) */
  private normalizeTermsType(type: string): string {
    const aliases: Record<string, string> = {
      service: "terms_of_service",
      privacy: "privacy_policy",
      child: "child_privacy",
    };
    return aliases[type] ?? type;
  }

  /**
   * 게시 중(또는 시행 예정) 약관 조회.
   *
   * app_terms 는 행 수가 작아(수~수십) 단일 findMany 후 메모리에서 type 별로 추린다.
   */
  async getTerms(opts: { type?: string; scope?: "current" | "upcoming" } = {}) {
    const now = new Date();
    const rows = await this.prisma.appTerms.findMany({
      where: {
        isActive: true,
        ...(opts.type && { type: opts.type }),
      },
      // publishedAt DESC 우선, 동률이면 최근 등록분 우선 → 현행이 하나로 확정된다.
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    });

    const byType = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = this.normalizeTermsType(row.type);
      const list = byType.get(key);
      if (list) list.push(row);
      else byType.set(key, [row]);
    }

    const picked: typeof rows = [];
    for (const list of byType.values()) {
      if (opts.scope === "upcoming") {
        // DESC 정렬이므로 뒤에서부터 찾으면 "가장 이른 미래" 가 나온다.
        for (let i = list.length - 1; i >= 0; i -= 1) {
          const row = list[i];
          if (row.publishedAt && row.publishedAt > now) {
            picked.push(row);
            break;
          }
        }
      } else {
        // publishedAt 이 없는 행은 시행 시점을 알 수 없으므로 현행 후보에서 제외한다.
        const current = list.find(
          (row) => row.publishedAt && row.publishedAt <= now,
        );
        if (current) picked.push(current);
      }
    }
    return picked;
  }

  /** 어드민 전용 — 철회분까지 포함한 전체 버전 이력 */
  async getTermsHistory(type?: string) {
    return this.prisma.appTerms.findMany({
      where: type ? { type } : undefined,
      orderBy: [{ type: "asc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
    });
  }

  async createTerms(data: {
    type: string;
    title: string;
    content: string;
    version: string;
    isActive?: boolean;
    publishedAt?: Date;
  }) {
    if (!data.version?.trim()) {
      throw new BadRequestException("버전 번호는 필수입니다.");
    }
    if (!data.publishedAt || Number.isNaN(data.publishedAt.getTime())) {
      throw new BadRequestException("시행일은 필수입니다.");
    }

    // 같은 문서에 같은 버전이 두 번 존재하면 어느 본문이 그 버전인지 특정할 수 없다.
    const duplicated = await this.prisma.appTerms.findFirst({
      where: { type: data.type, version: data.version },
      select: { id: true },
    });
    if (duplicated) {
      throw new ConflictException(
        "이미 등록된 버전입니다. 다른 버전 번호를 사용해주세요.",
      );
    }

    return this.prisma.appTerms.create({ data });
  }

  async updateTerms(
    id: string,
    data: Partial<{
      type: string;
      title: string;
      content: string;
      version: string;
      isActive: boolean;
      publishedAt: Date;
    }>,
  ) {
    const terms = await this.prisma.appTerms.findUnique({ where: { id } });
    if (!terms) throw new NotFoundException("약관을 찾을 수 없습니다.");

    // [버전 불변] 이미 시행된 버전의 본문·버전·시행일은 수정할 수 없다.
    //   그 시점에 게시돼 있던 본문을 나중에 입증해야 하는 문서이므로,
    //   내용 변경은 반드시 새 버전 등록으로 처리한다. 철회(isActive)만 허용.
    const alreadyEffective =
      !!terms.publishedAt && terms.publishedAt <= new Date();
    if (alreadyEffective) {
      const mutatesContent =
        data.type !== undefined ||
        data.title !== undefined ||
        data.content !== undefined ||
        data.version !== undefined ||
        data.publishedAt !== undefined;
      if (mutatesContent) {
        throw new ConflictException(
          "이미 시행된 약관은 수정할 수 없습니다. 새 버전으로 등록해주세요.",
        );
      }
    }

    if (data.version !== undefined) {
      if (!data.version.trim()) {
        throw new BadRequestException("버전 번호는 필수입니다.");
      }
      const duplicated = await this.prisma.appTerms.findFirst({
        where: {
          type: data.type ?? terms.type,
          version: data.version,
          id: { not: id },
        },
        select: { id: true },
      });
      if (duplicated) {
        throw new ConflictException(
          "이미 등록된 버전입니다. 다른 버전 번호를 사용해주세요.",
        );
      }
    }

    return this.prisma.appTerms.update({ where: { id }, data });
  }

  async deleteTerms(id: string) {
    const terms = await this.prisma.appTerms.findUnique({ where: { id } });
    if (!terms) throw new NotFoundException("약관을 찾을 수 없습니다.");

    // 삭제 가능 여부는 **시행 시각 도래 여부**만으로 판정한다.
    //   publishedAt > now  = 아직 시행되지 않음 = 게시된 적이 없다(사용자 화면은 현행만 조회).
    //     이용자에게 노출된 적도 동의 대상이 된 적도 없으므로 "그 시점에 게시돼 있던 본문"의
    //     증거가 아니다 → 지워도 된다. isActive 는 무관하다(취소 상태여도 미게시는 확실).
    //   publishedAt <= now = 게시됐거나(현행·과거) 게시 이력이 불명(취소분) → 증거이므로 보존.
    //     잘못 게시된 경우의 복구는 "올바른 내용으로 새 버전 등록"(시행일 도래 시 자동 교체)이다.
    //   publishedAt IS NULL = 시행 시각 불명 → 판단 근거가 없으므로 보존.
    const neverPublished =
      !!terms.publishedAt && terms.publishedAt > new Date();
    if (!neverPublished) {
      throw new ConflictException(
        "시행 예정인 버전만 삭제할 수 있습니다. 이미 게시된 약관은 새 버전을 등록해 교체해주세요.",
      );
    }

    await this.prisma.appTerms.delete({ where: { id } });
    return { message: "시행 예약이 삭제되었습니다." };
  }

  // ==================== 앱 버전 ====================

  async getVersions() {
    return this.prisma.appVersion.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * 최신 활성 버전 정보 (앱 cold start 호출).
   *
   * 앱(`AppVersionService`) 응답 스키마:
   *   { currentVersion, minimumVersion, latestVersion,
   *     forceUpdate, updateMessage, iosStoreUrl, androidStoreUrl }
   *
   * iOS/Android 각 플랫폼별 최신 활성 버전 1건씩 조회 후,
   * `platform` 지정 시 **해당 플랫폼 행의 값**으로 판정 기준
   * (latestVersion/minimumVersion/forceUpdate/updateMessage)을 응답한다.
   * 지정 플랫폼 행이 없으면 다른 플랫폼 값으로 대체하지 않고 안전 기본값
   * (0.0.0, fail-open)으로 응답한다 — iOS 기준이 Android 판정을 덮어쓰던
   * 병합 버그의 재발 방지.
   *
   * `platform` 미지정(구버전 앱 하위호환)은 기존 iOS → Android 우선 병합 유지.
   * 데이터 미존재 시에도 안전한 기본값(0.0.0)으로 응답하여 404를 차단한다.
   */
  async getLatestVersion(platform?: string) {
    const [ios, android] = await Promise.all([
      this.prisma.appVersion.findFirst({
        where: { platform: "ios", isActive: true },
      }),
      this.prisma.appVersion.findFirst({
        where: { platform: "android", isActive: true },
      }),
    ]);

    const normalized = platform?.trim().toLowerCase();
    const primary =
      normalized === "ios"
        ? ios
        : normalized === "android"
          ? android
          : (ios ?? android); // 미지정: 기존 동작(iOS 우선) 하위호환

    const latestVersion = primary?.version ?? "0.0.0";
    const minimumVersion = primary?.minVersion ?? "0.0.0";
    const forceUpdate = primary?.forceUpdate ?? false;

    return {
      currentVersion: latestVersion,
      minimumVersion,
      latestVersion,
      forceUpdate,
      updateMessage: primary?.releaseNotes ?? null,
      iosStoreUrl: ios?.storeUrl ?? null,
      androidStoreUrl: android?.storeUrl ?? null,
    };
  }

  async createVersion(data: {
    platform: string;
    version: string;
    minVersion: string;
    forceUpdate?: boolean;
    releaseNotes?: string;
    storeUrl?: string;
    isActive?: boolean;
  }) {
    return this.prisma.appVersion.create({ data });
  }

  async updateVersion(
    id: string,
    data: {
      minVersion?: string;
      forceUpdate?: boolean;
      releaseNotes?: string | null;
      storeUrl?: string | null;
      isActive?: boolean;
    },
  ) {
    const version = await this.prisma.appVersion.findUnique({ where: { id } });
    if (!version) throw new NotFoundException("버전을 찾을 수 없습니다.");
    return this.prisma.appVersion.update({
      where: { id },
      data: {
        ...(data.minVersion !== undefined && { minVersion: data.minVersion }),
        ...(data.forceUpdate !== undefined && {
          forceUpdate: data.forceUpdate,
        }),
        ...(data.releaseNotes !== undefined && {
          releaseNotes: data.releaseNotes,
        }),
        ...(data.storeUrl !== undefined && { storeUrl: data.storeUrl }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  // ==================== 앱 사용 통계 (UserActivityLog 집계) ====================
  /**
   * 실제 사용자 앱/웹 사용 통계. `platform IN ('web','app')` 로 **admin(운영자) 트래픽은 항상 제외**.
   *   - DAU/MAU: sessionId distinct 기반 (userId 는 현재 익명 추적이라 미사용)
   *   - 세션시간/앱버전 분포: 원천 데이터(durationMs·버전) 미수집 → 제공하지 않음
   * @param params.days 7 | 30 | 90 (기본 7)
   * @param params.platform all | web | app (기본 all, admin 제외)
   */
  async getAppStatistics(params: { days?: number; platform?: string }) {
    const days = [7, 30, 90].includes(params.days ?? 7) ? (params.days ?? 7) : 7;
    const platform =
      params.platform === "web" || params.platform === "app"
        ? params.platform
        : "all";

    // admin 은 항상 제외. 플랫폼 필터는 web/app 범위 내에서만 좁힘.
    const platformCond =
      platform === "all"
        ? Prisma.sql`platform IN ('web','app')`
        : Prisma.sql`platform = ${platform}`;

    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const ydayStart = new Date(todayStart);
    ydayStart.setDate(ydayStart.getDate() - 1);
    const mauStart = new Date(todayStart);
    mauStart.setDate(mauStart.getDate() - 30);
    const monthStart = new Date(
      todayStart.getFullYear(),
      todayStart.getMonth(),
      1,
    );

    const n = (v: bigint | number | null | undefined): number => Number(v ?? 0);

    const [
      dailyRaw,
      platRaw,
      pagesRaw,
      actionRaw,
      todayR,
      ydayR,
      mauR,
      newSignups,
    ] = await Promise.all([
      // 1) 일별 DAU (distinct session) + 이벤트 수
      this.prisma.$queryRaw<
        Array<{ d: Date; dau: bigint; events: bigint }>
      >`SELECT date_trunc('day', created_at) AS d,
               count(distinct session_id) AS dau,
               count(*) AS events
          FROM user_activity_logs
         WHERE created_at >= ${since} AND ${platformCond}
         GROUP BY 1 ORDER BY 1`,
      // 2) 플랫폼 분포 (web vs app) — 항상 web/app 둘 다
      this.prisma.$queryRaw<
        Array<{ platform: string; sessions: bigint; events: bigint }>
      >`SELECT platform,
               count(distinct session_id) AS sessions,
               count(*) AS events
          FROM user_activity_logs
         WHERE created_at >= ${since} AND platform IN ('web','app')
         GROUP BY platform`,
      // 3) 인기 페이지 (PAGE_VIEW resource 상위 8)
      this.prisma.$queryRaw<
        Array<{ resource: string; views: bigint }>
      >`SELECT resource, count(*) AS views
          FROM user_activity_logs
         WHERE created_at >= ${since} AND ${platformCond}
           AND action = 'PAGE_VIEW' AND resource IS NOT NULL
         GROUP BY resource ORDER BY views DESC LIMIT 8`,
      // 4) 액션 분포
      this.prisma.$queryRaw<
        Array<{ action: string; cnt: bigint }>
      >`SELECT action, count(*) AS cnt
          FROM user_activity_logs
         WHERE created_at >= ${since} AND ${platformCond}
         GROUP BY action ORDER BY cnt DESC`,
      // 5) 오늘 DAU
      this.prisma.$queryRaw<
        Array<{ c: bigint }>
      >`SELECT count(distinct session_id) AS c FROM user_activity_logs
         WHERE created_at >= ${todayStart} AND ${platformCond}`,
      // 6) 어제 DAU (증감 계산용)
      this.prisma.$queryRaw<
        Array<{ c: bigint }>
      >`SELECT count(distinct session_id) AS c FROM user_activity_logs
         WHERE created_at >= ${ydayStart} AND created_at < ${todayStart} AND ${platformCond}`,
      // 7) MAU (최근 30일 distinct session)
      this.prisma.$queryRaw<
        Array<{ c: bigint }>
      >`SELECT count(distinct session_id) AS c FROM user_activity_logs
         WHERE created_at >= ${mauStart} AND ${platformCond}`,
      // 8) 이번 달 신규 가입 (회원 DB 기준)
      this.prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
    ]);

    const dau = n(todayR[0]?.c);
    const dauYday = n(ydayR[0]?.c);
    const dauChange =
      dauYday > 0 ? Math.round(((dau - dauYday) / dauYday) * 100) : null;

    const totalSessions = platRaw.reduce((s, r) => s + n(r.sessions), 0);
    const platformStats = platRaw.map((r) => ({
      platform: r.platform,
      sessions: n(r.sessions),
      events: n(r.events),
      percentage:
        totalSessions > 0 ? Math.round((n(r.sessions) / totalSessions) * 100) : 0,
    }));

    return {
      range: { days, platform },
      summary: {
        dau,
        dauChange,
        mau: n(mauR[0]?.c),
        newSignupsThisMonth: newSignups,
      },
      dailyStats: dailyRaw.map((r) => ({
        date: r.d,
        dau: n(r.dau),
        events: n(r.events),
      })),
      platformStats,
      topPages: pagesRaw.map((r) => ({ path: r.resource, views: n(r.views) })),
      actionStats: actionRaw.map((r) => ({
        action: r.action,
        count: n(r.cnt),
      })),
    };
  }

  // ==================== 프리미엄 이벤트 ====================

  async getPremiumEvents(isActive?: string) {
    const now = new Date();
    const hasActiveFilter = isActive !== undefined;
    const activeValue = isActive === "true";

    const events = await this.prisma.appPremiumEvent.findMany({
      where: hasActiveFilter
        ? { isActive: activeValue }
        : {
            isActive: true,
            AND: [
              { OR: [{ startAt: null }, { startAt: { lte: now } }] },
              { OR: [{ endAt: null }, { endAt: { gte: now } }] },
            ],
          },
      orderBy: [
        { sortOrder: "asc" },
        { eventDate: "asc" },
        { createdAt: "desc" },
      ],
    });

    return events.map((event) => this.mapPremiumEvent(event));
  }

  async getFeaturedPremiumEvent() {
    const now = new Date();

    const event = await this.prisma.appPremiumEvent.findFirst({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] },
        ],
      },
      orderBy: [
        { sortOrder: "asc" },
        { eventDate: "asc" },
        { createdAt: "desc" },
      ],
    });

    return event ? this.mapPremiumEvent(event) : null;
  }

  async createPremiumEvent(data: {
    title: string;
    subtitle?: string;
    description: string;
    eventDate: Date;
    venueName: string;
    venueAddress?: string;
    benefits?: string[];
    ctaLabel?: string;
    ctaUrl?: string;
    imageUrl?: string;
    isActive?: boolean;
    sortOrder?: number;
    startAt?: Date;
    endAt?: Date;
  }) {
    this.validateDateRange(data.startAt, data.endAt);

    if (!this.isValidUrl(data.ctaUrl)) {
      throw new BadRequestException(
        "유효하지 않은 ctaUrl 형식입니다. http(s):// 또는 / 경로를 사용해주세요.",
      );
    }
    if (!this.isValidUrl(data.imageUrl)) {
      throw new BadRequestException(
        "유효하지 않은 imageUrl 형식입니다. http(s):// 또는 / 경로를 사용해주세요.",
      );
    }

    const { benefits, ...rest } = data;

    return this.prisma.appPremiumEvent.create({
      data: {
        ...rest,
        benefitsJson: this.normalizeBenefits(benefits) as Prisma.InputJsonValue,
      },
    });
  }

  async updatePremiumEvent(
    id: string,
    data: Partial<{
      title: string;
      subtitle: string;
      description: string;
      eventDate: Date;
      venueName: string;
      venueAddress: string;
      benefits: string[];
      ctaLabel: string;
      ctaUrl: string;
      imageUrl: string;
      isActive: boolean;
      sortOrder: number;
      startAt: Date;
      endAt: Date;
    }>,
  ) {
    const premiumEvent = await this.prisma.appPremiumEvent.findUnique({
      where: { id },
    });
    if (!premiumEvent)
      throw new NotFoundException("프리미엄 이벤트를 찾을 수 없습니다.");

    this.validateDateRange(data.startAt, data.endAt);

    if (data.ctaUrl !== undefined && !this.isValidUrl(data.ctaUrl)) {
      throw new BadRequestException(
        "유효하지 않은 ctaUrl 형식입니다. http(s):// 또는 / 경로를 사용해주세요.",
      );
    }
    if (data.imageUrl !== undefined && !this.isValidUrl(data.imageUrl)) {
      throw new BadRequestException(
        "유효하지 않은 imageUrl 형식입니다. http(s):// 또는 / 경로를 사용해주세요.",
      );
    }

    const { benefits, ...rest } = data;

    return this.prisma.appPremiumEvent.update({
      where: { id },
      data: {
        ...rest,
        ...(benefits !== undefined && {
          benefitsJson: this.normalizeBenefits(
            benefits,
          ) as Prisma.InputJsonValue,
        }),
      },
    });
  }

  async deletePremiumEvent(id: string) {
    const premiumEvent = await this.prisma.appPremiumEvent.findUnique({
      where: { id },
    });
    if (!premiumEvent)
      throw new NotFoundException("프리미엄 이벤트를 찾을 수 없습니다.");

    await this.prisma.appPremiumEvent.update({
      where: { id },
      data: { isActive: false, endAt: new Date() },
    });

    return { message: "프리미엄 이벤트가 비활성화되었습니다." };
  }

  // ==================== 앱 설정 ====================

  private async ensureAppSettings() {
    let settings = await this.prisma.appSettings.findFirst();
    if (!settings) {
      settings = await this.prisma.appSettings.create({ data: {} });
    }
    return settings;
  }

  async getAppSettings() {
    // 🔥 Redis 캐시 우선 조회 — 고빈도 Public 엔드포인트(스플래시·AppSettingsContext에서 호출)
    //   1초 SLA 달성 핵심: DB 왕복(원격 PG RTT) 제거로 typical 300-800ms → <10ms
    try {
      const cached = await this.redis.get<string>(APP_SETTINGS_CACHE_KEY);
      if (cached) {
        return typeof cached === "string" ? JSON.parse(cached) : cached;
      }
    } catch (err) {
      // Redis 장애 시 graceful degradation — DB로 폴백
      this.logger.debug(
        `AppSettings cache read failed: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }

    const settings = await this.ensureAppSettings();

    // 캐시 저장 (실패해도 원 응답에 영향 없음)
    try {
      await this.redis.set(
        APP_SETTINGS_CACHE_KEY,
        JSON.stringify(settings),
        APP_SETTINGS_CACHE_TTL,
      );
    } catch (err) {
      this.logger.debug(
        `AppSettings cache write failed: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
    return settings;
  }

  async updateAppSettings(dto: UpdateAppSettingsDto, adminId: string) {
    // 화면에서 비활성이어도 API 를 직접 호출하면 통과하므로 서버에서도 막는다.
    //   키가 없거나 결제 화면이 없는 결제사로 바꾸면 결제 전면 장애가 된다.
    if (dto.paymentProvider) {
      const status = describeProviders(this.config).find(
        (p) => p.code === dto.paymentProvider,
      );
      if (!status?.selectable) {
        throw new BadRequestException(
          `선택할 수 없는 결제사입니다 (${status?.reason ?? "미지원"})`,
        );
      }
    }

    const existing = await this.ensureAppSettings();
    const updated = await this.prisma.appSettings.update({
      where: { id: existing.id },
      data: { ...dto, updatedBy: adminId },
    });
    // 캐시 무효화 — 즉시 최신 유지보수 모드 반영
    //   결제사 캐시도 함께 지운다 — 전환이 다음 결제부터 즉시 반영되어야 한다.
    try {
      await this.redis.del([
        APP_SETTINGS_CACHE_KEY,
        ACTIVE_PAYMENT_PROVIDER_CACHE_KEY,
      ]);
    } catch {
      /* Redis 장애 시 무시 (TTL 5분 내 자연 만료) */
    }
    return updated;
  }

  /**
   * 현재 활성 시스템 점검 공지 1건 조회 (앱 진입 차단용 · 공개).
   *
   * 판정 기준: **서버 현재 시각**(`new Date()`) — 점검 공지(`targetType="maintenance"`) +
   *           `isActive` + `startAt <= 서버now <= expiresAt`.
   *   → 디바이스 시각을 신뢰하지 않고 서버 시각으로 판정하므로(2026-06-07 사용자 지시
   *     "년월일 시분초는 서버시간 기준"), 단말 시계 오차·조작과 무관하게 동작한다.
   *   startAt/expiresAt 은 절대시각(DB DateTime)으로 저장되어 서버 now 와 직접 비교된다.
   * 없으면 null → 앱은 점검 아님으로 정상 진입.
   *
   * 점검 출처 SoT: SystemNotice (2026-06-07 사용자 승인 — AppSettings.maintenanceMode 대체).
   */
  async getActiveMaintenanceNotice() {
    const now = new Date();
    const notice = await this.prisma.systemNotice.findFirst({
      where: {
        targetType: "maintenance",
        // 전역(전체) 공지만 점검 판정 — 팀 공지가 maintenance 타입을 달고 있어도
        // 전체 앱 차단으로 번지지 않게 격리한다. 쓰기 쪽은 NoticesService 가
        // "시스템 역할 + 전역 전용" 으로 강제하며, 이 필터는 레거시/우회 생성분까지
        // 무력화하는 2차 방어다.
        targetTeamId: null,
        isActive: true,
        startAt: { lte: now },
        // 종료일시는 필수 정책이나, 과거 데이터/누락 방어로 null 도 허용(무기한).
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
      orderBy: [{ pinned: "desc" }, { startAt: "desc" }],
      select: {
        id: true,
        title: true,
        content: true,
        startAt: true,
        expiresAt: true,
        maintenanceReason: true,
        createdAt: true,
      },
    });
    return notice;
  }
}
