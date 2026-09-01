import { ArgumentsHost, ConflictException } from "@nestjs/common";
import { AllExceptionsFilter } from "./http-exception.filter";

/**
 * [설계 v4 §4.1] 구조화 예외 payload passthrough 검증 —
 *  apply-draft 계약({ errorCode: "DRAFT_CONFLICT", conflicts })이 필터에서 유실되지 않고
 *  응답 body 의 errorCode + details.conflicts 로 전달되는지. 기존 Nest 표준
 *  { error: "..." } 경로(SESSION_EXISTS 등)의 회귀 없음도 함께 고정한다.
 */
describe("AllExceptionsFilter — 구조화 payload passthrough", () => {
  function makeHost() {
    const json = jest.fn();
    const response = {
      status: jest.fn().mockReturnValue({ json }),
      setHeader: jest.fn(),
      headersSent: false,
    };
    const request = {
      url: "/api/v1/teams/t1/classes/c1/schedules/apply-draft",
      method: "POST",
      ip: "127.0.0.1",
      headers: {},
      body: {},
      query: {},
      params: {},
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;
    return { host, json, response };
  }

  const filter = new AllExceptionsFilter();

  it("errorCode 키 예외 — DRAFT_CONFLICT 가 errorCode 로, conflicts 가 details 로 전달된다", () => {
    const { host, json, response } = makeHost();
    const conflicts = [{ scheduleId: "s1", type: "version" }];
    filter.catch(
      new ConflictException({
        errorCode: "DRAFT_CONFLICT",
        message: "다른 곳에서 먼저 변경된 회차가 있습니다.",
        conflicts,
      }),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(409);
    const body = json.mock.calls[0][0];
    expect(body.errorCode).toBe("DRAFT_CONFLICT");
    expect(body.details).toEqual({ conflicts });
    expect(body.message).toBe("다른 곳에서 먼저 변경된 회차가 있습니다.");
  });

  it("errorCode 키 예외(부가 필드 없음) — OPERATION_MISMATCH 는 details 없이 errorCode 만", () => {
    const { host, json } = makeHost();
    filter.catch(
      new ConflictException({
        errorCode: "OPERATION_MISMATCH",
        message: "같은 요청 ID 로 다른 내용이 전송되었습니다.",
      }),
      host,
    );

    const body = json.mock.calls[0][0];
    expect(body.errorCode).toBe("OPERATION_MISMATCH");
    expect(body).not.toHaveProperty("details");
  });

  it("Nest 표준 error 키 예외 — 기존 { error: 'SESSION_EXISTS' } 경로 회귀 없음", () => {
    const { host, json } = makeHost();
    filter.catch(
      new ConflictException({
        message: "다른 기기에서 로그인되어 사용 중인 계정입니다.",
        error: "SESSION_EXISTS",
      }),
      host,
    );

    const body = json.mock.calls[0][0];
    expect(body.errorCode).toBe("SESSION_EXISTS");
    expect(body).not.toHaveProperty("details");
  });

  it("명시적 details 필드 예외 — conflicts 승격보다 details 가 우선한다", () => {
    const { host, json } = makeHost();
    filter.catch(
      new ConflictException({
        errorCode: "SOME_CODE",
        message: "m",
        details: { reasonCode: "X" },
        conflicts: [{ scheduleId: "ignored" }],
      }),
      host,
    );

    const body = json.mock.calls[0][0];
    expect(body.details).toEqual({ reasonCode: "X" });
  });
});
