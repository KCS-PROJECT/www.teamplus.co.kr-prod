import {
  IsString,
  IsEnum,
  IsBoolean,
  IsInt,
  IsOptional,
  IsArray,
} from "class-validator";
import { UserType } from "@prisma/client";
import { ApiProperty } from "@nestjs/swagger";

export class CreateAppMenuDto {
  @ApiProperty({ enum: UserType })
  @IsEnum(UserType)
  userType!: UserType;

  @ApiProperty()
  @IsString()
  label!: string;

  @ApiProperty()
  @IsString()
  icon!: string;

  @ApiProperty()
  @IsString()
  href!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiProperty()
  @IsInt()
  order!: number;

  @ApiProperty({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateAppMenuDto {
  @ApiProperty({ enum: UserType, required: false })
  @IsEnum(UserType)
  @IsOptional()
  userType?: UserType;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  label?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  icon?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  href?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiProperty({ required: false })
  @IsInt()
  @IsOptional()
  order?: number;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class BulkUpdateAppMenuDto {
  @ApiProperty({ enum: UserType })
  @IsEnum(UserType)
  userType!: UserType;

  @ApiProperty({ type: [CreateAppMenuDto] })
  @IsArray()
  menus!: CreateAppMenuDto[];
}

export class ResetMenuTreeChildDto {
  @ApiProperty()
  @IsString()
  label!: string;

  @ApiProperty()
  @IsString()
  icon!: string;

  @ApiProperty()
  @IsString()
  href!: string;

  @ApiProperty({ default: true, required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class ResetMenuTreeGroupDto {
  @ApiProperty()
  @IsString()
  label!: string;

  @ApiProperty()
  @IsString()
  icon!: string;

  @ApiProperty({ type: [ResetMenuTreeChildDto] })
  @IsArray()
  children!: ResetMenuTreeChildDto[];

  @ApiProperty({ default: true, required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class ResetMenuTreeDto {
  @ApiProperty({ enum: UserType })
  @IsEnum(UserType)
  userType!: UserType;

  @ApiProperty({ type: [ResetMenuTreeGroupDto] })
  @IsArray()
  groups!: ResetMenuTreeGroupDto[];
}
