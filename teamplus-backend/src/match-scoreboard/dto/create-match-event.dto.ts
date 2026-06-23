import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsBoolean,
  Min,
  Max,
  Matches,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateMatchEventDto {
  @ApiProperty({ description: "피리어드 번호 (1-5)", example: 1 })
  @IsInt()
  @Min(1)
  @Max(5)
  periodNumber!: number;

  @ApiProperty({
    description: "이벤트 시간 (MM:SS 형식)",
    example: "12:34",
  })
  @IsString()
  @Matches(/^\d{1,2}:\d{2}$/, {
    message: "이벤트 시간은 MM:SS 형식이어야 합니다.",
  })
  eventTime!: string;

  @ApiProperty({
    description: "이벤트 유형",
    enum: [
      "goal",
      "assist",
      "penalty",
      "shot",
      "save",
      "timeout",
      "period_start",
      "period_end",
    ],
    example: "goal",
  })
  @IsString()
  @IsNotEmpty()
  eventType!: string;

  @ApiPropertyOptional({ description: "팀 ID" })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({ description: "선수 TeamRoster ID" })
  @IsOptional()
  @IsString()
  playerId?: string;

  @ApiPropertyOptional({ description: "어시스트 선수 1 TeamRoster ID" })
  @IsOptional()
  @IsString()
  assistPlayer1Id?: string;

  @ApiPropertyOptional({ description: "어시스트 선수 2 TeamRoster ID" })
  @IsOptional()
  @IsString()
  assistPlayer2Id?: string;

  @ApiPropertyOptional({
    description: "페널티 유형",
    enum: ["minor", "major", "misconduct", "game_misconduct"],
  })
  @IsOptional()
  @IsString()
  penaltyType?: string;

  @ApiPropertyOptional({ description: "페널티 시간 (분)" })
  @IsOptional()
  @IsInt()
  @Min(0)
  penaltyMinutes?: number;

  @ApiPropertyOptional({ description: "설명" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: "결승골 여부", default: false })
  @IsOptional()
  @IsBoolean()
  isGameWinner?: boolean;

  @ApiPropertyOptional({ description: "파워플레이 골 여부", default: false })
  @IsOptional()
  @IsBoolean()
  isPowerPlay?: boolean;

  @ApiPropertyOptional({ description: "쇼트핸디드 골 여부", default: false })
  @IsOptional()
  @IsBoolean()
  isShortHanded?: boolean;
}

export class UpdateMatchStatusDto {
  @ApiProperty({
    description: "경기 상태",
    enum: [
      "scheduled",
      "warmup",
      "in_progress",
      "intermission",
      "completed",
      "postponed",
      "cancelled",
    ],
    example: "in_progress",
  })
  @IsString()
  @IsNotEmpty()
  status!: string;

  @ApiPropertyOptional({ description: "현재 피리어드 (1-5)" })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  currentPeriod?: number;
}
