import {
  IsNotEmpty,
  IsArray,
  ArrayMinSize,
  IsString,
  MinLength,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * 일괄 승인 DTO
 */
export class BulkApproveDto {
  @ApiProperty({
    example: ["member-uuid-1", "member-uuid-2"],
    description: "승인할 회원(ClubMember) ID 배열",
    type: [String],
  })
  @IsNotEmpty({ message: "회원 ID 목록은 필수입니다." })
  @IsArray({ message: "회원 ID 목록은 배열이어야 합니다." })
  @ArrayMinSize(1, { message: "최소 1명 이상의 회원을 선택해주세요." })
  @IsString({ each: true, message: "회원 ID는 문자열이어야 합니다." })
  ids!: string[];
}

/**
 * 일괄 거절 DTO
 */
export class BulkRejectDto {
  @ApiProperty({
    example: ["member-uuid-1", "member-uuid-2"],
    description: "거절할 회원(ClubMember) ID 배열",
    type: [String],
  })
  @IsNotEmpty({ message: "회원 ID 목록은 필수입니다." })
  @IsArray({ message: "회원 ID 목록은 배열이어야 합니다." })
  @ArrayMinSize(1, { message: "최소 1명 이상의 회원을 선택해주세요." })
  @IsString({ each: true, message: "회원 ID는 문자열이어야 합니다." })
  ids!: string[];

  @ApiProperty({
    example: "서류 미비로 인한 일괄 거절",
    description: "거절 사유 (필수)",
  })
  @IsNotEmpty({ message: "거절 사유는 필수입니다." })
  @IsString({ message: "거절 사유는 문자열이어야 합니다." })
  @MinLength(2, { message: "거절 사유는 최소 2자 이상이어야 합니다." })
  reason!: string;
}
