import {
  IsNotEmpty,
  IsString,
  IsArray,
  IsOptional,
  ArrayMinSize,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ApproveMemberDto {
  @ApiPropertyOptional({
    description: "승인 메모 (선택)",
    example: "서류 확인 완료",
  })
  @IsOptional()
  @IsString()
  note?: string;
}

export class RejectMemberDto {
  @ApiProperty({
    description: "거절 사유",
    example: "제출 서류 미비",
  })
  @IsNotEmpty({ message: "거절 사유는 필수입니다." })
  @IsString()
  reason!: string;
}

export class BulkApproveMembersDto {
  @ApiProperty({
    description: "승인할 회원 ID 목록",
    example: ["member_id_1", "member_id_2", "member_id_3"],
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1, { message: "최소 1명 이상의 회원 ID가 필요합니다." })
  @IsString({ each: true })
  memberIds!: string[];

  @ApiPropertyOptional({
    description: "일괄 승인 메모 (선택)",
    example: "일괄 승인 처리",
  })
  @IsOptional()
  @IsString()
  note?: string;
}

export class BulkRejectMembersDto {
  @ApiProperty({
    description: "거절할 회원 ID 목록",
    example: ["member_id_1", "member_id_2"],
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1, { message: "최소 1명 이상의 회원 ID가 필요합니다." })
  @IsString({ each: true })
  memberIds!: string[];

  @ApiProperty({
    description: "일괄 거절 사유",
    example: "서류 미비로 인한 일괄 거절",
  })
  @IsNotEmpty({ message: "거절 사유는 필수입니다." })
  @IsString()
  reason!: string;
}

export class UpdateMemberStatusDto {
  @ApiProperty({
    description: "변경할 상태",
    example: "approved",
    enum: ["pending", "approved", "rejected", "suspended"],
  })
  @IsNotEmpty({ message: "상태는 필수입니다." })
  @IsString()
  status!: string;

  @ApiPropertyOptional({
    description: "상태 변경 사유",
    example: "관리자 직접 승인",
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
