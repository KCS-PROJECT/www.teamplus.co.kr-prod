/**
 * TransactionLogQueryService (2026-06-08)
 *
 * admin 거래로그 조회 — 목록(필터+페이지네이션) · 상세(헤더/body) · 요약 통계.
 * 목록은 payload(JsonB) 컬럼을 제외(select)하여 가볍게 조회, 상세에서만 전체 반환.
 */

import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface TxListParams {
  page: number;
  limit: number;
  result?: string;
  platform?: string;
  method?: string;
  httpStatus?: number;
  userId?: string;
  userRole?: string;
  userEmail?: string;
  path?: string;
  viewId?: string;
  requestId?: string;
  from?: Date;
  to?: Date;
  sort?: "occurredAt" | "durationMs" | "httpStatus";
  order?: "asc" | "desc";
}

/** 목록용 select — 무거운 JsonB payload 제외 */
const LIST_SELECT = {
  id: true,
  requestId: true,
  occurredAt: true,
  method: true,
  path: true,
  httpStatus: true,
  bizSuccess: true,
  result: true,
  errorCode: true,
  durationMs: true,
  userId: true,
  userRole: true,
  userEmail: true,
  platform: true,
  clientVersion: true,
  viewId: true,
  ip: true,
  responseBytes: true,
  truncated: true,
} satisfies Prisma.TransactionLogSelect;

@Injectable()
export class TransactionLogQueryService {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(p: TxListParams): Prisma.TransactionLogWhereInput {
    const where: Prisma.TransactionLogWhereInput = {};
    if (p.result) where.result = p.result;
    if (p.platform) where.platform = p.platform;
    if (p.method) where.method = p.method.toUpperCase();
    if (typeof p.httpStatus === "number" && !Number.isNaN(p.httpStatus)) {
      where.httpStatus = p.httpStatus;
    }
    if (p.userId) where.userId = { contains: p.userId };
    if (p.userRole) where.userRole = p.userRole;
    if (p.userEmail)
      where.userEmail = { contains: p.userEmail, mode: "insensitive" };
    if (p.path) where.path = { contains: p.path, mode: "insensitive" };
    if (p.viewId) where.viewId = { contains: p.viewId, mode: "insensitive" };
    if (p.requestId) where.requestId = { contains: p.requestId };
    if (p.from || p.to) {
      where.occurredAt = {};
      if (p.from) where.occurredAt.gte = p.from;
      if (p.to) where.occurredAt.lte = p.to;
    }
    return where;
  }

  async findList(p: TxListParams): Promise<{
    data: Array<
      Prisma.TransactionLogGetPayload<{ select: typeof LIST_SELECT }> & {
        userName: string | null;
      }
    >;
    total: number;
    page: number;
    limit: number;
  }> {
    const where = this.buildWhere(p);
    const sortField = p.sort ?? "occurredAt";
    const order: Prisma.SortOrder = p.order ?? "desc";
    const page = Math.max(1, p.page);
    const limit = Math.min(200, Math.max(1, p.limit));

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.transactionLog.findMany({
        where,
        orderBy: { [sortField]: order },
        skip: (page - 1) * limit,
        take: limit,
        select: LIST_SELECT,
      }),
      this.prisma.transactionLog.count({ where }),
    ]);

    const data = await this.attachUserNames(rows);
    return { data, total, page, limit };
  }

  /**
   * userId → User(이름/이메일) 배치 조인 (N+1 방지).
   * 저장된 userEmail(세션헤더 기반·일부 누락)보다 정확한 최신 이름·이메일로 보강.
   * "어느 사용자가 거래를 올렸는지"를 목록·상세에서 식별 가능하게 한다.
   */
  private async attachUserNames<
    T extends { userId: string | null; userEmail: string | null },
  >(rows: T[]): Promise<Array<T & { userName: string | null }>> {
    const ids = [
      ...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x)),
    ];
    if (ids.length === 0) {
      return rows.map((r) => ({ ...r, userName: null }));
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const umap = new Map(
      users.map((u) => [
        u.id,
        {
          name: `${u.lastName ?? ""}${u.firstName ?? ""}`.trim() || u.email,
          email: u.email,
        },
      ]),
    );
    return rows.map((r) => {
      const u = r.userId ? umap.get(r.userId) : undefined;
      return {
        ...r,
        userName: u?.name ?? null,
        userEmail: u?.email ?? r.userEmail,
      };
    });
  }

  async findDetail(requestId: string) {
    const log = await this.prisma.transactionLog.findUnique({
      where: { requestId },
    });
    if (!log) return null;
    const [enriched] = await this.attachUserNames([log]);
    return enriched;
  }

  async getSummary(from?: Date, to?: Date) {
    const where: Prisma.TransactionLogWhereInput = {};
    if (from || to) {
      where.occurredAt = {};
      if (from) where.occurredAt.gte = from;
      if (to) where.occurredAt.lte = to;
    }

    const [total, byResult, byPlatform, durationAgg, failTop, slowTop] =
      await Promise.all([
        this.prisma.transactionLog.count({ where }),
        this.prisma.transactionLog.groupBy({
          by: ["result"],
          where,
          _count: { _all: true },
        }),
        this.prisma.transactionLog.groupBy({
          by: ["platform", "result"],
          where,
          _count: { _all: true },
        }),
        this.prisma.transactionLog.aggregate({
          where,
          _avg: { durationMs: true },
          _max: { durationMs: true },
        }),
        this.prisma.transactionLog.groupBy({
          by: ["path"],
          where: { ...where, result: { in: ["FAIL", "ERROR"] } },
          _count: { _all: true },
          orderBy: { _count: { path: "desc" } },
          take: 10,
        }),
        this.prisma.transactionLog.groupBy({
          by: ["path"],
          where,
          _avg: { durationMs: true },
          orderBy: { _avg: { durationMs: "desc" } },
          take: 10,
        }),
      ]);

    const resultCounts = { SUCCESS: 0, FAIL: 0, ERROR: 0 };
    for (const r of byResult) {
      if (r.result in resultCounts) {
        resultCounts[r.result as keyof typeof resultCounts] = r._count._all;
      }
    }

    // platform별 성공률 집계
    const platformMap = new Map<string, { total: number; success: number }>();
    for (const row of byPlatform) {
      const key = row.platform ?? "unknown";
      const entry = platformMap.get(key) ?? { total: 0, success: 0 };
      entry.total += row._count._all;
      if (row.result === "SUCCESS") entry.success += row._count._all;
      platformMap.set(key, entry);
    }
    const platformStats = Array.from(platformMap.entries()).map(
      ([platform, v]) => ({
        platform,
        total: v.total,
        success: v.success,
        successRate:
          v.total > 0 ? Math.round((v.success / v.total) * 1000) / 10 : 0,
      }),
    );

    return {
      total,
      result: resultCounts,
      successRate:
        total > 0 ? Math.round((resultCounts.SUCCESS / total) * 1000) / 10 : 0,
      avgDurationMs: Math.round(durationAgg._avg.durationMs ?? 0),
      maxDurationMs: durationAgg._max.durationMs ?? 0,
      platformStats,
      failTopPaths: failTop.map((f) => ({
        path: f.path,
        count: f._count._all,
      })),
      slowTopPaths: slowTop.map((s) => ({
        path: s.path,
        avgDurationMs: Math.round(s._avg.durationMs ?? 0),
      })),
      range: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
    };
  }
}
