import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsDateString,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ApproveSettlementDto {
  @ApiPropertyOptional({
    description: "승인 메모",
    example: "정산 내역 확인 완료",
  })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({
    description: "정산 예정일",
    example: "2026-01-20",
  })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

export class CompleteSettlementDto {
  @ApiProperty({
    description: "입금 확인 거래 ID",
    example: "TRANSFER-2026011500123",
  })
  @IsNotEmpty({ message: "거래 ID는 필수입니다." })
  @IsString()
  transferId!: string;

  @ApiPropertyOptional({
    description: "완료 메모",
    example: "정산 완료 처리",
  })
  @IsOptional()
  @IsString()
  note?: string;
}

export class RejectSettlementDto {
  @ApiProperty({
    description: "거절 사유",
    example: "계좌 정보 불일치",
  })
  @IsNotEmpty({ message: "거절 사유는 필수입니다." })
  @IsString()
  reason!: string;
}

export class UpdateSettlementBankInfoDto {
  @ApiProperty({
    description: "은행명",
    example: "국민은행",
  })
  @IsNotEmpty({ message: "은행명은 필수입니다." })
  @IsString()
  bankName!: string;

  @ApiProperty({
    description: "계좌번호",
    example: "123-456-789012",
  })
  @IsNotEmpty({ message: "계좌번호는 필수입니다." })
  @IsString()
  bankAccount!: string;

  @ApiProperty({
    description: "예금주",
    example: "홍길동",
  })
  @IsNotEmpty({ message: "예금주는 필수입니다." })
  @IsString()
  accountHolder!: string;
}
