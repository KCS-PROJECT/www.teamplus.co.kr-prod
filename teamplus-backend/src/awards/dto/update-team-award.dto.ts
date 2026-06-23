import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, IsOptional, IsIn, MaxLength } from "class-validator";

const TEAM_AWARD_TYPES = [
  "champion",
  "runner_up",
  "third_place",
  "league_winner",
  "fair_play",
  "best_team",
  "special",
] as const;

export class UpdateTeamAwardDto {
  @ApiPropertyOptional({ description: "수상명" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  awardName?: string;

  @ApiPropertyOptional({ description: "수상 유형", enum: TEAM_AWARD_TYPES })
  @IsOptional()
  @IsString()
  @IsIn(TEAM_AWARD_TYPES)
  awardType?: string;

  @ApiPropertyOptional({ description: "수상 설명" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: "수여자" })
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
