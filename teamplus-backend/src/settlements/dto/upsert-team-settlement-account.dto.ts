import { IsByteLength, IsOptional, IsString, Matches } from "class-validator";
import { Transform } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

const stripSeparators = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.replace(/[\s-]/g, "") : value;

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

/**
 * 팀 정산 계좌 저장(감독). 사업자번호는 첫 저장에만 필수이고 이후에는 바꿀 수 없다.
 */
export class UpsertTeamSettlementAccountDto {
  @ApiPropertyOptional({
    description:
      "사업자등록번호 10자리(하이픈 허용) — 첫 저장 시 필수, 이후 변경 불가",
    example: "123-45-67890",
  })
  @IsOptional()
  @Transform(stripSeparators)
  @Matches(/^\d{10}$/, { message: "사업자등록번호는 숫자 10자리여야 합니다." })
  businessNumber?: string;

  @ApiProperty({
    description: "은행코드 3자리 (공통코드 BANK_CODE)",
    example: "004",
  })
  @Matches(/^\d{3}$/, { message: "은행을 선택해주세요." })
  bankCode!: string;

  @ApiProperty({
    description: "계좌번호(하이픈 허용)",
    example: "123-456-789012",
  })
  @Transform(stripSeparators)
  @Matches(/^\d{6,30}$/, { message: "계좌번호는 숫자 6~30자리여야 합니다." })
  bankAccount!: string;

  @ApiProperty({
    description: "예금주 — UTF-8 30바이트 이내(한글 약 10자)",
    example: "블랭크하키클럽",
  })
  @Transform(trim)
  @IsString()
  // 나이스 지급대행 규격의 계좌주명이 UTF-8 30바이트다. 은행 실명과 같아야 해 서버에서 자를 수 없다.
  @IsByteLength(1, 30, {
    message: "예금주는 한글 10자(영문·숫자 30자) 이내로 입력해주세요.",
  })
  accountHolder!: string;
}
