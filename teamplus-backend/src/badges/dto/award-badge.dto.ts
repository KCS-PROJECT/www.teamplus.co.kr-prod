import { IsString, IsOptional, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class AwardBadgeDto {
  @ApiProperty({ description: "뱃지를 수여할 자녀 User ID" })
  @IsString()
  childId!: string;

  @ApiPropertyOptional({ description: "수여 이유 (선택)" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  earnedReason?: string;
}
