import { IsBoolean, IsOptional, Matches } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

/**
 * [§4-6] 판매 시작 요청 — 판매 창 2개월(진행 중인 달·다음 달) 지원.
 *   dryRun=true(미리보기)는 targetMonth 미전송 시 서버가 후보(computeSalesWindow)를
 *   자동 산출한다. dryRun 미전송/false(확인·실제 승인)는 targetMonth 가 **필수** —
 *   dryRun 응답이 돌려준 값을 그대로 되돌려야 하며, 미전송이면 400. 이 왕복이 미리보기와
 *   실제 승인 사이에 판매 달이 바뀌는 레이스를 막는다.
 */
export class OpenClassSalesDto {
  @ApiPropertyOptional({
    description: "검증·해제 대상 미리보기만 수행(쓰기 0).",
    example: false,
  })
  @IsOptional()
  @IsBoolean({ message: "dryRun은 boolean 이어야 합니다." })
  dryRun?: boolean;

  @ApiPropertyOptional({
    example: "2026-09",
    description:
      "판매를 시작할 대상월 (YYYY-MM). dryRun=true 미리보기는 미전송 시 서버가 자동 " +
      "산출한 후보로 진행하지만, 확인 호출(dryRun 미전송/false)은 필수 — 미전송 시 400.",
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: "targetMonth는 YYYY-MM 형식이어야 합니다.",
  })
  targetMonth?: string;
}
