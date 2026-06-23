import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class CreateAlimtalkTemplateDto {
  @ApiProperty({
    description: "카카오 비즈톡센터 등록 템플릿 코드",
    example: "PAYMENT_SUCCESS_001",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  templateCode!: string;

  @ApiProperty({ description: "관리자 UI 표시명", example: "결제 완료" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    description: "본문 (변수: #{key} 플레이스홀더)",
    example: "결제가 완료되었습니다.\n주문번호: #{orderNumber}",
  })
  @IsString()
  @IsNotEmpty()
  content!: string;

  @ApiPropertyOptional({
    description: "치환되는 변수 키 목록",
    example: ["orderNumber", "amount"],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];

  @ApiPropertyOptional({
    description: "카테고리 (payment / attendance / class / credit / general)",
    example: "payment",
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: "비고/관리자 메모" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: "활성 여부", default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAlimtalkTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
