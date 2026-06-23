import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, IsOptional, Matches, IsIn } from "class-validator";

/**
 * 코치 정보 수정 DTO
 * - PUT /api/v1/admin/coaches/:id
 *   (ADMIN: 전체 코치 / DIRECTOR·ACADEMY_DIRECTOR: 자신이 운영하는 팀의 코치 한정)
 *
 * 모든 필드는 선택적 — 부분 업데이트 지원.
 * `class-validator` whitelist + forbidNonWhitelisted 환경에서도
 * UI 에서 보내는 status/avatarUrl 등의 보조 필드를 안전하게 받기 위한 명시 필드.
 */
export class UpdateCoachDto {
  @ApiPropertyOptional({
    example: "김철수",
    description: "코치 이름 (성+이름)",
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: "ICE_HOCKEY", description: "전문 종목" })
  @IsOptional()
  @IsString()
  specialty?: string;

  @ApiPropertyOptional({ example: "01012345678", description: "전화번호" })
  @IsOptional()
  @IsString()
  @Matches(/^\d{10,13}$/, {
    message: "올바른 전화번호 형식이 아닙니다. (숫자 10~13자리)",
  })
  phone?: string;

  @ApiPropertyOptional({
    example: "대한빙상연맹 공인 지도자",
    description: "경력",
  })
  @IsOptional()
  @IsString()
  career?: string;

  @ApiPropertyOptional({
    example: "active",
    enum: ["active", "inactive"],
    description: "활동 상태 (active|inactive)",
  })
  @IsOptional()
  @IsString()
  @IsIn(["active", "inactive"])
  status?: "active" | "inactive";

  @ApiPropertyOptional({ description: "프로필 이미지 URL 또는 data URL" })
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
