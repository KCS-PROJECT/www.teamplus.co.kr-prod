import {
  IsString,
  IsIn,
  IsOptional,
  MinLength,
  MaxLength,
  ValidateIf,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * 매치 신청자 상태 변경 DTO.
 *
 * 주최자(매니저) 또는 ADMIN/DIRECTOR 호출 가능.
 *
 * - `status=approved`: `rejectionReason`은 무시되고 `null`로 초기화됨
 * - `status=rejected`: `rejectionReason`이 선택값이지만, 전달 시 2~500자 검증.
 *   값이 없으면 `null`로 저장됨 (서비스에서 처리)
 */
export class UpdateApplicantStatusDto {
  @ApiProperty({
    description: "신청자 상태",
    enum: ["approved", "rejected"],
    example: "approved",
  })
  @IsString()
  @IsIn(["approved", "rejected"], {
    message: "status는 approved 또는 rejected 여야 합니다.",
  })
  status!: "approved" | "rejected";

  @ApiProperty({
    description:
      "거절 사유 (status=rejected 일 때만 의미 있음). 생략 시 null로 저장됩니다.",
    required: false,
    minLength: 2,
    maxLength: 500,
    example: "레벨 미달",
  })
  @IsOptional()
  @ValidateIf((o: UpdateApplicantStatusDto) => o.rejectionReason !== undefined)
  @IsString({ message: "거절 사유는 문자열이어야 합니다." })
  @MinLength(2, { message: "거절 사유는 최소 2자 이상 입력해주세요." })
  @MaxLength(500, { message: "거절 사유는 최대 500자까지 입력 가능합니다." })
  rejectionReason?: string;
}
