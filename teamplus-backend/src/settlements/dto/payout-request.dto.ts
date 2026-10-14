import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsString,
  Matches,
  ValidateNested,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/** 한 번의 요청에 담을 수 있는 정산 수 — 나이스를 건별로 순차 호출하므로 응답 시간을 묶어 둔다. */
export const PAYOUT_REQUEST_MAX_ITEMS = 10;

const PAY_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PAY_DATE_MESSAGE = "지급일은 YYYY-MM-DD 형식이어야 합니다.";

/** 지급 요청 미리보기 — GET /api/v1/settlements/payout-requests/preview. */
export class QueryPayoutRequestPreviewDto {
  @ApiProperty({
    description: "정산 ID 목록(쉼표 구분, 최대 10개)",
    example: "cuid1,cuid2",
  })
  @Transform(({ value }) =>
    typeof value === "string"
      ? value
          .split(",")
          .map((v) => v.trim())
          .filter((v) => v.length > 0)
      : value,
  )
  @IsArray()
  @ArrayMinSize(1, { message: "정산을 1건 이상 선택해주세요." })
  @ArrayMaxSize(PAYOUT_REQUEST_MAX_ITEMS, {
    message: `한 번에 ${PAYOUT_REQUEST_MAX_ITEMS}건까지 요청할 수 있습니다.`,
  })
  @IsString({ each: true })
  settlementIds!: string[];

  @ApiProperty({
    description: "나이스 지급일 (YYYY-MM-DD, KST 달력일)",
    example: "2026-11-16",
  })
  @IsString()
  @Matches(PAY_DATE_PATTERN, { message: PAY_DATE_MESSAGE })
  payDate!: string;
}

export class PayoutRequestItemDto {
  @ApiProperty({ description: "정산 ID" })
  @IsString()
  settlementId!: string;

  @ApiProperty({
    description:
      "미리보기에서 본 팀 정산 계좌의 updatedAt(ISO 8601, 시간대 필수). 그 사이 계좌가 바뀌었으면 그 건만 건너뛴다",
    example: "2026-09-29T05:00:23.402Z",
  })
  @IsISO8601(
    { strict: true },
    { message: "expectedAccountUpdatedAt 은 ISO 8601 형식이어야 합니다." },
  )
  // 시간대 없는 문자열은 서버 시간대로 해석돼 절대 시각이 달라진다.
  @Matches(/(Z|[+-]\d{2}:\d{2})$/, {
    message:
      "expectedAccountUpdatedAt 에는 시간대(Z 또는 ±hh:mm)가 필요합니다.",
  })
  expectedAccountUpdatedAt!: string;
}

/** 지급 요청 실행 — POST /api/v1/settlements/payout-requests. */
export class CreatePayoutRequestsDto {
  @ApiProperty({
    description: "나이스 지급일 (YYYY-MM-DD, KST 달력일)",
    example: "2026-11-16",
  })
  @IsString()
  @Matches(PAY_DATE_PATTERN, { message: PAY_DATE_MESSAGE })
  payDate!: string;

  @ApiProperty({ type: [PayoutRequestItemDto], description: "요청할 정산" })
  @IsArray()
  @ArrayMinSize(1, { message: "정산을 1건 이상 선택해주세요." })
  @ArrayMaxSize(PAYOUT_REQUEST_MAX_ITEMS, {
    message: `한 번에 ${PAYOUT_REQUEST_MAX_ITEMS}건까지 요청할 수 있습니다.`,
  })
  @ValidateNested({ each: true })
  @Type(() => PayoutRequestItemDto)
  items!: PayoutRequestItemDto[];
}

/** 지급 결과 조회(수동) — POST /api/v1/settlements/payout-requests/check. */
export class CheckPayoutResultsDto {
  @ApiProperty({
    description: "결과를 조회할 지급일 (YYYY-MM-DD, KST 달력일)",
    example: "2026-11-16",
  })
  @IsString()
  @Matches(PAY_DATE_PATTERN, { message: PAY_DATE_MESSAGE })
  payDate!: string;
}
