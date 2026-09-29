import { randomBytes } from "crypto";
import {
  decryptOrRaw,
  formatBusinessNumber,
  maskBankAccount,
  maskBusinessNumber,
} from "./account-mask.util";
import { encryptField } from "@/common/utils/field-encryption.util";

describe("account-mask.util", () => {
  const prevKey = process.env.FIELD_ENCRYPTION_KEY;
  beforeAll(() => {
    process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  });
  afterAll(() => {
    process.env.FIELD_ENCRYPTION_KEY = prevKey;
  });

  it("암호문은 복호화하고 평문은 그대로, 빈 값은 null", () => {
    expect(decryptOrRaw(encryptField("1002123456789"))).toBe("1002123456789");
    expect(decryptOrRaw("1002123456789")).toBe("1002123456789");
    expect(decryptOrRaw(null)).toBeNull();
  });

  it("계좌번호는 뒤 4자리만 남긴다", () => {
    expect(maskBankAccount("1002123456789")).toBe("****6789");
    expect(maskBankAccount("123")).toBe("****");
    expect(maskBankAccount(null)).toBeNull();
  });

  it("사업자번호는 서식·마스킹 규칙을 따른다", () => {
    expect(formatBusinessNumber("1234567890")).toBe("123-45-67890");
    expect(maskBusinessNumber("1234567890")).toBe("123-**-***90");
    expect(maskBusinessNumber("123")).toBe("***");
  });
});
