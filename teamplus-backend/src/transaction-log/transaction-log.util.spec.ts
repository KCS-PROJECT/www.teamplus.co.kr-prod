/**
 * transaction-log.util 회귀 spec (2026-06-08)
 *
 * 검증 항목:
 * 1. decideResult — SUCCESS/FAIL/ERROR 정책 (특히 4xx→FAIL, 5xx/상태없는예외→ERROR)
 * 2. isSensitiveKey — 마스킹 대상 판정 + 오탐 방지(city/audit 등)
 * 3. maskSensitive — 값 [REDACTED] 치환 + Date 보존(createdAt:{} 버그 방지)
 * 4. preparePayload — 10KB 초과 구조보존 truncate
 * 5. toPathname — 쿼리스트링 분리
 */

import {
  decideResult,
  isSensitiveKey,
  maskSensitive,
  preparePayload,
  toPathname,
} from "./transaction-log.util";

describe("transaction-log.util", () => {
  describe("decideResult — SUCCESS/FAIL/ERROR 정책", () => {
    it("2xx + success:true → SUCCESS", () => {
      expect(decideResult(200, null, { success: true }).result).toBe("SUCCESS");
    });
    it("2xx + success 없음 → SUCCESS", () => {
      expect(decideResult(200, null, { data: 1 }).result).toBe("SUCCESS");
    });
    it("2xx + success:false → FAIL (bizSuccess=false)", () => {
      const r = decideResult(200, null, { success: false });
      expect(r.result).toBe("FAIL");
      expect(r.bizSuccess).toBe(false);
    });
    it("4xx → FAIL", () => {
      expect(
        decideResult(404, { getStatus: () => 404 }, undefined).result,
      ).toBe("FAIL");
    });
    it("401 예외 → FAIL + errorCode HTTP_401 + 메시지 추출", () => {
      const err = {
        response: { statusCode: 401, message: "이메일 또는 비밀번호가 일치하지 않습니다." },
        getStatus: () => 401,
      };
      const r = decideResult(401, err, undefined);
      expect(r.result).toBe("FAIL");
      expect(r.errorCode).toBe("HTTP_401");
      expect(r.errorMessage).toBe("이메일 또는 비밀번호가 일치하지 않습니다.");
    });
    it("5xx 예외 → ERROR", () => {
      expect(decideResult(500, new Error("boom"), undefined).result).toBe(
        "ERROR",
      );
    });
    it("상태코드 없는 예외(httpStatus<400) → ERROR", () => {
      expect(decideResult(200, new Error("network"), undefined).result).toBe(
        "ERROR",
      );
    });
    it("bizSuccess: boolean 아니면 null", () => {
      expect(decideResult(200, null, { data: 1 }).bizSuccess).toBeNull();
    });
  });

  describe("isSensitiveKey — 마스킹 대상 판정", () => {
    it.each([
      "authorization",
      "cookie",
      "set-cookie",
      "password",
      "accessToken",
      "refreshToken",
      "token",
      "cardNumber",
      "ci",
      "di",
      "ssn",
      "phone",
      "birthDate",
      "x-api-key",
      "cvv",
      "residentNumber",
    ])("민감 키 '%s' → true", (k) => {
      expect(isSensitiveKey(k)).toBe(true);
    });

    it.each([
      "city",
      "filename",
      "className",
      "audit",
      "media",
      "description",
      "firstName",
      "lastName",
      "district",
      "classId",
      "title",
      "status",
      "indicator",
    ])("일반 키 '%s' → false (오탐 방지)", (k) => {
      expect(isSensitiveKey(k)).toBe(false);
    });
  });

  describe("maskSensitive — 값 마스킹 + Date 보존", () => {
    it("민감 키 값을 [REDACTED] 로, 일반 값은 보존 (중첩 포함)", () => {
      const out = maskSensitive({
        password: "pw",
        token: "t",
        name: "홍길동",
        nested: { ci: "x", ok: 1 },
      }) as Record<string, unknown>;
      expect(out.password).toBe("[REDACTED]");
      expect(out.token).toBe("[REDACTED]");
      expect(out.name).toBe("홍길동");
      expect((out.nested as Record<string, unknown>).ci).toBe("[REDACTED]");
      expect((out.nested as Record<string, unknown>).ok).toBe(1);
    });

    it("Date 는 보존되어 ISO 로 직렬화 (createdAt:{} 버그 방지)", () => {
      const out = maskSensitive({
        createdAt: new Date("2026-06-08T00:00:00.000Z"),
      }) as Record<string, unknown>;
      expect(out.createdAt instanceof Date).toBe(true);
      expect(JSON.parse(JSON.stringify(out)).createdAt).toBe(
        "2026-06-08T00:00:00.000Z",
      );
    });

    it("배열 내부도 재귀 마스킹", () => {
      const out = maskSensitive([{ password: "x" }, { ok: 1 }]) as Array<
        Record<string, unknown>
      >;
      expect(out[0].password).toBe("[REDACTED]");
      expect(out[1].ok).toBe(1);
    });
  });

  describe("preparePayload — 10KB truncate", () => {
    it("소형 payload 는 미절단", () => {
      expect(preparePayload({ a: 1 }).truncated).toBe(false);
    });
    it("10KB 초과 payload 는 절단 + __truncated 메타 기록", () => {
      const big = {
        arr: Array.from({ length: 5000 }, (_, i) => ({
          i,
          v: "x".repeat(20),
        })),
      };
      const r = preparePayload(big);
      expect(r.truncated).toBe(true);
      expect((r.value as Record<string, unknown>).__truncated).toBe(true);
    });
    it("null/undefined → undefined(NULL)", () => {
      expect(preparePayload(null).value).toBeUndefined();
      expect(preparePayload(undefined).value).toBeUndefined();
    });
  });

  describe("toPathname — 쿼리스트링 분리", () => {
    it("쿼리 제거", () => {
      expect(toPathname("/api/v1/x?a=1&b=2")).toBe("/api/v1/x");
    });
    it("쿼리 없음 그대로", () => {
      expect(toPathname("/api/v1/y")).toBe("/api/v1/y");
    });
  });
});
