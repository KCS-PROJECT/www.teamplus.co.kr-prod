import { IsOptional, IsString, IsNumberString } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

/**
 * 승인 목록 조회 쿼리 DTO (pending / approved / rejected)
 */
export class QueryApprovalDto {
  @ApiPropertyOptional({
    example: "club-uuid",
    description: "클럽 ID 필터",
  })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({ example: "1", description: "페이지 번호 (1부터)" })
  @IsOptional()
  @IsNumberString({}, { message: "페이지 번호는 숫자여야 합니다." })
  page?: string;

  @ApiPropertyOptional({
    example: "20",
    description: "페이지 크기 (기본 20)",
  })
  @IsOptional()
  @IsNumberString({}, { message: "페이지 크기는 숫자여야 합니다." })
  pageSize?: string;
}

/**
 * 승인 로그 조회 쿼리 DTO
 */
export class QueryApprovalLogDto {
  @ApiPropertyOptional({
    example: "member-uuid",
    description: "특정 회원(ClubMember) ID로 필터",
  })
  @IsOptional()
  @IsString()
  memberId?: string;

  @ApiPropertyOptional({
    example: "club-uuid",
    description: "클럽 ID 필터",
  })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({ example: "1", description: "페이지 번호 (1부터)" })
  @IsOptional()
  @IsNumberString({}, { message: "페이지 번호는 숫자여야 합니다." })
  page?: string;

  @ApiPropertyOptional({
    example: "20",
    description: "페이지 크기 (기본 20)",
  })
  @IsOptional()
  @IsNumberString({}, { message: "페이지 크기는 숫자여야 합니다." })
  pageSize?: string;
}
