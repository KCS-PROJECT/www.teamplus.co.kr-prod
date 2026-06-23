import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsOptional,
  IsInt,
  IsDateString,
  IsIn,
  Min,
} from "class-validator";

export class CreateClassHistoryDto {
  @ApiProperty({ description: "클럽 회원 ID (ClubMember.id)" })
  @IsString()
  memberId!: string;

  @ApiProperty({ description: "수업 ID (Class.id)" })
  @IsString()
  classId!: string;

  @ApiPropertyOptional({ description: "수강신청 ID (Enrollment.id)" })
  @IsOptional()
  @IsString()
  enrollmentId?: string;

  @ApiProperty({ description: "수업 시작일", example: "2026-03-01" })
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional({ description: "수업 종료일", example: "2026-06-30" })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: "총 수업 횟수", default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  totalSessions?: number;

  @ApiPropertyOptional({
    description: "상태",
    enum: ["active", "completed", "withdrawn", "suspended"],
    default: "active",
  })
  @IsOptional()
  @IsString()
  @IsIn(["active", "completed", "withdrawn", "suspended"])
  status?: string;
}
