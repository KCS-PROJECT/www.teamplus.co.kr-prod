import { IsOptional, IsString, IsInt, Min, Max, IsEnum } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";

export enum MemberApprovalStatusFilter {
  ALL = "all",
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
}

export enum UserTypeFilter {
  ALL = "all",
  PARENT = "PARENT",
  COACH = "COACH",
  CHILD = "CHILD",
}

export class AdminMemberQueryDto {
  @ApiPropertyOptional({
    description: "클럽 ID로 필터링",
    example: "club-uuid",
  })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({
    description: "사용자 유형 필터",
    enum: UserTypeFilter,
    default: UserTypeFilter.ALL,
  })
  @IsOptional()
  @IsEnum(UserTypeFilter)
  userType?: UserTypeFilter;

  @ApiPropertyOptional({
    description: "승인 상태 필터",
    enum: MemberApprovalStatusFilter,
    default: MemberApprovalStatusFilter.ALL,
  })
  @IsOptional()
  @IsEnum(MemberApprovalStatusFilter)
  approvalStatus?: MemberApprovalStatusFilter;

  @ApiPropertyOptional({
    description: "검색어 (이름, 이메일, 전화번호)",
    example: "김철수",
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: "페이지 번호 (1부터 시작)",
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: "페이지 크기",
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
