import { IsIn, IsNotEmpty } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class UpdateBillingTimingDto {
  @ApiProperty({
    description: "결제 시점 (PREPAID: 선결제, POSTPAID: 후결제)",
    enum: ["PREPAID", "POSTPAID"],
    example: "PREPAID",
  })
  @IsNotEmpty()
  @IsIn(["PREPAID", "POSTPAID"], {
    message: "billingTiming은 PREPAID 또는 POSTPAID 이어야 합니다.",
  })
  billingTiming!: "PREPAID" | "POSTPAID";
}
