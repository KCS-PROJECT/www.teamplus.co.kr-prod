import {
  IsString,
  IsEmail,
  IsInt,
  IsOptional,
  IsNotEmpty,
  Min,
  Max,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * 엑셀 크레딧 일괄 충전 시 각 행의 데이터 구조
 */
export class ImportCreditRowDto {
  @ApiProperty({ description: "회원 이메일", example: "parent@teamplus.com" })
  @IsEmail({}, { message: "유효한 이메일 주소를 입력해주세요." })
  @IsNotEmpty({ message: "이메일은 필수입니다." })
  email!: string;

  @ApiProperty({ description: "클럽 ID", example: "club-uuid" })
  @IsString({ message: "클럽 ID는 문자열이어야 합니다." })
  @IsNotEmpty({ message: "클럽 ID는 필수입니다." })
  teamId!: string;

  @ApiProperty({ description: "충전 크레딧 수", example: 10 })
  @IsInt({ message: "크레딧 수는 정수여야 합니다." })
  @Min(1, { message: "크레딧은 최소 1 이상이어야 합니다." })
  @Max(999, { message: "크레딧은 최대 999까지 가능합니다." })
  @IsNotEmpty({ message: "크레딧 수는 필수입니다." })
  credits!: number;

  @ApiPropertyOptional({
    description: "만료일 (YYYY-MM-DD), 기본 90일",
    example: "2026-07-05",
  })
  @IsString({ message: "만료일은 문자열이어야 합니다." })
  @IsOptional()
  expiresAt?: string;

  @ApiPropertyOptional({ description: "사유/메모", example: "프로모션 크레딧" })
  @IsString({ message: "사유는 문자열이어야 합니다." })
  @IsOptional()
  reason?: string;
}
