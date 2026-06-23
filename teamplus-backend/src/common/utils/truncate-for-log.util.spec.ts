import { truncateForLog, LOG_TRUNCATE_OPTS } from "./truncate-for-log.util";

describe("truncateForLog", () => {
  it("원시값/짧은 문자열은 그대로 반환한다", () => {
    expect(truncateForLog(42)).toBe(42);
    expect(truncateForLog(true)).toBe(true);
    expect(truncateForLog(null)).toBeNull();
    expect(truncateForLog(undefined)).toBeUndefined();
    expect(truncateForLog("short")).toBe("short");
  });

  it("긴 문자열은 maxStringLen 까지만 보존하고 잔여 길이를 표기한다", () => {
    const long = "a".repeat(LOG_TRUNCATE_OPTS.maxStringLen + 50);
    const out = truncateForLog(long) as string;
    expect(typeof out).toBe("string");
    expect(out.startsWith("a".repeat(LOG_TRUNCATE_OPTS.maxStringLen))).toBe(
      true,
    );
    expect(out).toContain("…(+50자)");
  });

  it("maxArrayItems 이하 배열은 배열 형태를 유지한다", () => {
    const out = truncateForLog([1, 2, 3]);
    expect(Array.isArray(out)).toBe(true);
    expect(out).toEqual([1, 2, 3]);
  });

  it("큰 배열은 string 이 아니라 JSON 객체(__arrayTruncated)로 축약한다", () => {
    const arr = Array.from({ length: 27 }, (_, i) => ({ id: i }));
    const out = truncateForLog(arr) as Record<string, unknown>;
    expect(typeof out).toBe("object");
    expect(Array.isArray(out)).toBe(false);
    expect(out.__arrayTruncated).toBe(true);
    expect(out.total).toBe(27);
    expect(out.shown).toBe(LOG_TRUNCATE_OPTS.maxArrayItems);
    expect((out.items as unknown[]).length).toBe(
      LOG_TRUNCATE_OPTS.maxArrayItems,
    );
    // 보존된 항목은 원형 객체를 유지
    expect((out.items as Array<{ id: number }>)[0]).toEqual({ id: 0 });
  });

  it("중첩 객체 구조를 보존하고, 결과는 JSON 직렬화/재파싱이 가능한 객체다", () => {
    const members = Array.from({ length: 27 }, (_, i) => ({
      id: `m${i}`,
      user: { firstName: "자녀", childParents: [{ parent: { phone: "010" } }] },
    }));
    const payload = { success: true, data: { total: 27, members } };

    const out = truncateForLog(payload) as {
      success: boolean;
      data: { total: number; members: Record<string, unknown> };
    };

    // 핵심: 문자열이 아니라 객체여야 한다 (사용자 리포트 — "string object" 회귀 방지)
    expect(typeof out).toBe("object");
    expect(out.success).toBe(true);
    expect(out.data.total).toBe(27);
    expect(out.data.members.__arrayTruncated).toBe(true);

    // round-trip: 정상 JSON 객체로 재파싱 가능
    const roundTrip = JSON.parse(JSON.stringify(out));
    expect(roundTrip.data.members.shown).toBe(LOG_TRUNCATE_OPTS.maxArrayItems);
  });

  it("maxDepth 초과 시 플레이스홀더로 대체하여 무한/초대형 전개를 막는다", () => {
    // depth: root(0) → l1(1) → ... 매우 깊은 중첩
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < LOG_TRUNCATE_OPTS.maxDepth + 3; i += 1) {
      deep = { nested: deep };
    }
    const out = truncateForLog(deep);
    // 직렬화 가능해야 한다 (예외 없이 완료)
    expect(() => JSON.stringify(out)).not.toThrow();
    expect(JSON.stringify(out)).toContain("깊이 제한 생략");
  });
});
