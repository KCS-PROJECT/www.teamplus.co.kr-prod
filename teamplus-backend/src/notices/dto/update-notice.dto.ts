import { PartialType, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, ValidateIf } from "class-validator";
import { CreateNoticeDto } from "./create-notice.dto";

export class UpdateNoticeDto extends PartialType(CreateNoticeDto) {
  /**
   * 대상 팀 — **nullable 계약**.
   *
   * [Phase 0 · F-EX-04] 값의 의미를 명시적으로 고정한다.
   *   · 키 없음(undefined) → 대상 팀 **변경 없음**
   *   · `null` · `""` · 공백 → **전역(전체) 공지 전환 요청** — 시스템 역할만 허용
   *   · 팀 ID           → 해당 팀으로 이동 — 이동 대상 팀의 관리 권한까지 검증
   *
   * 상속받은 `@IsString()` 은 `null` 을 거부하므로 `@ValidateIf` 로 null 을 검증에서 제외해
   * "null 은 통과하지만 계약은 불명확"하던 상태를 문서·타입 양쪽에서 확정한다.
   */
  @ApiPropertyOptional({
    description:
      "대상 팀 ID. null/빈 문자열은 전역(전체) 공지 전환 요청이며 시스템 관리자만 허용됩니다. 키를 보내지 않으면 변경하지 않습니다.",
    example: "team-cuid-abc123",
    nullable: true,
    type: String,
  })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  targetTeamId?: string | null;
}
