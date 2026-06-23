import {
  IsInt,
  IsString,
  IsOptional,
  IsArray,
  Min,
  Max,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateReviewDto {
  @ApiProperty({ description: "수업 ID" })
  @IsString()
  classId!: string;

  @ApiProperty({ description: "별점 (1-5)", minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ description: "상세 후기 (선택, 최대 1000자)" })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  content?: string;

  @ApiPropertyOptional({ description: "첨부 사진 URL 배열 (최대 5장)" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}
