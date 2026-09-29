import { IsIn, IsISO8601, Matches } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { TeamSettlementAccountStatus } from "@prisma/client";

const STATUSES = Object.values(TeamSettlementAccountStatus);

/**
 * 운영자 — 나이스 서브몰 등록 완료 표시(REGISTERED) / 해제(SUBMITTED).
 * expectedUpdatedAt 은 운영자가 화면에서 본 계좌 버전 — 그 사이 감독이 수정했으면 409.
 */
export class UpdateAccountRegistrationDto {
  @ApiProperty({ enum: STATUSES })
  @IsIn(STATUSES, { message: "상태는 SUBMITTED 또는 REGISTERED 여야 합니다." })
  status!: TeamSettlementAccountStatus;

  @ApiProperty({
    description:
      "조회 시점의 계좌 updatedAt (ISO 8601, 시간대 필수 — Z 또는 ±hh:mm)",
    example: "2026-09-29T01:00:00.000Z",
  })
  @IsISO8601(
    { strict: true },
    { message: "expectedUpdatedAt 은 ISO 8601 형식이어야 합니다." },
  )
  // 시간대 없는 문자열은 서버 시간대로 해석돼 절대 시각이 달라진다.
  @Matches(/(Z|[+-]\d{2}:\d{2})$/, {
    message: "expectedUpdatedAt 에는 시간대(Z 또는 ±hh:mm)가 필요합니다.",
  })
  expectedUpdatedAt!: string;
}
