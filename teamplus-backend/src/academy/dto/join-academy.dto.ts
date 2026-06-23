import { IsString, IsOptional, IsNotEmpty, MinLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class JoinAcademyDto {
  @ApiProperty({
    description: "아카데미 코드",
    example: "ACAD-BLK001",
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  academyCode!: string;

  @ApiPropertyOptional({
    description: "자녀 ID (학부모가 자녀 대신 가입 시)",
  })
  @IsOptional()
  @IsString()
  childId?: string;
}
