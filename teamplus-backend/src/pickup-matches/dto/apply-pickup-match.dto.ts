import { IsString, IsOptional, IsIn, Length } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * 매치 참가 신청 DTO.
 *
 * 모든 인증 사용자 호출 가능.
 */
export class ApplyPickupMatchDto {
  @ApiProperty({
    description: "희망 포지션",
    enum: ["FW", "MF", "DF", "GK"],
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(["FW", "MF", "DF", "GK"])
  position?: string;

  @ApiProperty({
    description: "본인 레벨",
    enum: ["입문", "초급", "중급", "고급"],
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(["입문", "초급", "중급", "고급"])
  level?: string;

  @ApiProperty({ description: "주최자에게 전달할 메모", required: false })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;
}
