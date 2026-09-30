import { NicePayoutOutcome } from "./nice-payout.types";

export const PAYOUT_RES_OK = "0000";

/** 우리 쪽 키·MID·전문 구성 결함 또는 계약 미개통 — 재시도해도 같은 결과다. */
const CONFIG_CODES: ReadonlySet<string> = new Set([
  "1000",
  "1101",
  "0101",
  "0102",
  "0210",
  "0260",
  "0270",
]);

/**
 * 나이스 내부·대외계 장애(8xxx DB, 9xxx 통신·기타) — 요청이 반영됐는지 알 수 없으므로 확정 실패로 보지 않는다.
 * 코드표에 없는 같은 계열 코드도 사전 고지 없이 추가될 수 있어 앞자리로 판정한다.
 */
const AMBIGUOUS_CODE_PATTERN = /^[89]\d{3}$/;

const MSG_AMBIGUOUS =
  "나이스 응답을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.";
const MSG_CONFIG = "지급대행 연동 설정 오류입니다. 운영자에게 문의해주세요.";
const MSG_SUBMALL_STATE =
  "서브몰 등록 상태가 맞지 않습니다. 운영자에게 문의해주세요.";

const TERMINAL_MESSAGES: Readonly<Record<string, string>> = {
  "1001": "영업일이 아닙니다.",
  "1003": "예금주명이 계좌와 일치하지 않습니다. 예금주를 확인해주세요.",
  "1102": "지급대행 잔액 정보가 없습니다.",
  "1105": MSG_SUBMALL_STATE,
  "1106": MSG_SUBMALL_STATE,
  "1107": "당일 요청 가능 시간(오전 10:30)이 지났습니다.",
};

export function classifyPayoutResCode(
  resCode: string | null,
): NicePayoutOutcome {
  if (resCode === null || !/^\d{4}$/.test(resCode)) return "AMBIGUOUS";
  if (resCode === PAYOUT_RES_OK) return "SUCCESS";
  if (CONFIG_CODES.has(resCode)) return "CONFIG";
  if (AMBIGUOUS_CODE_PATTERN.test(resCode)) return "AMBIGUOUS";
  return "TERMINAL";
}

export function describePayoutResCode(resCode: string | null): string {
  const outcome = classifyPayoutResCode(resCode);
  if (outcome === "SUCCESS") return "처리되었습니다.";
  if (outcome === "AMBIGUOUS") return MSG_AMBIGUOUS;
  if (outcome === "CONFIG") return MSG_CONFIG;
  const code = resCode as string;
  return TERMINAL_MESSAGES[code] ?? `나이스 처리 실패(코드 ${code})`;
}
