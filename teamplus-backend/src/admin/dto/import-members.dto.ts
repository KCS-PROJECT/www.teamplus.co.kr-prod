import {
  IsString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsNotEmpty,
  Matches,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { UserType } from "@prisma/client";

/**
 * 엑셀 회원 일괄 등록 시 각 행의 데이터 구조
 */
export class ImportMemberRowDto {
  @ApiProperty({ description: "이름", example: "길동" })
  @IsString({ message: "이름은 문자열이어야 합니다." })
  @IsNotEmpty({ message: "이름은 필수입니다." })
  firstName!: string;

  @ApiProperty({ description: "성", example: "홍" })
  @IsString({ message: "성은 문자열이어야 합니다." })
  @IsNotEmpty({ message: "성은 필수입니다." })
  lastName!: string;

  @ApiProperty({ description: "이메일", example: "user@teamplus.com" })
  @IsEmail({}, { message: "유효한 이메일 주소를 입력해주세요." })
  @IsNotEmpty({ message: "이메일은 필수입니다." })
  email!: string;

  @ApiProperty({ description: "전화번호", example: "010-1234-5678" })
  @IsString({ message: "전화번호는 문자열이어야 합니다." })
  @IsNotEmpty({ message: "전화번호는 필수입니다." })
  @Matches(/^01[016789]-?\d{3,4}-?\d{4}$/, {
    message: "올바른 전화번호 형식이 아닙니다. (예: 010-1234-5678)",
  })
  phone!: string;

  @ApiProperty({
    description: "회원 유형",
    enum: ["PARENT", "TEEN", "CHILD", "COACH", "DIRECTOR"],
    example: "PARENT",
  })
  @IsEnum(UserType, {
    message:
      "회원 유형은 PARENT, TEEN, CHILD, COACH, DIRECTOR 중 하나여야 합니다.",
  })
  @IsNotEmpty({ message: "회원 유형은 필수입니다." })
  userType!: UserType;

  @ApiPropertyOptional({
    description: "클럽 ID (소속 클럽)",
    example: "club-uuid",
  })
  @IsString({ message: "클럽 ID는 문자열이어야 합니다." })
  @IsOptional()
  teamId?: string;

  @ApiPropertyOptional({
    description: "생년월일 (YYYY-MM-DD)",
    example: "2015-03-15",
  })
  @IsString({ message: "생년월일은 문자열이어야 합니다." })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "생년월일은 YYYY-MM-DD 형식이어야 합니다.",
  })
  birthDate?: string;

  @ApiPropertyOptional({ description: "성별 (M/F)", example: "M" })
  @IsString({ message: "성별은 문자열이어야 합니다." })
  @IsOptional()
  @Matches(/^[MF]$/, { message: "성별은 M 또는 F여야 합니다." })
  gender?: string;

  @ApiPropertyOptional({ description: "특이사항/메모" })
  @IsString({ message: "메모는 문자열이어야 합니다." })
  @IsOptional()
  note?: string;
}
