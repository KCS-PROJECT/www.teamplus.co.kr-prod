import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsInt,
  IsDateString,
  Matches,
  Min,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateBookingDto {
  @ApiProperty({
    example: "U12 팀 훈련",
    description: "예약 제목",
  })
  @IsNotEmpty({ message: "예약 제목은 필수입니다." })
  @IsString({ message: "예약 제목은 문자열이어야 합니다." })
  title!: string;

  @ApiProperty({
    example: "2026-04-10",
    description: "예약 날짜 (YYYY-MM-DD)",
  })
  @IsNotEmpty({ message: "예약 날짜는 필수입니다." })
  @IsDateString({}, { message: "올바른 날짜 형식이 아닙니다. (YYYY-MM-DD)" })
  date!: string;

  @ApiProperty({
    example: "09:00",
    description: '시작 시간 (HH:mm 형식, 예: "09:00")',
  })
  @IsNotEmpty({ message: "시작 시간은 필수입니다." })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: "시작 시간 형식이 올바르지 않습니다. (HH:mm)",
  })
  startTime!: string;

  @ApiProperty({
    example: "11:00",
    description: '종료 시간 (HH:mm 형식, 예: "11:00")',
  })
  @IsNotEmpty({ message: "종료 시간은 필수입니다." })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: "종료 시간 형식이 올바르지 않습니다. (HH:mm)",
  })
  endTime!: string;

  @ApiPropertyOptional({
    example: "training",
    description: "사용 목적 (training|match|lesson|event|rental|pt)",
  })
  @IsOptional()
  @IsString({ message: "사용 목적은 문자열이어야 합니다." })
  purpose?: string;

  @ApiPropertyOptional({
    example: 20,
    description: "예상 참가 인원",
  })
  @IsOptional()
  @IsInt({ message: "참가 인원은 정수여야 합니다." })
  @Min(1, { message: "참가 인원은 1명 이상이어야 합니다." })
  participants?: number;

  @ApiPropertyOptional({
    example: "club-id-123",
    description: "클럽 ID (클럽 대관 시)",
  })
  @IsOptional()
  @IsString({ message: "클럽 ID는 문자열이어야 합니다." })
  teamId?: string;

  @ApiPropertyOptional({
    example: "장비 세팅이 필요합니다.",
    description: "비고/메모",
  })
  @IsOptional()
  @IsString({ message: "메모는 문자열이어야 합니다." })
  memo?: string;
}
