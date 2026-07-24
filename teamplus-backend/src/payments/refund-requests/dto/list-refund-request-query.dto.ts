import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";

const STATUS_VALUES = [
  "pending",
  "executing",
  "executed",
  "rejected",
  "canceled",
  "execution_failed",
  "all",
] as const;

/**
 * 관리자 목록/대기건수 Query (E2 · E8).
 * 소속 범위 필터는 서버가 저장된 team_id/academy_id 스냅샷 기준으로 강제한다
 * (teamId/academyId 를 임의 지정해도 관리 범위 교집합만 조회 — IDOR 차단).
 */
export class ListRefundRequestQueryDto {
  @ApiPropertyOptional({
    description: "상태 필터. 기본 all(활성+이력 전체).",
    enum: STATUS_VALUES,
    default: "all",
  })
  @IsOptional()
  @IsIn(STATUS_VALUES as unknown as string[])
  status?: (typeof STATUS_VALUES)[number];

  @ApiPropertyOptional({
    description: "스코프 힌트 — team | academy",
    enum: ["team", "academy"],
  })
  @IsOptional()
  @IsIn(["team", "academy"])
  scope?: "team" | "academy";

  @ApiPropertyOptional({ description: "아카데미 필터 (관리 범위 교집합)" })
  @IsOptional()
  @IsString()
  academyId?: string;

  @ApiPropertyOptional({ description: "팀 필터 (관리 범위 교집합)" })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({ description: "페이지 번호 (기본 1)", default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: "페이지당 항목 수 (기본 20)", default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
