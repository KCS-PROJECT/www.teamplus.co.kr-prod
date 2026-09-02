import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { CreateClassDto } from "./create-class.dto";

/**
 * 결제방식 계약 고정 — 선택형(BOTH)은 신규 생성 중단이라 API 레벨에서 거부한다.
 * 기존 BOTH 수업은 조회 경로에서만 유지되며 생성 계약과 무관하다.
 */
describe("CreateClassDto billingMode", () => {
  const build = (billingMode?: unknown) =>
    plainToInstance(CreateClassDto, {
      className: "테스트 수업",
      ...(billingMode === undefined ? {} : { billingMode }),
    });

  const billingModeErrors = async (billingMode?: unknown) => {
    const errors = await validate(build(billingMode));
    return errors.filter((e) => e.property === "billingMode");
  };

  it("미전송이면 거부한다", async () => {
    expect(await billingModeErrors()).toHaveLength(1);
  });

  it("BOTH 는 거부한다 — 신규 생성 중단", async () => {
    const errors = await billingModeErrors("BOTH");
    expect(errors).toHaveLength(1);
    expect(Object.values(errors[0].constraints ?? {}).join()).toContain(
      "PREPAID 또는 POSTPAID",
    );
  });

  it.each(["PREPAID", "POSTPAID"])("%s 는 허용한다", async (mode) => {
    expect(await billingModeErrors(mode)).toHaveLength(0);
  });

  it("정의되지 않은 값은 거부한다", async () => {
    expect(await billingModeErrors("MONTHLY")).toHaveLength(1);
  });
});
