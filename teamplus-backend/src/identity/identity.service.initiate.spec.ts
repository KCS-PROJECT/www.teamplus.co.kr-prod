import { ConfigService } from "@nestjs/config";
import { IdentityService } from "./identity.service";
import { IdentityProviderType, IdentityPurpose } from "./dto";
import type {
  IIdentityGateway,
  IdentityRequestResult,
} from "./gateways/identity-gateway.interface";

/**
 * initiateVerification 의 소프트 실패 응답 계약.
 *
 * 클라이언트 envelope 규약은 `success:false` 일 때 `error.{code,message}` 만 읽는다.
 * Gateway 가 돌려준 errorCode/errorMessage 가 그 형태로도 실려 나가는지(dual emit)와,
 * 실패 시 DB·캐시 쓰기가 일어나지 않는지를 고정한다.
 */

function buildGateway(result: IdentityRequestResult): IIdentityGateway {
  return {
    providerName: "kg_inicis",
    createAuthRequest: jest.fn().mockResolvedValue(result),
    processCallback: jest.fn(),
    verifySignature: jest.fn(),
    verifyIpWhitelist: jest.fn().mockReturnValue(true),
    decryptData: jest.fn(),
  } as unknown as IIdentityGateway;
}

function buildService(gateway: IIdentityGateway) {
  const prisma = {
    identityVerification: { create: jest.fn() },
  };
  const redis = { set: jest.fn(), get: jest.fn(), del: jest.fn() };
  const configService = {
    get: jest.fn().mockReturnValue({
      common: {
        requestTimeout: 1800,
        returnBaseUrl: "http://localhost:5001/identity/callback",
        activeProvider: "kg_inicis",
      },
      security: { rateLimitPerHour: 10 },
    }),
  } as unknown as ConfigService;

  const service = new IdentityService(
    prisma as never,
    redis as never,
    configService,
    [gateway],
  );
  return { service, prisma };
}

describe("IdentityService.initiateVerification — 소프트 실패 응답", () => {
  it("Gateway 실패를 errorMessage 와 error.{code,message} 양쪽으로 내보낸다", async () => {
    const gateway = buildGateway({
      success: false,
      requestId: "ignored",
      errorCode: "INICIS_CREDENTIALS_NOT_CONFIGURED",
      errorMessage: "본인인증 설정이 완료되지 않았습니다.",
    });
    const { service, prisma } = buildService(gateway);

    const res = await service.initiateVerification(
      null,
      IdentityProviderType.KG_INICIS,
      IdentityPurpose.REGISTRATION,
    );

    expect(res.success).toBe(false);
    expect(res.errorMessage).toBe("본인인증 설정이 완료되지 않았습니다.");
    expect(res.error).toEqual({
      code: "INICIS_CREDENTIALS_NOT_CONFIGURED",
      message: "본인인증 설정이 완료되지 않았습니다.",
    });
    expect(res.requestId).toMatch(/^idv_[0-9a-f]{32}$/);
    expect(prisma.identityVerification.create).not.toHaveBeenCalled();
  });

  it("Gateway 가 코드를 주지 않으면 기본 코드와 기본 문구로 채운다", async () => {
    const gateway = buildGateway({ success: false, requestId: "ignored" });
    const { service } = buildService(gateway);

    const res = await service.initiateVerification(
      null,
      IdentityProviderType.KG_INICIS,
      IdentityPurpose.REGISTRATION,
    );

    expect(res.success).toBe(false);
    expect(res.error).toEqual({
      code: "IDENTITY_INITIATE_FAILED",
      message: "인증 요청 생성에 실패했습니다.",
    });
    expect(res.errorMessage).toBe(res.error?.message);
  });
});
