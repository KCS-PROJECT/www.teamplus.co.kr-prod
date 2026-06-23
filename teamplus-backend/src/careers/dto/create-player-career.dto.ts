import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsDateString,
  IsIn,
  Min,
  Max,
  MaxLength,
} from "class-validator";

const POSITIONS = [
  "goalie",
  "center",
  "left_wing",
  "right_wing",
  "defense",
] as const;

export class CreatePlayerCareerDto {
  @ApiProperty({ description: "클럽 회원 ID (ClubMember.id)" })
  @IsString()
  memberId!: string;

  @ApiProperty({ description: "소속 팀명", example: "서울 아이스베어스 U-12" })
  @IsString()
  @MaxLength(200)
  teamName!: string;

  @ApiPropertyOptional({
    description: "포지션",
    enum: POSITIONS,
    example: "center",
  })
  @IsOptional()
  @IsString()
  @IsIn(POSITIONS)
  position?: string;

  @ApiPropertyOptional({ description: "등번호", example: 7 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  jerseyNumber?: number;

  @ApiPropertyOptional({
    description: "리그/대회명",
    example: "대한아이스하키협회 유소년 리그",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  leagueName?: string;

  @ApiProperty({ description: "활동 시작일", example: "2024-03-01" })
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional({ description: "활동 종료일 (현재 소속이면 생략)" })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: "현재 소속 여부", default: false })
  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;

  @ApiPropertyOptional({ description: "활동 내용·특이사항" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
