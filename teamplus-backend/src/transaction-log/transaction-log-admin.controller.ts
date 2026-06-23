/**
 * TransactionLogAdminController (2026-06-08)
 *
 * admin "시스템관리 > 로그 > 거래로그" 조회 API.
 * 라우트: GET /api/v1/admin/system/logs/transactions(목록) · /summary(요약) · /:requestId(상세)
 * 가드: JWT + RolesGuard. @Roles("SYSTEM") → isAdminRole(ADMIN/SYSTEM/OPER) 자동 통과(admin 전용).
 */

import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import {
  TransactionLogQueryService,
  TxListParams,
} from "./transaction-log-query.service";

const SUMMARY_DEFAULT_RANGE_MS = 7 * 24 * 60 * 60 * 1000; // 최근 7일

function parseDate(v?: string): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

@ApiTags("admin-transaction-logs")
@Controller("api/v1/admin/system/logs/transactions")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("SYSTEM")
export class TransactionLogAdminController {
  constructor(private readonly query: TransactionLogQueryService) {}

  @Get("summary")
  @ApiOperation({ summary: "거래로그 요약 통계 (건수·성공률·응답시간·Top N·platform별)" })
  @ApiQuery({ name: "from", required: false, type: String })
  @ApiQuery({ name: "to", required: false, type: String })
  async getSummary(@Query("from") from?: string, @Query("to") to?: string) {
    const fromDate =
      parseDate(from) ?? new Date(Date.now() - SUMMARY_DEFAULT_RANGE_MS);
    return this.query.getSummary(fromDate, parseDate(to));
  }

  @Get(":requestId")
  @ApiOperation({ summary: "거래로그 상세 (요청/응답 헤더·body 포함)" })
  async getDetail(@Param("requestId") requestId: string) {
    return this.query.findDetail(requestId);
  }

  @Get()
  @ApiOperation({ summary: "거래로그 목록 (필터+정렬+페이지네이션)" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "result", required: false, enum: ["SUCCESS", "FAIL", "ERROR"] })
  @ApiQuery({ name: "platform", required: false, type: String })
  @ApiQuery({ name: "method", required: false, type: String })
  @ApiQuery({ name: "httpStatus", required: false, type: Number })
  @ApiQuery({ name: "userId", required: false, type: String })
  @ApiQuery({ name: "userRole", required: false, type: String })
  @ApiQuery({ name: "userEmail", required: false, type: String })
  @ApiQuery({ name: "path", required: false, type: String })
  @ApiQuery({ name: "viewId", required: false, type: String })
  @ApiQuery({ name: "requestId", required: false, type: String })
  @ApiQuery({ name: "from", required: false, type: String })
  @ApiQuery({ name: "to", required: false, type: String })
  @ApiQuery({ name: "sort", required: false, enum: ["occurredAt", "durationMs", "httpStatus"] })
  @ApiQuery({ name: "order", required: false, enum: ["asc", "desc"] })
  async getList(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("result") result?: string,
    @Query("platform") platform?: string,
    @Query("method") method?: string,
    @Query("httpStatus") httpStatus?: string,
    @Query("userId") userId?: string,
    @Query("userRole") userRole?: string,
    @Query("userEmail") userEmail?: string,
    @Query("path") path?: string,
    @Query("viewId") viewId?: string,
    @Query("requestId") requestId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("sort") sort?: string,
    @Query("order") order?: string,
  ) {
    const allowedSort = ["occurredAt", "durationMs", "httpStatus"];
    const params: TxListParams = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      result: result || undefined,
      platform: platform || undefined,
      method: method || undefined,
      httpStatus: httpStatus ? parseInt(httpStatus, 10) : undefined,
      userId: userId || undefined,
      userRole: userRole || undefined,
      userEmail: userEmail || undefined,
      path: path || undefined,
      viewId: viewId || undefined,
      requestId: requestId || undefined,
      from: parseDate(from),
      to: parseDate(to),
      sort: (allowedSort.includes(sort ?? "")
        ? sort
        : "occurredAt") as TxListParams["sort"],
      order: order === "asc" ? "asc" : "desc",
    };
    return this.query.findList(params);
  }
}
