import { IsIn } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class DisconnectSocialParamDto {
  @ApiProperty({
    example: "kakao",
    description: "연결 해제할 소셜 로그인 제공자 (kakao, google)",
    enum: ["kakao", "google"],
  })
  @IsIn(["kakao", "google"], {
    message: "지원하지 않는 소셜 로그인 제공자입니다. (kakao, google)",
  })
  provider!: string;
}

export class SocialAccountResponseDto {
  @ApiProperty({ example: "clxyz123abc", description: "소셜 계정 연동 ID" })
  id!: string;

  @ApiProperty({ example: "kakao", description: "소셜 로그인 제공자" })
  provider!: string;

  @ApiProperty({
    example: "user@kakao.com",
    description: "소셜 계정 이메일",
    nullable: true,
  })
  email!: string | null;

  @ApiProperty({
    example: "홍길동",
    description: "소셜 계정 이름",
    nullable: true,
  })
  name!: string | null;

  @ApiProperty({
    example: "2026-01-01T00:00:00.000Z",
    description: "연동 일시",
  })
  createdAt!: Date;
}
