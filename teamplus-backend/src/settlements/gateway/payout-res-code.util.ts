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
// 감독이 고칠 수 없는 오류 — 문의를 요구하지 않고 운영자가 처리한다고 안내한다.
const MSG_CONFIG =
  "지급대행 연동 오류로 등록하지 못했습니다. 운영자가 확인 후 처리하니 따로 조치하지 않으셔도 됩니다.";
const MSG_SUBMALL_STATE =
  "나이스 등록 상태가 맞지 않아 등록하지 못했습니다. 운영자가 확인 후 처리하니 따로 조치하지 않으셔도 됩니다.";

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

/** 운영자 화면용 — 감독용 문구와 달리 원인을 그대로 드러낸다. */
const OPERATOR_TRANSPORT_ERRORS: Readonly<Record<string, string>> = {
  timeout: "나이스 응답 시간 초과(10초)",
  network: "나이스 서버 연결 실패 — 방화벽(121.133.126.34:443)·네트워크 확인",
  invalid_response: "나이스 응답 형식 오류",
  not_configured:
    "지급대행 키 미설정 — 서버 .env 의 NICE_PAYOUT_MID·NICE_PAYOUT_MERCHANT_KEY 확인",
};

const OPERATOR_CODE_MESSAGES: Readonly<Record<string, string>> = {
  "0000": "성공",
  "0101": "전문 포맷 오류",
  "0102": "전문 ID(sid) 오류",
  "0210": "필수값 누락",
  "0260": "필드 길이 초과",
  "0270": "데이터 형식 오류",
  "1000": "가맹점 인증 실패 — 지급대행 MID·Key 짝 확인",
  "1001": "비영업일",
  "1003": "예금주(계좌성명) 불일치",
  "1101": "지급대행 미사용 가맹점 — 나이스 계약 개통 확인",
  "1102": "잔액 데이터 없음",
  "1103": "중복 요청",
  "1104": "요청 데이터 없음",
  "1105": "나이스에 없는 서브몰 ID 로 수정 요청",
  "1106": "이미 등록된 서브몰 ID 로 신규 요청",
  "1107": "당일 요청 가능 시간(10:30) 초과",
  "9001": "나이스 대외계 통신 오류",
  "9999": "나이스 기타 오류",
};

export function describePayoutCallForOperator(call: {
  resCode: string | null;
  resMsg?: string | null;
  error?: string | null;
}): string {
  let base: string;
  if (call.error && OPERATOR_TRANSPORT_ERRORS[call.error]) {
    base = OPERATOR_TRANSPORT_ERRORS[call.error];
  } else if (call.resCode) {
    const known =
      OPERATOR_CODE_MESSAGES[call.resCode] ??
      (/^8\d{3}$/.test(call.resCode)
        ? "나이스 내부 DB 오류"
        : "나이스 처리 실패");
    base = `[${call.resCode}] ${known}`;
  } else {
    base = "나이스 응답 없음";
  }
  const niceMessage = call.resMsg?.trim();
  return niceMessage ? `${base} · 나이스: ${niceMessage}` : base;
}
