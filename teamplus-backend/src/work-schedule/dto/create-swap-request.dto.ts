import { IsString, IsOptional, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateSwapRequestDto {
  @ApiProperty({ description: "변경 대상 스케줄 ID" })
  @IsString()
  scheduleId!: string;

  @ApiPropertyOptional({ description: "대상 코치 User ID (없으면 오픈 요청)" })
  @IsOptional()
  @IsString()
  targetCoachId?: string;

  @ApiPropertyOptional({ description: "변경 사유" })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
