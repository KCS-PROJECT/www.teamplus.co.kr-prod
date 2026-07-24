import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, IsString, Length, Min } from "class-validator";

/**
 * 승인=실행 Body (E4). version 은 CAS 낙관적 잠금용 — 더블탭·stale 승인 차단.
 */
export class ApproveRefundRequestDto {
  @ApiProperty({
    description: "요청 조회 시점의 version (CAS 낙관적 잠금). 불일치 시 409.",
    example: 0,
  })
  @IsInt()
  @Min(0)
  version!: number;

  @ApiProperty({
    description: "승인 메모(선택)",
    required: false,
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  memo?: string;
}

/**
 * 거절 Body (E5). decisionReason 필수.
 */
export class RejectRefundRequestDto {
  @ApiProperty({
    description: "요청 조회 시점의 version (CAS 낙관적 잠금). 불일치 시 409.",
    example: 0,
  })
  @IsInt()
  @Min(0)
  version!: number;

  @ApiProperty({
    description: "거절 사유 (필수)",
    minLength: 1,
    maxLength: 500,
    example: "이용 완료된 결제로 환불이 어렵습니다.",
  })
  @IsString()
  @Length(1, 500)
  decisionReason!: string;
}

/**
 * 재처리 Body (E6). execution_failed 전용 — failureStage 에 따라 PG 재호출 여부 분기.
 */
export class ReprocessRefundRequestDto {
  @ApiProperty({
    description: "요청 조회 시점의 version (CAS 낙관적 잠금). 불일치 시 409.",
    example: 1,
  })
  @IsInt()
  @Min(0)
  version!: number;
}

/**
 * KG_UNCONFIRMED 수동 해소 Body (E9 reconcile). ADMIN/SYSTEM/OPER 전용.
 * outcome = 운영자가 KG 결과를 확인한 결론.
 */
export class ReconcileRefundRequestDto {
  @ApiProperty({
    description: "요청 조회 시점의 version (CAS 낙관적 잠금). 불일치 시 409.",
    example: 2,
  })
  @IsInt()
  @Min(0)
  version!: number;

  @ApiProperty({
    description:
      "확인 결과 — CONFIRMED_CANCELLED(취소 성공 확인 → DB-only 반영) | CONFIRMED_NOT_CANCELLED(미취소 확인 → 복원·재실행 허용)",
    enum: ["CONFIRMED_CANCELLED", "CONFIRMED_NOT_CANCELLED"],
  })
  @IsIn(["CONFIRMED_CANCELLED", "CONFIRMED_NOT_CANCELLED"])
  outcome!: "CONFIRMED_CANCELLED" | "CONFIRMED_NOT_CANCELLED";

  @ApiProperty({
    description: "확인 근거 메모 (필수, 감사)",
    minLength: 1,
    maxLength: 500,
  })
  @IsString()
  @Length(1, 500)
  memo!: string;
}
