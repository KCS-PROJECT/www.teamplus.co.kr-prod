import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsOptional,
  IsDateString,
  IsIn,
  MaxLength,
} from "class-validator";

const AWARD_TYPES = [
  "mvp",
  "best_scorer",
  "best_goalie",
  "most_improved",
  "sportsmanship",
  "skill",
  "attendance",
  "special",
] as const;

export class CreatePlayerAwardDto {
  @ApiProperty({ description: "클럽 회원 ID (ClubMember.id)" })
  @IsString()
  memberId!: string;

  @ApiProperty({ description: "수상명", example: "시즌 MVP" })
  @IsString()
  @MaxLength(200)
  awardName!: string;

  @ApiProperty({
    description: "수상 유형",
    enum: AWARD_TYPES,
    example: "mvp",
  })
  @IsString()
  @IsIn(AWARD_TYPES)
  awardType!: string;

  @ApiPropertyOptional({ description: "수상 설명" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ description: "수상일", example: "2026-03-13" })
  @IsDateString()
  awardedAt!: string;

  @ApiPropertyOptional({ description: "대회 ID (Tournament.id)" })
  @IsOptional()
  @IsString()
  tournamentId?: string;

  @ApiPropertyOptional({ description: "경기 ID (HockeyMatch.id)" })
  @IsOptional()
  @IsString()
  matchId?: string;

  @ApiPropertyOptional({
    description: "시즌",
    example: "2025-2026",
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  season?: string;

  @ApiPropertyOptional({ description: "수여자 (이름 또는 기관명)" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  awardedBy?: string;

  @ApiPropertyOptional({ description: "수상 증서 URL" })
  @IsOptional()
  @IsString()
  certificateUrl?: string;

  @ApiPropertyOptional({ description: "수상 사진 URL" })
  @IsOptional()
  @IsString()
  imageUrl?: string;
}
