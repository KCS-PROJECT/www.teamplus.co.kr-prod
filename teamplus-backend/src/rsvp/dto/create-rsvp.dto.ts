import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export enum RsvpStatus {
  ATTENDING = "ATTENDING",
  DECLINED = "DECLINED",
}

export class CreateRsvpDto {
  @ApiProperty({
    example: "schedule-uuid",
    description: "수업 일정 ID",
  })
  @IsNotEmpty({ message: "수업 일정 ID는 필수입니다." })
  @IsString({ message: "수업 일정 ID는 문자열이어야 합니다." })
  scheduleId!: string;

  @ApiProperty({
    enum: RsvpStatus,
    example: RsvpStatus.ATTENDING,
    description: "참석/불참 여부 (ATTENDING | DECLINED)",
  })
  @IsEnum(RsvpStatus, { message: "ATTENDING 또는 DECLINED 값이어야 합니다." })
  status!: RsvpStatus;

  @ApiPropertyOptional({
    example: "child-uuid",
    description: "자녀 ID (학부모가 자녀 대신 응답할 경우)",
  })
  @IsOptional()
  @IsString({ message: "자녀 ID는 문자열이어야 합니다." })
  childId?: string;

  @ApiPropertyOptional({
    example: "개인 일정으로 인해 불참합니다.",
    description: "불참 사유 (DECLINED 시 선택 입력)",
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: "사유는 문자열이어야 합니다." })
  @MaxLength(500, { message: "사유는 500자를 초과할 수 없습니다." })
  note?: string;
}
