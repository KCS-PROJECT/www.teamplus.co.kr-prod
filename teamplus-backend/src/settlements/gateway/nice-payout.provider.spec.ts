import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NicePayoutFakeGateway } from "./nice-payout-fake.gateway";
import { NicePayoutHttpGateway } from "./nice-payout-http.gateway";
import {
  createNicePayoutGateway,
  nicePayoutGatewayProvider,
} from "./nice-payout.provider";
import { NICE_PAYOUT_GATEWAY } from "./nice-payout.types";

const cfg = (env: Record<string, string>) =>
  ({ get: (k: string) => env[k] }) as unknown as ConfigService;

describe("nicePayoutGatewayProvider", () => {
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation();
  });
  afterEach(() => errorSpy.mockRestore());

  it("토큰·주입 선언", () => {
    expect(nicePayoutGatewayProvider).toMatchObject({
      provide: NICE_PAYOUT_GATEWAY,
      inject: [ConfigService],
    });
  });

  it("개발 + fake → fake", () => {
    const gw = createNicePayoutGateway(
      cfg({ NICE_PAYOUT_GATEWAY: "fake", NODE_ENV: "development" }),
    );
    expect(gw).toBeInstanceOf(NicePayoutFakeGateway);
    expect(gw.kind).toBe("fake");
  });

  it("production + fake → http 구현 + error 로그", () => {
    const gw = createNicePayoutGateway(
      cfg({ NICE_PAYOUT_GATEWAY: "fake", NODE_ENV: "production" }),
    );
    expect(gw).toBeInstanceOf(NicePayoutHttpGateway);
    expect(gw.kind).toBe("nice");
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("미설정·nice → http 구현, env 없으면 isConfigured=false", () => {
    const a = createNicePayoutGateway(cfg({}));
    const b = createNicePayoutGateway(cfg({ NICE_PAYOUT_GATEWAY: "nice" }));
    expect(a).toBeInstanceOf(NicePayoutHttpGateway);
    expect(b).toBeInstanceOf(NicePayoutHttpGateway);
    expect(a.isConfigured()).toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
