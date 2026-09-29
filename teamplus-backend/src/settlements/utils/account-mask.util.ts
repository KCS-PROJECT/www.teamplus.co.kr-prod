import {
  decryptField,
  isEncryptedField,
} from "@/common/utils/field-encryption.util";

/** 암호문이면 복호화, 평문(암호화 이전 데이터)이면 그대로. 복호화 실패 시 null — 암호문을 평문처럼 내보내지 않는다. */
export function decryptOrRaw(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!isEncryptedField(value)) return value;
  try {
    return decryptField(value);
  } catch {
    return null;
  }
}

/** 계좌번호 마스킹 — 뒤 4자리만 남긴다. */
export function maskBankAccount(
  plain: string | null | undefined,
): string | null {
  if (!plain) return null;
  return plain.length > 4 ? `****${plain.slice(-4)}` : "****";
}

/** 사업자번호 10자리를 `123-45-67890` 형식으로. 자리수가 다르면 입력 그대로. */
export function formatBusinessNumber(
  plain: string | null | undefined,
): string | null {
  if (!plain) return null;
  const digits = plain.replace(/\D/g, "");
  if (digits.length !== 10) return plain;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

/** 사업자번호 마스킹 — `123-**-***90`. */
export function maskBusinessNumber(
  plain: string | null | undefined,
): string | null {
  if (!plain) return null;
  const digits = plain.replace(/\D/g, "");
  if (digits.length !== 10) return "***";
  return `${digits.slice(0, 3)}-**-***${digits.slice(8)}`;
}
