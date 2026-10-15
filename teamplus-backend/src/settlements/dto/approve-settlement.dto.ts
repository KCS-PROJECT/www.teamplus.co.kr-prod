import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/** 한 번에 승인할 수 있는 정산 수 — 건별로 팀 lock 트랜잭션을 돌리므로 응답 시간을 묶어 둔다. */
export const APPROVE_BATCH_MAX_ITEMS = 50;

export class ApproveSettlementDto {
  @ApiPropertyOptional({
    description: "승인 메모 (선택)",
    example: "정산 내역 검토 완료",
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** 정산 일괄 승인 — POST /api/v1/settlements/approve-batch. 건별 결과를 돌려주고 한 건의 실패가 다른 건을 막지 않는다. */
export class ApproveSettlementsBatchDto {
  @ApiProperty({
    description: `승인할 정산 ID 목록(최대 ${APPROVE_BATCH_MAX_ITEMS}개)`,
    example: ["cuid1", "cuid2"],
  })
  @IsArray()
  @ArrayMinSize(1, { message: "정산을 1건 이상 선택해주세요." })
  @ArrayMaxSize(APPROVE_BATCH_MAX_ITEMS, {
    message: `한 번에 ${APPROVE_BATCH_MAX_ITEMS}건까지 승인할 수 있습니다.`,
  })
  @IsString({ each: true })
  ids!: string[];

  @ApiPropertyOptional({
    description: "승인 메모 (선택, 모든 건에 같은 메모)",
    example: "10월 정산 일괄 승인",
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/**
 * 정산 반려 DTO — 반려 시 사유 필수
 */
export class RejectSettlementDto {
  @ApiProperty({
    description: "반려 사유 (reject 시 필수)",
    example: "금액 불일치로 재검토 필요",
    maxLength: 500,
  })
  @IsString({ message: "반려 사유는 문자열이어야 합니다." })
  @MaxLength(500, { message: "반려 사유는 500자 이내로 입력해주세요." })
  @IsNotEmpty({ message: "반려 사유를 입력해주세요." })
  reason!: string;
}
