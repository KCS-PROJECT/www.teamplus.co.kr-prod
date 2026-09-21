import {
  BadRequestException,
  ConflictException,
  HttpStatus,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response as ExpressResponse } from "express";
import { IdentityController } from "./identity.controller";
import { IdentityService } from "./identity.service";
import { PrismaService } from "@/prisma/prisma.service";

const REQUEST_ID = "idv_0123456789abcdef0123456789abcdef";
const ALLOWED_RETURN = "http://localhost:5001/identity/result";
const FALLBACK_RETURN = "http://localhost:5001/identity/result";

/**
 * KG이니시스 통합인증 결과 수신 엔드포인트
 *
 * 브라우저 폼 POST 를 받으므로 어떤 경우에도 302 로 끝나야 한다.
 */
describe("IdentityController — KG이니시스 통합인증 결과 수신", () => {
  let controller: IdentityController;
  let identityService: { processCallback: jest.Mock };
  let prisma: { identityVerification: { findUnique: jest.Mock } };
  let res: ExpressResponse & { redirect: jest.Mock };

  const setup = (
    returnUrl: string | null = ALLOWED_RETURN,
    activeProvider: "portone" | "kg_inicis" = "portone",
  ) => {
    identityService = { processCallback: jest.fn() };
    prisma = {
      identityVerification: {
        findUnique: jest.fn().mockResolvedValue({ returnUrl }),
      },
    };
    const configService = {
      get: jest.fn().mockReturnValue({
        common: {
          activeProvider,
          returnBaseUrl: FALLBACK_RETURN,
          returnUrlAllowlist: [
            "http://localhost:5001",
            "https://www.teamplus.co.kr",
          ],
        },
      }),
    } as unknown as ConfigService;

    controller = new IdentityController(
      identityService as unknown as IdentityService,
      prisma as unknown as PrismaService,
      configService,
    );
    res = { redirect: jest.fn() } as unknown as ExpressResponse & {
      redirect: jest.Mock;
    };
  };

  /** STEP2 브라우저 폼 POST 페이로드 (파이프 없이 그대로 들어온다) */
  const dto = (
    overrides: Record<string, string> = {},
  ): Record<string, string> => ({
    resultCode: "0000",
    authRequestUrl: "https://kssa.inicis.com/api/result",
    txId: "TXID-0001",
    token: "dG9rZW4=",
    ...overrides,
  });

  const redirectedTo = () => new URL(res.redirect.mock.calls[0][1] as string);

  it("인증 성공 시 status=completed 로 302 리다이렉트한다", async () => {
    setup();
    identityService.processCallback.mockResolvedValue({
      success: true,
      requestId: REQUEST_ID,
    });

    await controller.handleKgInicisSuccess(REQUEST_ID, dto(), "1.2.3.4", res);

    expect(res.redirect).toHaveBeenCalledTimes(1);
    expect(res.redirect.mock.calls[0][0]).toBe(HttpStatus.FOUND);

    const url = redirectedTo();
    expect(url.origin + url.pathname).toBe(ALLOWED_RETURN);
    expect(url.searchParams.get("requestId")).toBe(REQUEST_ID);
    expect(url.searchParams.get("status")).toBe("completed");
    expect(url.searchParams.get("code")).toBeNull();
  });

  /**
   * [R1 #4] KG 경로는 PII 를 302 에 싣지 않는 계약이지만, needsGuardianConsent
   * 는 PII 가 아닌 불리언 플래그라 예외로 전달한다 — 그래야 미성년자 보호자
   * 동의 안내가 프론트(팝업/페이지 전환 양쪽)에서 조용히 사라지지 않는다.
   */
  it("needsGuardianConsent 가 true 면 guardianConsent=1 쿼리를 붙인다", async () => {
    setup();
    identityService.processCallback.mockResolvedValue({
      success: true,
      requestId: REQUEST_ID,
      needsGuardianConsent: true,
    });

    await controller.handleKgInicisSuccess(REQUEST_ID, dto(), "1.2.3.4", res);

    expect(redirectedTo().searchParams.get("guardianConsent")).toBe("1");
  });

  it("needsGuardianConsent 가 없으면 guardianConsent 쿼리를 붙이지 않는다", async () => {
    setup();
    identityService.processCallback.mockResolvedValue({
      success: true,
      requestId: REQUEST_ID,
    });

    await controller.handleKgInicisSuccess(REQUEST_ID, dto(), "1.2.3.4", res);

    expect(redirectedTo().searchParams.get("guardianConsent")).toBeNull();
  });

  it("requestId 를 콜백 데이터에 넣어 서비스에 넘긴다", async () => {
    setup();
    identityService.processCallback.mockResolvedValue({ success: true });

    await controller.handleKgInicisSuccess(REQUEST_ID, dto(), "1.2.3.4", res);

    expect(identityService.processCallback).toHaveBeenCalledWith(
      "kg_inicis",
      expect.objectContaining({ requestId: REQUEST_ID, resultCode: "0000" }),
      "1.2.3.4",
    );
  });

  it("인증 실패 시 status=failed + errorCode 를 붙여 302 리다이렉트한다", async () => {
    setup();
    identityService.processCallback.mockResolvedValue({
      success: false,
      errorCode: "CI_MISSING",
    });

    await controller.handleKgInicisFail(
      REQUEST_ID,
      dto({ resultCode: "9999" }),
      "1.2.3.4",
      res,
    );

    const url = redirectedTo();
    expect(url.searchParams.get("status")).toBe("failed");
    expect(url.searchParams.get("code")).toBe("CI_MISSING");
  });

  it("서비스 예외(409 이미 처리됨)를 302 로 변환한다", async () => {
    setup();
    identityService.processCallback.mockRejectedValue(
      new ConflictException("이미 처리된 인증 요청입니다."),
    );

    await controller.handleKgInicisSuccess(REQUEST_ID, dto(), "1.2.3.4", res);

    expect(res.redirect).toHaveBeenCalledTimes(1);
    const url = redirectedTo();
    expect(url.searchParams.get("status")).toBe("failed");
    expect(url.searchParams.get("code")).toBe("ALREADY_PROCESSED");
  });

  it("허용 목록 밖 returnUrl 은 기본 리턴 URL 로 강등한다 (open redirect 차단)", async () => {
    setup("https://evil.example.com/steal");
    identityService.processCallback.mockResolvedValue({ success: true });

    await controller.handleKgInicisSuccess(REQUEST_ID, dto(), "1.2.3.4", res);

    const url = redirectedTo();
    expect(url.origin).toBe("http://localhost:5001");
    expect(url.origin + url.pathname).toBe(FALLBACK_RETURN);
  });

  it("returnUrl 이 없으면 기본 리턴 URL 을 쓴다", async () => {
    setup(null);
    identityService.processCallback.mockResolvedValue({ success: true });

    await controller.handleKgInicisSuccess(REQUEST_ID, dto(), "1.2.3.4", res);

    expect(redirectedTo().origin + redirectedTo().pathname).toBe(
      FALLBACK_RETURN,
    );
  });

  /**
   * 팝업 모드(2026-09-21, 프론트 전용) — returnUrl 에 authWindow=popup 쿼리를
   * 실어 보내면 백엔드는 이를 해석하지 않고 그대로 최종 302 까지 승계할 뿐이다.
   * resolveKgReturnUrl 은 origin 만 allowlist 와 대조하고 candidate 를 그대로
   * 반환하며, buildIdentityRedirect 는 new URL(base) 후 searchParams.set 만
   * 하므로 기존 쿼리가 보존된다 — 이 계약이 깨지면 팝업 모드가 조용히 실패한다.
   */
  it("허용된 returnUrl 에 기존 쿼리(authWindow=popup)가 있으면 302 에서도 보존되고 requestId·status 가 덧붙는다", async () => {
    setup(`${ALLOWED_RETURN}?authWindow=popup`);
    identityService.processCallback.mockResolvedValue({
      success: true,
      requestId: REQUEST_ID,
    });

    await controller.handleKgInicisSuccess(REQUEST_ID, dto(), "1.2.3.4", res);

    const url = redirectedTo();
    expect(url.origin + url.pathname).toBe(ALLOWED_RETURN);
    expect(url.searchParams.get("authWindow")).toBe("popup");
    expect(url.searchParams.get("requestId")).toBe(REQUEST_ID);
    expect(url.searchParams.get("status")).toBe("completed");
  });

  it("허용 목록 밖 origin 의 returnUrl 은 쿼리를 승계하지 않고 기본값으로 강등한다", async () => {
    setup("https://evil.example.com/steal?authWindow=popup");
    identityService.processCallback.mockResolvedValue({ success: true });

    await controller.handleKgInicisSuccess(REQUEST_ID, dto(), "1.2.3.4", res);

    const url = redirectedTo();
    expect(url.origin + url.pathname).toBe(FALLBACK_RETURN);
    expect(url.searchParams.get("authWindow")).toBeNull();
    expect(url.searchParams.get("requestId")).toBe(REQUEST_ID);
  });

  /**
   * 전역 ValidationPipe(forbidNonWhitelisted)가 메서드 파이프보다 먼저 돈다.
   * DTO 로 body 를 받으면 규격 외 필드 하나에 400 JSON 이 나가고 핸들러가 호출조차 되지 않으므로,
   * 핸들러 레벨에서 "실행되고 302 가 나온다"를 확인한다.
   */
  describe("규격 외 필드 수용", () => {
    /**
     * 전제 검증 — ValidationPipe.toValidate() 는 metatype 이 Object 면 검증을 건너뛴다.
     * body 를 DTO 타입으로 되돌리면 이 테스트가 깨지고, 그때 전역 파이프가 다시 400 을 낸다.
     */
    it.each(["handleKgInicisSuccess", "handleKgInicisFail"])(
      "%s 의 body metatype 은 Object 다 (전역 파이프 우회)",
      (method) => {
        const types = Reflect.getMetadata(
          "design:paramtypes",
          IdentityController.prototype,
          method,
        );
        expect(types[1]).toBe(Object);
      },
    );

    it("KG 가 추가 필드를 실어 보내도 핸들러가 실행되고 302 가 나온다", async () => {
      setup();
      identityService.processCallback.mockResolvedValue({ success: true });

      await controller.handleKgInicisSuccess(
        REQUEST_ID,
        {
          ...dto(),
          unknownFieldFromKg: "whatever",
          providerDevCd: "TOSS",
          anotherOne: "1",
        } as unknown as Record<string, string>,
        "1.2.3.4",
        res,
      );

      expect(res.redirect).toHaveBeenCalledTimes(1);
      expect(redirectedTo().searchParams.get("status")).toBe("completed");
    });

    it("규격 외 필드는 서비스로 전달되지 않는다 (화이트리스트)", async () => {
      setup();
      identityService.processCallback.mockResolvedValue({ success: true });

      await controller.handleKgInicisSuccess(
        REQUEST_ID,
        {
          ...dto(),
          unknownFieldFromKg: "whatever",
        } as unknown as Record<string, string>,
        "1.2.3.4",
        res,
      );

      const forwarded = identityService.processCallback.mock.calls[0][1];
      expect(forwarded).not.toHaveProperty("unknownFieldFromKg");
      expect(Object.keys(forwarded).sort()).toEqual([
        "authRequestUrl",
        "requestId",
        "resultCode",
        "token",
        "txId",
      ]);
    });

    it("resultCode 가 없으면 서비스를 호출하지 않고 302 로 끝난다", async () => {
      setup();

      await controller.handleKgInicisSuccess(
        REQUEST_ID,
        { txId: "TXID-0001" },
        "1.2.3.4",
        res,
      );

      expect(identityService.processCallback).not.toHaveBeenCalled();
      const url = redirectedTo();
      expect(url.searchParams.get("status")).toBe("failed");
      expect(url.searchParams.get("code")).toBe("INVALID_CALLBACK_PAYLOAD");
    });

    it("빈 body 여도 예외를 던지지 않고 302 로 끝난다", async () => {
      setup();

      await controller.handleKgInicisFail(REQUEST_ID, {}, "1.2.3.4", res);

      expect(res.redirect).toHaveBeenCalledTimes(1);
      expect(redirectedTo().searchParams.get("code")).toBe(
        "INVALID_CALLBACK_PAYLOAD",
      );
    });
  });

  /**
   * [R1 #3] 프론트가 KG 팝업을 열지 결정하려면 클릭 "이전"에 활성 provider 를
   * 알아야 한다 — identity.config.ts 의 common.activeProvider 를 그대로 노출한다.
   */
  describe("GET active-provider", () => {
    it("identity.common.activeProvider 를 그대로 반환한다", () => {
      setup(ALLOWED_RETURN, "kg_inicis");

      expect(controller.getActiveProvider()).toEqual({
        provider: "kg_inicis",
      });
    });
  });

  describe("레거시 통합 콜백 경로 차단", () => {
    it("callback/:provider 로 kg_inicis 가 들어오면 400 으로 거부한다", async () => {
      setup();

      await expect(
        controller.handleCallback("kg_inicis", {}, "1.2.3.4"),
      ).rejects.toThrow(BadRequestException);
      // 실패 전이가 일어나지 않아야 한다 — 정상 대기 중인 인증을 죽이는 경로였다.
      expect(identityService.processCallback).not.toHaveBeenCalled();
    });
  });
});
