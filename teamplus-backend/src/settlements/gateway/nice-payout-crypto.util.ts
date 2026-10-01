import * as crypto from "crypto";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 나이스 전문 시각 `YYYYMMDDHHMISS` (KST). 서버 TZ 와 무관하도록 +9h 후 getUTC* 로 읽는다. */
export function buildPayoutTrDtm(now: Date = new Date()): string {
  const k = new Date(now.getTime() + KST_OFFSET_MS);
  return (
    String(k.getUTCFullYear()) +
    pad2(k.getUTCMonth() + 1) +
    pad2(k.getUTCDate()) +
    pad2(k.getUTCHours()) +
    pad2(k.getUTCMinutes()) +
    pad2(k.getUTCSeconds())
  );
}

/** `encKey = hex(sha256(sid + mid + trDtm + merchantKey))` */
export function buildPayoutEncKey(
  sid: string,
  mid: string,
  trDtm: string,
  merchantKey: string,
): string {
  return crypto
    .createHash("sha256")
    .update(sid + mid + trDtm + merchantKey, "utf8")
    .digest("hex");
}
