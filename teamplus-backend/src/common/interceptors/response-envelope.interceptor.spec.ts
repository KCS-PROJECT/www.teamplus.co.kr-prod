import { ExecutionContext, CallHandler } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Readable } from "stream";
import { firstValueFrom, of } from "rxjs";
import { ResponseEnvelopeInterceptor } from "./response-envelope.interceptor";
import { SKIP_ENVELOPE_KEY } from "../decorators/skip-envelope.decorator";

function makeContext(
  opts: {
    type?: "http" | "ws" | "rpc";
    statusCode?: number;
    contentType?: string;
    metadata?: Record<string, unknown>;
  } = {},
): {
  ctx: ExecutionContext;
  res: { statusCode: number; getHeader: jest.Mock };
  reflector: Reflector;
} {
  const res = {
    statusCode: opts.statusCode ?? 200,
    getHeader: jest.fn().mockReturnValue(opts.contentType),
  };

  const ctx = {
    getType: () => opts.type ?? "http",
    switchToHttp: () => ({
      getResponse: () => res,
    }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;

  const reflector = new Reflector();
  const meta = opts.metadata ?? {};
  jest
    .spyOn(reflector, "getAllAndOverride")
    .mockImplementation((key) => meta[key as string] as boolean | undefined);

  return { ctx, res, reflector };
}

function makeHandler(value: unknown): CallHandler {
  return { handle: () => of(value) };
}

describe("ResponseEnvelopeInterceptor", () => {
  it("plain object 를 {success:true,data} 로 래핑한다", async () => {
    const { ctx, reflector } = makeContext();
    const interceptor = new ResponseEnvelopeInterceptor(reflector);
    const result = await firstValueFrom(
      interceptor.intercept(ctx, makeHandler({ id: "u1", name: "안" })),
    );
    expect(result).toEqual({
      success: true,
      data: { id: "u1", name: "안" },
    });
  });

  it("이미 {success:true,data} 형태면 통과시킨다 (이중 래핑 방지)", async () => {
    const { ctx, reflector } = makeContext();
    const interceptor = new ResponseEnvelopeInterceptor(reflector);
    const payload = { success: true as const, data: { id: "u1" } };
    const result = await firstValueFrom(
      interceptor.intercept(ctx, makeHandler(payload)),
    );
    expect(result).toBe(payload);
  });

  it("에러 envelope {success:false} 는 통과시킨다", async () => {
    const { ctx, reflector } = makeContext();
    const interceptor = new ResponseEnvelopeInterceptor(reflector);
    const payload = { success: false as const, message: "err" };
    const result = await firstValueFrom(
      interceptor.intercept(ctx, makeHandler(payload)),
    );
    expect(result).toBe(payload);
  });

  it("페이지네이션 형태 {total, page, limit, data} 는 그대로 통과", async () => {
    const { ctx, reflector } = makeContext();
    const interceptor = new ResponseEnvelopeInterceptor(reflector);
    const payload = {
      total: 100,
      page: 1,
      limit: 20,
      data: [{ id: 1 }, { id: 2 }],
    };
    const result = await firstValueFrom(
      interceptor.intercept(ctx, makeHandler(payload)),
    );
    expect(result).toBe(payload);
  });

  it("@SkipEnvelope() 데코레이터가 있으면 통과", async () => {
    const { ctx, reflector } = makeContext({
      metadata: { [SKIP_ENVELOPE_KEY]: true },
    });
    const interceptor = new ResponseEnvelopeInterceptor(reflector);
    const payload = { raw: "value" };
    const result = await firstValueFrom(
      interceptor.intercept(ctx, makeHandler(payload)),
    );
    expect(result).toBe(payload);
  });

  it("Buffer 응답은 그대로 통과 (파일 다운로드)", async () => {
    const { ctx, reflector } = makeContext();
    const interceptor = new ResponseEnvelopeInterceptor(reflector);
    const buf = Buffer.from("test");
    const result = await firstValueFrom(
      interceptor.intercept(ctx, makeHandler(buf)),
    );
    expect(result).toBe(buf);
  });

  it("Stream(pipe 메서드) 응답은 그대로 통과", async () => {
    const { ctx, reflector } = makeContext();
    const interceptor = new ResponseEnvelopeInterceptor(reflector);
    const stream = Readable.from(["chunk"]);
    const result = await firstValueFrom(
      interceptor.intercept(ctx, makeHandler(stream)),
    );
    expect(result).toBe(stream);
  });

  it("Content-Type 이 JSON 이 아니면 통과 (text/csv 등)", async () => {
    const { ctx, reflector } = makeContext({ contentType: "text/csv" });
    const interceptor = new ResponseEnvelopeInterceptor(reflector);
    const result = await firstValueFrom(
      interceptor.intercept(ctx, makeHandler("a,b,c\n1,2,3")),
    );
    expect(result).toBe("a,b,c\n1,2,3");
  });

  it("204 No Content 는 그대로 통과", async () => {
    const { ctx, reflector } = makeContext({ statusCode: 204 });
    const interceptor = new ResponseEnvelopeInterceptor(reflector);
    const result = await firstValueFrom(
      interceptor.intercept(ctx, makeHandler({})),
    );
    expect(result).toEqual({});
  });

  it("null / undefined 는 그대로 통과", async () => {
    const { ctx, reflector } = makeContext();
    const interceptor = new ResponseEnvelopeInterceptor(reflector);
    const r1 = await firstValueFrom(
      interceptor.intercept(ctx, makeHandler(null)),
    );
    const r2 = await firstValueFrom(
      interceptor.intercept(ctx, makeHandler(undefined)),
    );
    expect(r1).toBeNull();
    expect(r2).toBeUndefined();
  });

  it("원시값(string/number)도 envelope 으로 래핑", async () => {
    const { ctx, reflector } = makeContext();
    const interceptor = new ResponseEnvelopeInterceptor(reflector);
    const r1 = await firstValueFrom(
      interceptor.intercept(ctx, makeHandler("hello")),
    );
    expect(r1).toEqual({ success: true, data: "hello" });
  });

  it("HTTP 외 컨텍스트(WS/RPC) 는 통과", async () => {
    const { ctx, reflector } = makeContext({ type: "ws" });
    const interceptor = new ResponseEnvelopeInterceptor(reflector);
    const payload = { ws: "event" };
    const result = await firstValueFrom(
      interceptor.intercept(ctx, makeHandler(payload)),
    );
    expect(result).toBe(payload);
  });
});
