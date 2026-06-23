import {
  IsString,
  IsOptional,
  IsDateString,
  Matches,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateWorkScheduleDto {
  @ApiProperty({ description: "코치 User ID" })
  @IsString()
  coachId!: string;

  @ApiProperty({ description: "클럽 ID" })
  @IsString()
  teamId!: string;

  @ApiPropertyOptional({ description: "연결 수업 ID" })
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiProperty({ description: "스케줄 날짜 (ISO 8601)" })
  @IsDateString()
  scheduleDate!: string;

  @ApiProperty({ description: "시작 시간 (HH:mm)", example: "09:00" })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: "시작 시간은 HH:mm 형식이어야 합니다.",
  })
  startTime!: string;

  @ApiProperty({ description: "종료 시간 (HH:mm)", example: "18:00" })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: "종료 시간은 HH:mm 형식이어야 합니다.",
  })
  endTime!: string;

  @ApiPropertyOptional({ description: "일정 제목" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: "장소" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({ description: "메모" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
