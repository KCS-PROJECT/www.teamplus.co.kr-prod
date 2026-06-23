import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  Min,
  Max,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateStickerBoardDto {
  @ApiProperty({ description: "스티커판을 받을 아이 User ID" })
  @IsString()
  @IsNotEmpty()
  childId!: string;

  @ApiProperty({ description: "클럽 ID" })
  @IsString()
  @IsNotEmpty()
  teamId!: string;

  @ApiPropertyOptional({
    description: "스티커판 제목",
    default: "칭찬 스티커판",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @ApiProperty({ description: "목표 스티커 수", example: 10 })
  @IsInt()
  @Min(1)
  @Max(50)
  goalCount!: number;

  @ApiPropertyOptional({ description: "보상 이름 (예: 아이스크림 쿠폰)" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  rewardName?: string;
}
