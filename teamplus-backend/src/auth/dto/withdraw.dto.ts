import { IsString, IsOptional } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class WithdrawRequestDto {
  @ApiPropertyOptional({
    description: "현재 비밀번호 (이메일/비밀번호 가입 계정 본인 확인용)",
    example: "Test1234!",
  })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({
    description:
      "소셜 로그인 전용 계정 탈퇴 확인 문구. 비밀번호가 없는 소셜 계정은 '탈퇴합니다'를 입력해 본인 의사를 확인한다.",
    example: "탈퇴합니다",
  })
  @IsOptional()
  @IsString()
  confirmText?: string;

  @ApiPropertyOptional({
    description: "탈퇴 사유 (선택)",
    example: "더 이상 서비스를 이용하지 않습니다.",
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
