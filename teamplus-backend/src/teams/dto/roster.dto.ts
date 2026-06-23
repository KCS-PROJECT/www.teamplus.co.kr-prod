import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  IsBoolean,
  IsIn,
} from "class-validator";

/**
 * 팀 로스터(선수 명단)에 회원 추가 DTO
 *
 * ClubMember ID를 받아 팀에 등록합니다.
 * 같은 (teamId, memberId) 조합은 유니크 제약으로 중복 등록 불가.
 */
export class AddRosterMemberDto {
  @ApiProperty({
    description: "클럽 회원 ID (ClubMember.id)",
    example: "clx456def",
  })
  @IsString()
  @IsNotEmpty({ message: "회원 ID는 필수입니다." })
  memberId!: string;

  @ApiPropertyOptional({
    description: "포지션",
    enum: ["goalie", "defense", "forward"],
  })
  @IsOptional()
  @IsString()
  @IsIn(["goalie", "defense", "forward"], {
    message: "포지션은 goalie, defense, forward 중 하나여야 합니다.",
  })
  position?: string;

  @ApiPropertyOptional({
    description: "등번호 (1-99)",
    minimum: 1,
    maximum: 99,
  })
  @IsOptional()
  @IsInt({ message: "등번호는 정수여야 합니다." })
  @Min(1, { message: "등번호는 1 이상이어야 합니다." })
  @Max(99, { message: "등번호는 99 이하여야 합니다." })
  jerseyNumber?: number;

  @ApiPropertyOptional({ description: "주장 여부" })
  @IsOptional()
  @IsBoolean()
  isCaptain?: boolean;

  @ApiPropertyOptional({ description: "부주장 여부" })
  @IsOptional()
  @IsBoolean()
  isAltCaptain?: boolean;
}

/**
 * 팀 로스터 수정 DTO
 *
 * 포지션, 등번호, 주장 지정 등을 수정합니다.
 */
export class UpdateRosterMemberDto {
  @ApiPropertyOptional({
    description: "포지션",
    enum: ["goalie", "defense", "forward"],
  })
  @IsOptional()
  @IsString()
  @IsIn(["goalie", "defense", "forward"], {
    message: "포지션은 goalie, defense, forward 중 하나여야 합니다.",
  })
  position?: string;

  @ApiPropertyOptional({
    description: "등번호 (1-99)",
    minimum: 1,
    maximum: 99,
  })
  @IsOptional()
  @IsInt({ message: "등번호는 정수여야 합니다." })
  @Min(1, { message: "등번호는 1 이상이어야 합니다." })
  @Max(99, { message: "등번호는 99 이하여야 합니다." })
  jerseyNumber?: number;

  @ApiPropertyOptional({ description: "주장 여부" })
  @IsOptional()
  @IsBoolean()
  isCaptain?: boolean;

  @ApiPropertyOptional({ description: "부주장 여부" })
  @IsOptional()
  @IsBoolean()
  isAltCaptain?: boolean;

  @ApiPropertyOptional({
    description: "상태",
    enum: ["active", "injured", "suspended"],
  })
  @IsOptional()
  @IsString()
  @IsIn(["active", "injured", "suspended"], {
    message: "상태는 active, injured, suspended 중 하나여야 합니다.",
  })
  status?: string;
}
