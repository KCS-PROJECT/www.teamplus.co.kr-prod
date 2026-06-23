import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsOptional,
  IsDateString,
  IsIn,
  MaxLength,
} from "class-validator";

const TEAM_AWARD_TYPES = [
  "champion",
  "runner_up",
  "third_place",
  "league_winner",
  "fair_play",
  "best_team",
  "special",
] as const;

export class CreateTeamAwardDto {
  @ApiProperty({ description: "팀 ID (Team.id)" })
  @IsString()
  teamId!: string;

  @ApiProperty({ description: "수상명", example: "2025-2026 시즌 우승" })
  @IsString()
  @MaxLength(200)
  awardName!: string;

  @ApiProperty({
    description: "수상 유형",
    enum: TEAM_AWARD_TYPES,
    example: "champion",
  })
  @IsString()
  @IsIn(TEAM_AWARD_TYPES)
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

  @ApiPropertyOptional({ description: "시즌", example: "2025-2026" })
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
