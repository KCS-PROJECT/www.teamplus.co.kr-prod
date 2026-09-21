import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from "class-validator";

/** 앱 복귀 스킴 — 우리 앱 스킴만 허용해 결제창이 임의 주소로 되돌아가지 못하게 한다. */
const APP_SCHEME_PATTERN = /^teamplus:\/\/[\w\-./?=&%#]*$/;

/**
 * 나이스 구모듈 결제창 서명 요청.
 *
 * 금액·MID·SignData 는 이 요청에 담기지 않는다 — 전부 서버가 주문번호로 복원한다.
 * 클라이언트가 보낼 수 있는 값은 결제수단과 앱 복귀 스킴뿐이다.
 */
export class NiceStdSignDto {
  @ApiProperty({
    description: "결제 주문번호 (initiate 단계에서 발급된 orderNumber)",
    example: "ORD-1776234431193-e0612224267b",
  })
  @IsString()
  @IsNotEmpty()
  orderNumber!: string;

  @ApiProperty({
    description: "결제수단 — 카드 또는 계좌이체",
    enum: ["CARD", "BANK"],
  })
  @IsIn(["CARD", "BANK"])
  payMethod!: "CARD" | "BANK";

  @ApiPropertyOptional({
    description: "앱 WebView 전용 — 제휴사 앱 인증 후 복귀할 앱 스킴",
    example: "teamplus://payment/return",
  })
  @IsOptional()
  @IsString()
  @Matches(APP_SCHEME_PATTERN, {
    message: "복귀 주소는 teamplus:// 스킴만 사용할 수 있습니다.",
  })
  wapUrl?: string;

  @ApiPropertyOptional({
    description: "앱 WebView 전용 — ISP 결제 취소 시 복귀할 앱 스킴",
    example: "teamplus://payment/cancel",
  })
  @IsOptional()
  @IsString()
  @Matches(APP_SCHEME_PATTERN, {
    message: "복귀 주소는 teamplus:// 스킴만 사용할 수 있습니다.",
  })
  ispCancelUrl?: string;
}
