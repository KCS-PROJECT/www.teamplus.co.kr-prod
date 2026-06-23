import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class GenerateQrDto {
  @ApiProperty({
    example: "schedule-uuid",
    description: "QR 코드를 생성할 수업 일정 ID",
  })
  @IsNotEmpty({ message: "수업 일정 ID는 필수입니다." })
  @IsString({ message: "수업 일정 ID는 문자열이어야 합니다." })
  scheduleId!: string;
}
