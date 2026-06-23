import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, IsInt, IsOptional, Min, Max } from "class-validator";

export class IssueCreditDto {
  @ApiProperty({ description: "수업권을 발급받을 사용자 User.id" })
  @IsString()
  userId!: string;

  @ApiProperty({ description: "어느 수업의 수업권인가 — Class.id" })
  @IsString()
  classId!: string;

  @ApiProperty({ description: "발급할 회차", minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  totalSessions!: number;

  @ApiPropertyOptional({ description: "연결된 결제 ID" })
  @IsOptional()
  @IsString()
  paymentId?: string;
}
