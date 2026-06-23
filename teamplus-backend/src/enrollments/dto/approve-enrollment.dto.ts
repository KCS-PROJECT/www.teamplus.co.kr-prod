import { IsString, IsOptional, MaxLength } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

/**
 * 수강신청 승인 DTO
 *
 * 학부모가 자녀의 수강 요청을 승인할 때 사용
 */
export class ApproveEnrollmentDto {
  @ApiPropertyOptional({
    description: "승인 메모 (선택)",
    example: "열심히 해보자!",
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: "승인 메모는 200자 이하이어야 합니다." })
  note?: string;
}

/**
 * 수강신청 거절 DTO
 *
 * 학부모가 자녀의 수강 요청을 거절할 때 사용
 */
export class RejectEnrollmentDto {
  @ApiPropertyOptional({
    description: "거절 사유",
    example: "이번 달은 시간이 맞지 않아서 다음 달에 신청하자.",
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: "거절 사유는 500자 이하이어야 합니다." })
  reason?: string;
}
