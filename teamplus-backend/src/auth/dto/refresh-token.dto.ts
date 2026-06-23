import { IsString, IsJWT, IsOptional } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class RefreshTokenDto {
  @ApiProperty({
    description: "JWT Refresh Token",
    example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  })
  // [A-1 2026-06-07] body 또는 httpOnly 쿠키로 전달 가능 → optional.
  //   미존재 시 컨트롤러가 쿠키 fallback 후에도 없으면 401 처리.
  @IsOptional()
  @IsString({ message: "Refresh Token은 문자열이어야 합니다." })
  @IsJWT({ message: "유효한 JWT 형식이 아닙니다." })
  refreshToken?: string;
}
