import { IsString, IsNotEmpty, IsOptional, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class AwardStickerDto {
  @ApiProperty({
    description: "스티커 종류",
    example: "star",
    enum: ["hockey", "helmet", "star", "heart", "trophy", "thumbsup"],
  })
  @IsString()
  @IsNotEmpty()
  stickerType!: string;

  @ApiPropertyOptional({ description: "스티커 획득 사유" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  earnedReason?: string;
}
