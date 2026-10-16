import {
  IsBoolean,
  IsOptional,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Min,
  Max,
} from "class-validator";
import { Transform, Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  SETTLEMENT_STATUS_VALUES,
  SettlementStatus,
} from "../constants/settlement-status.constant";

export const PAYOUT_VIEW_VALUES = ["ready", "blocked"] as const;
export type PayoutViewFilter = (typeof PAYOUT_VIEW_VALUES)[number];

/**
 * 정산 목록 조회 쿼리 DTO
 */
export class QuerySettlementDto {
  @ApiPropertyOptional({
    description: "정산 상태 필터",
    enum: SETTLEMENT_STATUS_VALUES,
  })
  @IsOptional()
  @IsIn(SETTLEMENT_STATUS_VALUES, {
    message: `유효한 정산 상태를 입력해주세요. (${SETTLEMENT_STATUS_VALUES.join("|")})`,
  })
  status?: SettlementStatus;

  @ApiPropertyOptional({
    description: "정산월 (YYYY-MM) — settlementMonth 필터",
    example: "2026-04",
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: "정산월은 YYYY-MM 형식이어야 합니다.",
  })
  month?: string;

  @ApiPropertyOptional({ description: "팀 ID 필터" })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({
    description:
      "true 면 확인 필요 정산만(관리자) — 지급 요청에 needsReview 가 켜졌거나 열린 지급 이상 건이 연결된 정산. status 와 함께 쓰면 AND",
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  needsReview?: boolean;

  @ApiPropertyOptional({
    description:
      "관리자, month 와 status(approved·failed)를 함께 줄 때만 — ready 면 지금 지급 요청할 수 있는 정산만, blocked 면 요청할 수 없는 정산만(payoutBlock 판정). " +
      "주면 응답 meta.payoutCounts 에 그 조건 전체 기준의 건수가 온다",
    enum: PAYOUT_VIEW_VALUES,
  })
  @IsOptional()
  @IsIn(PAYOUT_VIEW_VALUES, {
    message: `payoutView 는 ${PAYOUT_VIEW_VALUES.join("|")} 중 하나여야 합니다.`,
  })
  payoutView?: PayoutViewFilter;

  @ApiPropertyOptional({
    description: "조회 시작일 YYYY-MM-DD (KST 달력일, 생성일 기준)",
    example: "2026-01-01",
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "startDate는 YYYY-MM-DD 형식이어야 합니다.",
  })
  startDate?: string;

  @ApiPropertyOptional({
    description: "조회 종료일 YYYY-MM-DD (KST 달력일, 해당 일 포함)",
    example: "2026-12-31",
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "endDate는 YYYY-MM-DD 형식이어야 합니다.",
  })
  endDate?: string;

  @ApiPropertyOptional({ description: "페이지 번호 (1부터)", default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: "페이지 크기", default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}
