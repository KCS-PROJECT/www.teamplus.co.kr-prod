import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  MaxLength,
  Matches,
} from "class-validator";

// ==================== CodeGroup DTOs ====================

export class CreateCodeGroupDto {
  @IsString()
  @MaxLength(100)
  @Matches(/^[A-Z][A-Z0-9_]*$/, {
    message: "그룹 코드는 영문 대문자, 숫자, 언더스코어만 사용 가능합니다.",
  })
  groupCode!: string;

  @IsString()
  @MaxLength(200)
  groupName!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateCodeGroupDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  groupName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

// ==================== CommonCode DTOs ====================

export class CreateCommonCodeDto {
  @IsString()
  groupId!: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  level?: number;

  @IsString()
  @MaxLength(100)
  code!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  value1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  value2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  value3?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateCommonCodeDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  value1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  value2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  value3?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
