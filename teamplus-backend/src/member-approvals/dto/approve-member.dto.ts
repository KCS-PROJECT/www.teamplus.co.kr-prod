import { IsNotEmpty, IsString, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * 개별 회원 거절 DTO
 * - reason 필수 (최소 2자)
 */
export class RejectMemberDto {
  @ApiProperty({
    example: "서류 미비로 인한 가입 거절",
    description: "거절 사유 (필수)",
  })
  @IsNotEmpty({ message: "거절 사유는 필수입니다." })
  @IsString({ message: "거절 사유는 문자열이어야 합니다." })
  @MinLength(2, { message: "거절 사유는 최소 2자 이상이어야 합니다." })
  reason!: string;
}
