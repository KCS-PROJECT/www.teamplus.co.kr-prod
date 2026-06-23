import { IsString, IsNotEmpty, Length, Matches } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * PIN 설정 DTO
 *
 * 학부모가 자녀의 보안 PIN을 설정할 때 사용합니다.
 * PIN은 정확히 6자리 숫자여야 하며, 보안 취약 패턴은 거부됩니다.
 */
export class SetPinDto {
  @ApiProperty({
    description: "자녀 프로필 ID",
    example: "clxyz1234567890",
  })
  @IsString({ message: "자녀 프로필 ID는 문자열이어야 합니다." })
  @IsNotEmpty({ message: "자녀 프로필 ID를 입력해주세요." })
  childProfileId!: string;

  @ApiProperty({
    description: "6자리 숫자 PIN (연속 숫자, 동일 숫자 불가)",
    example: "482916",
    minLength: 6,
    maxLength: 6,
  })
  @IsString({ message: "PIN은 문자열이어야 합니다." })
  @IsNotEmpty({ message: "PIN을 입력해주세요." })
  @Length(6, 6, { message: "PIN은 정확히 6자리여야 합니다." })
  @Matches(/^\d{6}$/, { message: "PIN은 6자리 숫자만 가능합니다." })
  pin!: string;
}
