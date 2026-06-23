import {
  IsInt,
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  Min,
  Max,
  MaxLength,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateReviewDto {
  @ApiPropertyOptional({ description: "별점 (1-5)", minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ description: "상세 후기 (최대 1000자)" })
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

export class ToggleVisibilityDto {
  @ApiPropertyOptional({ description: "공개 여부" })
  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;
}
