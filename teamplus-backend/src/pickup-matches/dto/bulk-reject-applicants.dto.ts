import {
  IsArray,
  IsString,
  ArrayMinSize,
  ArrayMaxSize,
  MinLength,
  MaxLength,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * 매치 신청자 일괄 거절 DTO.
 *
 * 주최자(매니저) 또는 ADMIN/DIRECTOR가 여러 신청자를 한 번에 거절할 때 사용.
 *
 * 동작:
 * - `applicantIds` 중 해당 매치 소속이 아닌 것은 거부 (service에서 검증)
 * - 이미 `rejected` 또는 `approved` 상태인 것은 skip (카운트로 반환)
 * - 각 거절된 신청자에게 `match_rejected` 알림 발송
 */
export class BulkRejectApplicantsDto {
  @ApiProperty({
    type: [String],
    description: "거절할 신청자 ID 목록 (cuid)",
    example: ["clxxx1", "clxxx2", "clxxx3"],
    minItems: 1,
    maxItems: 100,
  })
  @IsArray({ message: "applicantIds는 배열이어야 합니다." })
  @ArrayMinSize(1, { message: "최소 1명 이상의 신청자를 선택해주세요." })
  @ArrayMaxSize(100, {
    message: "한 번에 최대 100명까지만 일괄 처리할 수 있습니다.",
  })
  @IsString({ each: true, message: "신청자 ID는 문자열이어야 합니다." })
  applicantIds!: string[];

  @ApiProperty({
    description: "거절 사유 (모든 신청자에게 공통 적용)",
    example: "레벨 미달로 인한 거절",
    minLength: 2,
    maxLength: 500,
  })
  @IsString({ message: "거절 사유는 문자열이어야 합니다." })
  @MinLength(2, { message: "거절 사유는 최소 2자 이상 입력해주세요." })
  @MaxLength(500, {
    message: "거절 사유는 최대 500자까지 입력 가능합니다.",
  })
  rejectionReason!: string;
}
