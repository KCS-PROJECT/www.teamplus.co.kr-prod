import { IsNotEmpty, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * 정산 계좌 정보 갱신 DTO — admin.service.ts UpdateSettlementBankInfoDto 이식(계약 동일).
 */
export class UpdateBankInfoDto {
  @ApiProperty({ description: "은행명", example: "국민은행" })
  @IsNotEmpty({ message: "은행명은 필수입니다." })
  @IsString()
  bankName!: string;

  @ApiProperty({ description: "계좌번호", example: "123-456-789012" })
  @IsNotEmpty({ message: "계좌번호는 필수입니다." })
  @IsString()
  bankAccount!: string;

  @ApiProperty({ description: "예금주", example: "홍길동" })
  @IsNotEmpty({ message: "예금주는 필수입니다." })
  @IsString()
  accountHolder!: string;
}
