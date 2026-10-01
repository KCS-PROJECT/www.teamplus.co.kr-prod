import {
  classifyPayoutResCode,
  describePayoutCallForOperator,
  describePayoutResCode,
} from "./payout-res-code.util";

describe("classifyPayoutResCode", () => {
  it("0000 → SUCCESS", () => {
    expect(classifyPayoutResCode("0000")).toBe("SUCCESS");
  });

  it.each(["1000", "1101", "0101", "0102", "0210", "0260", "0270"])(
    "%s → CONFIG",
    (code) => expect(classifyPayoutResCode(code)).toBe("CONFIG"),
  );

  it.each(["8001", "8002", "8003", "8004", "8005", "9001", "9999"])(
    "%s → AMBIGUOUS",
    (code) => expect(classifyPayoutResCode(code)).toBe("AMBIGUOUS"),
  );

  it.each(["8000", "8099", "9002", "9500"])(
    "코드표에 없는 8xxx·9xxx %s 도 → AMBIGUOUS",
    (code) => expect(classifyPayoutResCode(code)).toBe("AMBIGUOUS"),
  );

  it.each([null, "", "abcd", "12", "00000", " 000"])(
    "%p (응답 없음·형식 불일치) → AMBIGUOUS",
    (code) => expect(classifyPayoutResCode(code)).toBe("AMBIGUOUS"),
  );

  it.each([
    "1001",
    "1002",
    "1003",
    "1102",
    "1103",
    "1104",
    "1105",
    "1106",
    "1107",
    "4321",
  ])("%s → TERMINAL", (code) =>
    expect(classifyPayoutResCode(code)).toBe("TERMINAL"),
  );
});

describe("describePayoutResCode", () => {
  it.each([
    ["1003", "예금주명이 계좌와 일치하지 않습니다. 예금주를 확인해주세요."],
    [
      "1105",
      "나이스 등록 상태가 맞지 않아 등록하지 못했습니다. 운영자가 확인 후 처리하니 따로 조치하지 않으셔도 됩니다.",
    ],
    [
      "1106",
      "나이스 등록 상태가 맞지 않아 등록하지 못했습니다. 운영자가 확인 후 처리하니 따로 조치하지 않으셔도 됩니다.",
    ],
    ["1001", "영업일이 아닙니다."],
    ["1107", "당일 요청 가능 시간(오전 10:30)이 지났습니다."],
    ["1102", "지급대행 잔액 정보가 없습니다."],
    ["1103", "나이스 처리 실패(코드 1103)"],
    ["4321", "나이스 처리 실패(코드 4321)"],
    ["0000", "처리되었습니다."],
  ])("%s → %s", (code, msg) => {
    expect(describePayoutResCode(code)).toBe(msg);
  });

  it.each([null, "", "8003", "9001", "9999", "zz"])(
    "%p → 결과 불명 안내",
    (code) =>
      expect(describePayoutResCode(code)).toBe(
        "나이스 응답을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.",
      ),
  );

  it.each(["1000", "1101", "0210", "0270"])("%s → 설정 오류 안내", (code) =>
    expect(describePayoutResCode(code)).toBe(
      "지급대행 연동 오류로 등록하지 못했습니다. 운영자가 확인 후 처리하니 따로 조치하지 않으셔도 됩니다.",
    ),
  );
});

describe("describePayoutCallForOperator", () => {
  it.each([
    [{ resCode: null, error: "timeout" }, "나이스 응답 시간 초과(10초)"],
    [
      { resCode: null, error: "network" },
      "나이스 서버 연결 실패 — 방화벽(121.133.126.34:443)·네트워크 확인",
    ],
    [
      { resCode: null, error: "not_configured" },
      "지급대행 키 미설정 — 서버 .env 의 NICE_PAYOUT_MID·NICE_PAYOUT_MERCHANT_KEY 확인",
    ],
    [
      { resCode: "1000", resMsg: "인증 실패" },
      "[1000] 가맹점 인증 실패 — 지급대행 MID·Key 짝 확인 · 나이스: 인증 실패",
    ],
    [{ resCode: "8004" }, "[8004] 나이스 내부 DB 오류"],
    [{ resCode: "4321", resMsg: "  " }, "[4321] 나이스 처리 실패"],
    [{ resCode: null }, "나이스 응답 없음"],
  ])("%j → %s", (call, expected) => {
    expect(describePayoutCallForOperator(call)).toBe(expected);
  });
});
