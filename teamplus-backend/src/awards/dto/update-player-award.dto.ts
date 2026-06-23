import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsIn,
  Min,
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

export class UpdatePlayerAwardDto {
  @ApiPropertyOptional({ description: "수상명" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  awardName?: string;

  @ApiPropertyOptional({ description: "수상 유형", enum: AWARD_TYPES })
  @IsOptional()
  @IsString()
  @IsIn(AWARD_TYPES)
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

  @ApiPropertyOptional({ description: "프로필 표시 여부" })
  @IsOptional()
  @IsBoolean()
  isDisplayed?: boolean;

  @ApiPropertyOptional({ description: "표시 순서" })
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}
