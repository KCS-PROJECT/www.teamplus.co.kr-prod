import { IsEnum, IsNotEmpty } from "class-validator";

export enum MemberApprovalStatus {
  APPROVED = "approved",
  REJECTED = "rejected",
}

export class ApproveMemberDto {
  @IsEnum(MemberApprovalStatus, {
    message: "올바른 승인 상태를 선택해주세요.",
  })
  @IsNotEmpty({ message: "승인 상태는 필수입니다." })
  status!: MemberApprovalStatus;
}
