import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UpsertTeamSettlementAccountDto } from "./upsert-team-settlement-account.dto";

describe("UpsertTeamSettlementAccountDto — 예금주 길이(나이스 계좌주명 UTF-8 30바이트)", () => {
  const holderErrors = async (accountHolder: string) => {
    const dto = plainToInstance(UpsertTeamSettlementAccountDto, {
      bankCode: "004",
      bankAccount: "110222333444",
      accountHolder,
    });
    const errors = await validate(dto);
    return errors.filter((e) => e.property === "accountHolder");
  };

  it.each([
    ["한글 10자(30바이트)", "가".repeat(10)],
    ["영문·숫자 30자", "a".repeat(30)],
    ["앞뒤 공백은 잘라서 판단", `  ${"가".repeat(10)}  `],
  ])("%s 는 통과한다", async (_label, value) => {
    expect(await holderErrors(value)).toHaveLength(0);
  });

  it.each([
    ["한글 11자(33바이트)", "가".repeat(11)],
    ["영문 31자", "a".repeat(31)],
    ["빈 값", "   "],
  ])("%s 는 거절한다", async (_label, value) => {
    const errors = await holderErrors(value);
    expect(errors).toHaveLength(1);
    expect(Object.values(errors[0].constraints ?? {})).toContain(
      "예금주는 한글 10자(영문·숫자 30자) 이내로 입력해주세요.",
    );
  });
});
