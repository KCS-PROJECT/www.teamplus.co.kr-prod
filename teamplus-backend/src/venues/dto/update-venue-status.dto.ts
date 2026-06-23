import { IsIn, IsNotEmpty, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * 구장 운영 상태 변경 DTO
 * - 빠른 토글용 (운영중/점검중/폐쇄) 분리 엔드포인트
 */
export class UpdateVenueStatusDto {
  @ApiProperty({
    example: "maintenance",
    description: "운영 상태 (active|maintenance|closed)",
    enum: ["active", "maintenance", "closed"],
  })
  @IsNotEmpty({ message: "운영 상태는 필수입니다." })
  @IsString()
  @IsIn(["active", "maintenance", "closed"], {
    message: "운영 상태는 active|maintenance|closed 중 하나여야 합니다.",
  })
  status!: "active" | "maintenance" | "closed";
}
