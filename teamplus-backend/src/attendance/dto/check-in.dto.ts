import { IsNotEmpty, IsOptional, IsString } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CheckInDto {
  @ApiProperty({
    example: "550e8400-e29b-41d4-a716-446655440000",
    description: "QR 코드 스캔 데이터 (UUID)",
  })
  @IsNotEmpty({ message: "QR 코드 데이터는 필수입니다." })
  @IsString({ message: "QR 코드 데이터는 문자열이어야 합니다." })
  qrData!: string;

  @ApiPropertyOptional({
    example: "child-user-uuid",
    description:
      "자녀 User ID (학부모가 자녀 대신 체크인할 때만 사용). 미입력 시 본인 체크인.",
  })
  @IsOptional()
  @IsString({ message: "자녀 ID는 문자열이어야 합니다." })
  childId?: string;
}
