import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { isAdminRole } from "@/auth/constants/chldiv.constants";
import { RevenueScope } from "./dto/director-revenue-query.dto";

type BillingMode = "PREPAID" | "POSTPAID" | "BOTH";

export interface RevenueHero {
  totalRevenue: number;
  prepaidRevenue: number;
  postpaidRevenue: number;
  deltaAmount: number;
  deltaRate: number | null;
  outstanding: number;
}

export interface RevenueSeriesPoint {
  bucket: string;
  label: string;
  prepaid: number;
  postpaid: number;
  isCurrent: boolean;
}

export interface RevenueClassLine {
  classId: string;
  className: string;
  billingMode: BillingMode;
  prepaid: number;
  postpaid: number;
  total: number;
}

export interface PostpaidStatus {
  hasPostpaid: boolean;
  billed: number;
  collected: number;
  outstanding: number;
  /** 선택 기간 시작 이전 정산월의 미수 합 (누적 잔액 중 과거분 안내용) */
  outstandingPrevious: number;
  periodLabel: string;
}

export interface RevenueMemberTrendPoint {
  month: string;
  label: string;
  joined: number;
  left: number;
  total: number;
}

export interface RevenueMemberSummary {
  totalMembers: number;
  newMembers: number;
}

export interface DirectorRevenueResponse {
  scope: "month" | "year";
  anchor: string;
  periodLabel: string;
  hasManagedTeams: boolean;
  hero: RevenueHero;
  series: RevenueSeriesPoint[];
  classRevenue: RevenueClassLine[];
  postpaidStatus: PostpaidStatus;
  memberSummary: RevenueMemberSummary;
  memberTrend: RevenueMemberTrendPoint[];
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

@Injectable()
export class DirectorRevenueService {
  constructor(private readonly prisma: PrismaService) {}

  async getDirectorRevenue(
    user: { id: string; userType: string },
    scope: RevenueScope,
    anchor: string,
  ): Promise<DirectorRevenueResponse> {
    this.assertScopeAnchor(scope, anchor);

    const teamIds = await this.resolveManagedTeamIds(user);
    const periodLabel = this.periodLabel(scope, anchor);

    if (teamIds.length === 0) {
      return this.emptyResponse(scope, anchor, periodLabel);
    }

    const seriesBuckets = this.buildSeriesBuckets(scope, anchor);
    // 연간 스코프는 전년비 계산을 위해 직전 연도 12개월을 함께 조회한다.
    const aggBuckets =
      scope === RevenueScope.YEAR
        ? [...this.buildYearBuckets(this.yearOf(anchor) - 1), ...seriesBuckets]
        : seriesBuckets;
    const periodBuckets = this.buildPeriodBuckets(scope, anchor);
    const periodBucketSet = new Set(periodBuckets);
    const periodStartBucket = periodBuckets[0];
    const prevBucketSet = new Set(this.buildPrevPeriodBuckets(scope, anchor));

    const rangeStart = this.bucketStartUtc(aggBuckets[0]);
    const rangeEnd = this.bucketEndUtc(aggBuckets[aggBuckets.length - 1]);

    const classes = await this.prisma.class.findMany({
      where: { teamId: { in: teamIds } },
      select: {
        id: true,
        className: true,
        billingMode: true,
      },
    });
    const classMeta = new Map(
      classes.map((c) => [
        c.id,
        {
          className: c.className,
          billingMode: c.billingMode as BillingMode,
        },
      ]),
    );
    const hasPostpaid = classes.some(
      (c) => c.billingMode === "POSTPAID" || c.billingMode === "BOTH",
    );

    // 후불 청구가 생성한 Payment 는 선불 집계에서 제외한다 (BOTH 모드 이중카운트 방지).
    const ppPaymentRows =
      await this.prisma.monthlyPostpaidBillingLine.findMany({
        where: {
          paymentId: { not: null },
          billing: { class: { teamId: { in: teamIds } } },
        },
        select: { paymentId: true },
      });
    const ppPaymentIds = ppPaymentRows
      .map((r) => r.paymentId)
      .filter((id): id is string => id !== null);

    // ── 선불 수납 ──
    const prepaidByBucket = new Map<string, number>();
    const prepaidByClassPeriod = new Map<string, number>();
    const prepaidPayments = await this.prisma.payment.findMany({
      where: {
        paymentStatus: "completed",
        deletedAt: null,
        completedAt: { gte: rangeStart, lte: rangeEnd },
        productId: { not: null },
        product: {
          class: {
            teamId: { in: teamIds },
            billingMode: { not: "POSTPAID" },
          },
        },
        ...(ppPaymentIds.length > 0 ? { id: { notIn: ppPaymentIds } } : {}),
      },
      select: {
        amount: true,
        completedAt: true,
        product: { select: { class: { select: { id: true } } } },
      },
    });
    for (const p of prepaidPayments) {
      if (!p.completedAt) continue;
      const ym = this.kstYearMonth(p.completedAt);
      const classId = p.product?.class?.id;
      const amount = Number(p.amount);
      prepaidByBucket.set(ym, (prepaidByBucket.get(ym) ?? 0) + amount);
      if (classId && periodBucketSet.has(ym)) {
        prepaidByClassPeriod.set(
          classId,
          (prepaidByClassPeriod.get(classId) ?? 0) + amount,
        );
      }
    }

    // ── 후불 청구/수납/미수 ──
    const postpaidPaidByBucket = new Map<string, number>();
    const postpaidByClassPeriod = new Map<string, number>();
    let ppBilledPeriod = 0;
    let ppCollectedPeriod = 0;
    let ppOutstandingPeriod = 0;
    const ppLines = await this.prisma.monthlyPostpaidBillingLine.findMany({
      where: {
        billing: {
          yearMonth: { in: aggBuckets },
          class: { teamId: { in: teamIds } },
        },
      },
      select: {
        amount: true,
        paymentStatus: true,
        billing: { select: { yearMonth: true, classId: true } },
      },
    });
    for (const line of ppLines) {
      const ym = line.billing.yearMonth;
      const classId = line.billing.classId;
      const amount = Number(line.amount);
      const isPaid = line.paymentStatus === "paid";
      if (isPaid) {
        postpaidPaidByBucket.set(
          ym,
          (postpaidPaidByBucket.get(ym) ?? 0) + amount,
        );
        if (periodBucketSet.has(ym)) {
          postpaidByClassPeriod.set(
            classId,
            (postpaidByClassPeriod.get(classId) ?? 0) + amount,
          );
        }
      }
      if (periodBucketSet.has(ym)) {
        ppBilledPeriod += amount;
        if (isPaid) ppCollectedPeriod += amount;
        else ppOutstandingPeriod += amount;
      }
    }

    // ── 현재 미수금 (기간 무관 pending 합) + 이전 기간 미수 (정산월 < 기간 시작) ──
    const outstandingRows =
      await this.prisma.monthlyPostpaidBillingLine.findMany({
        where: {
          paymentStatus: "pending",
          billing: { class: { teamId: { in: teamIds } } },
        },
        select: { amount: true, billing: { select: { yearMonth: true } } },
      });
    let outstanding = 0;
    let outstandingPrevious = 0;
    for (const r of outstandingRows) {
      const amt = Number(r.amount);
      outstanding += amt;
      // 'YYYY-MM' 문자열 비교는 시간순과 일치
      if (r.billing.yearMonth < periodStartBucket) outstandingPrevious += amt;
    }

    // ── series ──
    const series: RevenueSeriesPoint[] = seriesBuckets.map((bucket) => ({
      bucket,
      label: this.monthLabel(bucket),
      prepaid: prepaidByBucket.get(bucket) ?? 0,
      postpaid: postpaidPaidByBucket.get(bucket) ?? 0,
      isCurrent: scope === RevenueScope.MONTH && bucket === anchor,
    }));

    // ── Hero ──
    const periodPrepaid = this.sumBucketSet(prepaidByBucket, periodBucketSet);
    const periodPostpaid = this.sumBucketSet(
      postpaidPaidByBucket,
      periodBucketSet,
    );
    const prevPrepaid = this.sumBucketSet(prepaidByBucket, prevBucketSet);
    const prevPostpaid = this.sumBucketSet(postpaidPaidByBucket, prevBucketSet);
    const totalRevenue = periodPrepaid + periodPostpaid;
    const prevTotal = prevPrepaid + prevPostpaid;
    const deltaAmount = totalRevenue - prevTotal;
    const deltaRate =
      prevTotal > 0 ? Math.round((deltaAmount / prevTotal) * 100) : null;

    const hero: RevenueHero = {
      totalRevenue,
      prepaidRevenue: periodPrepaid,
      postpaidRevenue: periodPostpaid,
      deltaAmount,
      deltaRate,
      outstanding,
    };

    // ── classRevenue ──
    const classRevenue: RevenueClassLine[] = classes
      .map((c) => {
        const prepaid = prepaidByClassPeriod.get(c.id) ?? 0;
        const postpaid = postpaidByClassPeriod.get(c.id) ?? 0;
        return {
          classId: c.id,
          className: classMeta.get(c.id)?.className ?? "",
          billingMode: c.billingMode as BillingMode,
          prepaid,
          postpaid,
          total: prepaid + postpaid,
        };
      })
      .filter((line) => line.total > 0)
      .sort((a, b) => b.total - a.total);

    // ── postpaidStatus ──
    const postpaidStatus: PostpaidStatus = {
      hasPostpaid,
      billed: ppBilledPeriod,
      collected: ppCollectedPeriod,
      outstanding: ppOutstandingPeriod,
      outstandingPrevious,
      periodLabel,
    };

    // ── 회원 ──
    const members = await this.prisma.teamMember.findMany({
      where: { teamId: { in: teamIds }, approvalStatus: "approved" },
      select: { joinedAt: true, leftAt: true },
    });
    const now = new Date();
    const memberTrend: RevenueMemberTrendPoint[] = seriesBuckets.map(
      (bucket) => {
        const bucketEnd = this.bucketEndUtc(bucket);
        let joined = 0;
        let left = 0;
        let total = 0;
        for (const m of members) {
          if (this.kstYearMonth(m.joinedAt) === bucket) joined += 1;
          if (m.leftAt && this.kstYearMonth(m.leftAt) === bucket) left += 1;
          if (
            m.joinedAt <= bucketEnd &&
            (m.leftAt === null || m.leftAt > bucketEnd)
          ) {
            total += 1;
          }
        }
        return { month: bucket, label: this.monthLabel(bucket), joined, left, total };
      },
    );
    let totalMembers = 0;
    let newMembers = 0;
    for (const m of members) {
      if (m.joinedAt <= now && (m.leftAt === null || m.leftAt > now)) {
        totalMembers += 1;
      }
      if (periodBucketSet.has(this.kstYearMonth(m.joinedAt))) newMembers += 1;
    }

    return {
      scope: scope === RevenueScope.MONTH ? "month" : "year",
      anchor,
      periodLabel,
      hasManagedTeams: true,
      hero,
      series,
      classRevenue,
      postpaidStatus,
      memberSummary: { totalMembers, newMembers },
      memberTrend,
    };
  }

  private async resolveManagedTeamIds(user: {
    id: string;
    userType: string;
  }): Promise<string[]> {
    const isAdmin = user.userType === "ADMIN" || isAdminRole(user.userType);
    if (isAdmin) {
      const teams = await this.prisma.team.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      return teams.map((t) => t.id);
    }

    // SoT: getDirectorPaymentSummary 와 동일 — TeamMember(approved, 관리역할)로만
    //  운영 팀 결정. 레거시 Team.coachId FK 오염 의존 제거.
    const memberTeams = await this.prisma.teamMember.findMany({
      where: {
        userId: user.id,
        approvalStatus: "approved",
        leftAt: null,
        roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
      },
      select: { teamId: true },
    });
    const managedTeamIds = [...new Set(memberTeams.map((m) => m.teamId))];
    if (managedTeamIds.length === 0) return [];
    const activeTeams = await this.prisma.team.findMany({
      where: { id: { in: managedTeamIds }, isActive: true },
      select: { id: true },
    });
    return activeTeams.map((t) => t.id);
  }

  private assertScopeAnchor(scope: RevenueScope, anchor: string): void {
    const isMonth = /^\d{4}-\d{2}$/.test(anchor);
    const isYear = /^\d{4}$/.test(anchor);
    if (scope === RevenueScope.MONTH && !isMonth) {
      throw new BadRequestException(
        "월간 스코프의 anchor 는 'YYYY-MM' 형식이어야 합니다.",
      );
    }
    if (scope === RevenueScope.YEAR && !isYear) {
      throw new BadRequestException(
        "연간 스코프의 anchor 는 'YYYY' 형식이어야 합니다.",
      );
    }
  }

  private yearOf(anchor: string): number {
    return Number(anchor.slice(0, 4));
  }

  private buildSeriesBuckets(scope: RevenueScope, anchor: string): string[] {
    if (scope === RevenueScope.MONTH) {
      return this.monthsBack(anchor, 6);
    }
    return this.buildYearBuckets(this.yearOf(anchor));
  }

  private buildPeriodBuckets(scope: RevenueScope, anchor: string): string[] {
    if (scope === RevenueScope.MONTH) return [anchor];
    return this.buildYearBuckets(this.yearOf(anchor));
  }

  private buildPrevPeriodBuckets(scope: RevenueScope, anchor: string): string[] {
    if (scope === RevenueScope.MONTH) return [this.addMonths(anchor, -1)];
    return this.buildYearBuckets(this.yearOf(anchor) - 1);
  }

  private buildYearBuckets(year: number): string[] {
    return Array.from(
      { length: 12 },
      (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`,
    );
  }

  private monthsBack(anchorYm: string, count: number): string[] {
    const buckets: string[] = [];
    for (let i = count - 1; i >= 0; i--) {
      buckets.push(this.addMonths(anchorYm, -i));
    }
    return buckets;
  }

  private addMonths(anchorYm: string, delta: number): string {
    const year = Number(anchorYm.slice(0, 4));
    const month = Number(anchorYm.slice(5, 7));
    const base = new Date(Date.UTC(year, month - 1 + delta, 1));
    return `${base.getUTCFullYear()}-${String(
      base.getUTCMonth() + 1,
    ).padStart(2, "0")}`;
  }

  /** UTC 저장 시각을 KST 기준 'YYYY-MM' 버킷 키로 변환. */
  private kstYearMonth(date: Date): string {
    const k = new Date(date.getTime() + KST_OFFSET_MS);
    return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(
      2,
      "0",
    )}`;
  }

  /** 버킷(YYYY-MM) KST 1일 00:00 의 UTC 시각. */
  private bucketStartUtc(ym: string): Date {
    const year = Number(ym.slice(0, 4));
    const month = Number(ym.slice(5, 7));
    return new Date(Date.UTC(year, month - 1, 1) - KST_OFFSET_MS);
  }

  /** 버킷(YYYY-MM) KST 말일 23:59:59.999 의 UTC 시각. */
  private bucketEndUtc(ym: string): Date {
    const year = Number(ym.slice(0, 4));
    const month = Number(ym.slice(5, 7));
    return new Date(Date.UTC(year, month, 1) - KST_OFFSET_MS - 1);
  }

  private sumBucketSet(map: Map<string, number>, keys: Set<string>): number {
    let sum = 0;
    for (const key of keys) sum += map.get(key) ?? 0;
    return sum;
  }

  private monthLabel(ym: string): string {
    return `${Number(ym.slice(5, 7))}월`;
  }

  private periodLabel(scope: RevenueScope, anchor: string): string {
    if (scope === RevenueScope.MONTH) {
      return `${anchor.slice(0, 4)}년 ${Number(anchor.slice(5, 7))}월`;
    }
    return `${anchor.slice(0, 4)}년`;
  }

  private emptyResponse(
    scope: RevenueScope,
    anchor: string,
    periodLabel: string,
  ): DirectorRevenueResponse {
    const seriesBuckets = this.buildSeriesBuckets(scope, anchor);
    const zeroSeries: RevenueSeriesPoint[] = seriesBuckets.map((bucket) => ({
      bucket,
      label: this.monthLabel(bucket),
      prepaid: 0,
      postpaid: 0,
      isCurrent: scope === RevenueScope.MONTH && bucket === anchor,
    }));
    const zeroTrend: RevenueMemberTrendPoint[] = seriesBuckets.map((bucket) => ({
      month: bucket,
      label: this.monthLabel(bucket),
      joined: 0,
      left: 0,
      total: 0,
    }));
    return {
      scope: scope === RevenueScope.MONTH ? "month" : "year",
      anchor,
      periodLabel,
      hasManagedTeams: false,
      hero: {
        totalRevenue: 0,
        prepaidRevenue: 0,
        postpaidRevenue: 0,
        deltaAmount: 0,
        deltaRate: null,
        outstanding: 0,
      },
      series: zeroSeries,
      classRevenue: [],
      postpaidStatus: {
        hasPostpaid: false,
        billed: 0,
        collected: 0,
        outstanding: 0,
        outstandingPrevious: 0,
        periodLabel,
      },
      memberSummary: { totalMembers: 0, newMembers: 0 },
      memberTrend: zeroTrend,
    };
  }
}
