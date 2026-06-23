import { IsOptional, IsString, MinLength, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * 매치 취소 DTO.
 *
 * `POST /api/v1/matches/:id/cancel` 에서 사용.
 *
 * - `reason` 은 선택값이지만, 전달 시 2~500자 제약 검증
 * - 기존 승인 + 결제 완료(paid) 신청자는 환불 대기 상태(`refunded`)로 전환됨
 * - 취소 이후 `cancelledAt`/`cancelledReason` 필드가 매치에 기록됨
 */
export class CancelMatchDto {
  @ApiProperty({
    description: "매치 취소 사유 (선택)",
    required: false,
    minLength: 2,
    maxLength: 500,
    example: "빙상장 일정 취소로 인한 매치 취소",
  })
  @IsOptional()
  @IsString({ message: "취소 사유는 문자열이어야 합니다." })
  @MinLength(2, { message: "취소 사유는 최소 2자 이상 입력해주세요." })
  @MaxLength(500, {
    message: "취소 사유는 최대 500자까지 입력 가능합니다.",
  })
  reason?: string;
}
