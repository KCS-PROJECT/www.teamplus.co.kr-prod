import { IsString, IsNotEmpty, IsOptional } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * 대기자 등록 DTO
 *
 * 수업 정원 초과 시 대기 등록 요청
 */
export class CreateWaitlistDto {
  @ApiProperty({
    description: "대기할 수업 ID",
    example: "clxyz456def",
  })
  @IsString()
  @IsNotEmpty({ message: "수업 ID를 입력해주세요." })
  classId!: string;

  @ApiPropertyOptional({
    description: "특정 수업 일정 ID (선택, 없으면 수업 전체 대기)",
    example: "clxyz789ghi",
  })
  @IsOptional()
  @IsString()
  scheduleId?: string;

  @ApiPropertyOptional({
    description: "대기할 자녀 ID (학부모가 자녀 대신 등록 시)",
    example: "clxyz123abc",
  })
  @IsOptional()
  @IsString()
  childId?: string;
}
