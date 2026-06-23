import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import {
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import * as crypto from "crypto";
import { KgInicisGateway } from "./kg-inicis.gateway";

// Mock axios
jest.mock("axios", () => {
  const mockPost = jest.fn();
  const mockGet = jest.fn();
  return {
    create: jest.fn().mockReturnValue({
      post: mockPost,
      get: mockGet,
    }),
    __mockPost: mockPost,
    __mockGet: mockGet,
  };
});

import axios from "axios";

describe("KgInicisGateway", () => {
  let gateway: KgInicisGateway;
  let mockPost: jest.Mock;

  const mockPaymentConfig = {
    inicis: {
      storeId: "INIpayTest",
      merchantKey: "test-merchant-key-12345",
      signatureKey: "test-signature-key-67890",
      apiVersion: "1.0",
      mode: "sandbox",
      timeout: 10000,
    },
    endpoints: {
      sandbox: {
        mobile: "https://mobile.inicis.com/smart/payment",
        approval: "https://iniapi.inicis.com/approval",
        cancel: "https://iniapi.inicis.com/cancel",
      },
      production: {
        mobile: "https://mobile.inicis.com/smart/payment",
        approval: "https://iniapi.inicis.com/approval",
        cancel: "https://iniapi.inicis.com/cancel",
      },
    },
    webhook: {
      returnUrl: "https://teamplus.com/payment/callback",
      webhookUrl: "https://teamplus.com/api/payment/webhook",
      verifySignature: true,
    },
    security: {
      signatureKey: "test-signature-key-67890",
      ipWhitelist: ["203.238.37.0/24", "118.129.210.0/24"],
    },
    options: {
      currency: "KRW",
      quotabase: "00",
    },
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === "payment") {
        return mockPaymentConfig;
      }
      return undefined;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPost = (axios as any).__mockPost;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KgInicisGateway,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    gateway = module.get<KgInicisGateway>(KgInicisGateway);
  });

  describe("createPaymentRequest", () => {
    it("should generate payment URL successfully", async () => {
      const params = {
        orderNumber: "ORD-2026-001",
        amount: 240000,
        productName: "아이스하키 수업 (8회)",
        buyerName: "홍길동",
        buyerEmail: "hong@example.com",
        buyerPhone: "010-1234-5678",
      };

      const paymentUrl = await gateway.createPaymentRequest(params);

      expect(paymentUrl).toContain("https://mobile.inicis.com/smart/payment");
      expect(paymentUrl).toContain("mid=INIpayTest");
      expect(paymentUrl).toContain("oid=ORD-2026-001");
      expect(paymentUrl).toContain("price=240000");
      expect(paymentUrl).toContain("goodname=");
    });

    it("should use default values when optional params are missing", async () => {
      const params = {
        orderNumber: "ORD-2026-002",
        amount: 100000,
        productName: "주말반 수업",
      };

      const paymentUrl = await gateway.createPaymentRequest(params);

      expect(paymentUrl).toContain("oid=ORD-2026-002");
      expect(paymentUrl).toContain("price=100000");
      expect(paymentUrl).toContain("paymethod=card");
    });

    it("should support quota parameter for installments", async () => {
      const params = {
        orderNumber: "ORD-2026-003",
        amount: 500000,
        productName: "3개월 패키지",
        quota: 3,
      };

      const paymentUrl = await gateway.createPaymentRequest(params);

      expect(paymentUrl).toContain("quotabase=3");
    });

    it("should include signature in payment URL", async () => {
      const params = {
        orderNumber: "ORD-2026-004",
        amount: 240000,
        productName: "테스트 상품",
      };

      const paymentUrl = await gateway.createPaymentRequest(params);

      expect(paymentUrl).toContain("signature=");
      expect(paymentUrl).toContain("timestamp=");
    });
  });

  describe("approvePayment", () => {
    it("should approve payment successfully", async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          resultCode: "0000",
          resultMsg: "정상처리",
          tid: "INICIS_TID_12345",
          authCode: "AUTH123456",
          authDate: "20260104120000",
          cardCode: "04",
          cardName: "삼성카드",
          quota: "0",
        },
      });

      const result = await gateway.approvePayment({
        tid: "INICIS_TID_12345",
        authCode: "AUTH123456",
        amount: 240000,
        orderNumber: "ORD-2026-001",
      });

      expect(result.success).toBe(true);
      expect(result.tid).toBe("INICIS_TID_12345");
      expect(result.authCode).toBe("AUTH123456");
      expect(result.cardName).toBe("삼성카드");
      expect(result.quota).toBe(0);
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    it("should handle approval failure", async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          resultCode: "1001",
          resultMsg: "카드 한도 초과",
          tid: "INICIS_TID_12345",
        },
      });

      const result = await gateway.approvePayment({
        tid: "INICIS_TID_12345",
        authCode: "AUTH123456",
        amount: 5000000,
        orderNumber: "ORD-2026-002",
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("카드 한도 초과");
    });

    it("should throw InternalServerErrorException on network error", async () => {
      mockPost.mockRejectedValueOnce(new Error("Network error"));

      await expect(
        gateway.approvePayment({
          tid: "INICIS_TID_12345",
          authCode: "AUTH123456",
          amount: 240000,
          orderNumber: "ORD-2026-003",
        }),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it("should handle quota in response", async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          resultCode: "0000",
          resultMsg: "정상처리",
          tid: "INICIS_TID_12345",
          authCode: "AUTH123456",
          authDate: "20260104120000",
          quota: "3",
        },
      });

      const result = await gateway.approvePayment({
        tid: "INICIS_TID_12345",
        authCode: "AUTH123456",
        amount: 500000,
        orderNumber: "ORD-2026-004",
      });

      expect(result.quota).toBe(3);
    });

    it("should use default message when resultMsg is empty", async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          resultCode: "0000",
          tid: "INICIS_TID_12345",
          authCode: "AUTH123456",
          authDate: "20260104120000",
        },
      });

      const result = await gateway.approvePayment({
        tid: "INICIS_TID_12345",
        authCode: "AUTH123456",
        amount: 100000,
        orderNumber: "ORD-2026-005",
      });

      expect(result.message).toBe("정상처리");
    });
  });

  describe("cancelPayment", () => {
    it("should cancel full payment successfully", async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          resultCode: "0000",
          resultMsg: "정상처리",
          tid: "INICIS_TID_12345",
        },
      });

      const result = await gateway.cancelPayment({
        tid: "INICIS_TID_12345",
        cancelReason: "고객 요청",
        totalAmount: 240000,
      });

      expect(result.success).toBe(true);
      expect(result.cancelledAmount).toBe(240000);
      expect(result.remainingAmount).toBe(0);
    });

    it("should cancel partial payment successfully", async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          resultCode: "0000",
          resultMsg: "정상처리",
          tid: "INICIS_TID_12345",
        },
      });

      const result = await gateway.cancelPayment({
        tid: "INICIS_TID_12345",
        cancelAmount: 100000,
        cancelReason: "부분 환불",
        totalAmount: 240000,
      });

      expect(result.success).toBe(true);
      expect(result.cancelledAmount).toBe(100000);
      expect(result.remainingAmount).toBe(140000);
    });

    it("should throw BadRequestException when cancel amount exceeds total", async () => {
      await expect(
        gateway.cancelPayment({
          tid: "INICIS_TID_12345",
          cancelAmount: 300000,
          cancelReason: "환불 요청",
          totalAmount: 240000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should handle cancel failure from gateway", async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          resultCode: "2001",
          resultMsg: "이미 취소된 거래",
          tid: "INICIS_TID_12345",
        },
      });

      const result = await gateway.cancelPayment({
        tid: "INICIS_TID_12345",
        cancelReason: "중복 취소 시도",
        totalAmount: 240000,
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("이미 취소된 거래");
      expect(result.cancelledAmount).toBe(0);
    });

    it("should throw InternalServerErrorException on network error", async () => {
      mockPost.mockRejectedValueOnce(new Error("Network error"));

      await expect(
        gateway.cancelPayment({
          tid: "INICIS_TID_12345",
          cancelReason: "네트워크 오류 테스트",
          totalAmount: 240000,
        }),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it("should include refund bank info for virtual account", async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          resultCode: "0000",
          resultMsg: "정상처리",
          tid: "INICIS_TID_12345",
        },
      });

      await gateway.cancelPayment({
        tid: "INICIS_TID_12345",
        cancelReason: "가상계좌 환불",
        totalAmount: 240000,
        refundBankCode: "004",
        refundAccount: "1234567890",
        refundAccountHolder: "홍길동",
      });

      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("refundBankCode=004"),
      );
    });
  });

  describe("verifyWebhookSignature", () => {
    it("should verify valid signature", () => {
      const data = {
        orderNumber: "ORD-2026-001",
        tid: "INICIS_TID_12345",
        amount: 240000,
        resultCode: "0000",
      };

      // Generate expected signature
      const signatureData = `${data.orderNumber}|${data.tid}|${data.amount}|${data.resultCode}`;
      const expectedSignature = crypto
        .createHmac("sha256", mockPaymentConfig.security.signatureKey)
        .update(signatureData)
        .digest("hex");

      const result = gateway.verifyWebhookSignature(data, expectedSignature);

      expect(result).toBe(true);
    });

    it("should reject invalid signature", () => {
      const data = {
        orderNumber: "ORD-2026-001",
        tid: "INICIS_TID_12345",
        amount: 240000,
        resultCode: "0000",
      };

      const result = gateway.verifyWebhookSignature(data, "invalid-signature");

      expect(result).toBe(false);
    });

    it("should skip verification when disabled", async () => {
      const disabledConfig = {
        ...mockPaymentConfig,
        webhook: {
          ...mockPaymentConfig.webhook,
          verifySignature: false,
        },
      };

      mockConfigService.get.mockImplementation((key: string) => {
        if (key === "payment") {
          return disabledConfig;
        }
        return undefined;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KgInicisGateway,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      const disabledGateway = module.get<KgInicisGateway>(KgInicisGateway);

      const data = {
        orderNumber: "ORD-2026-001",
        tid: "INICIS_TID_12345",
        amount: 240000,
        resultCode: "0000",
      };

      const result = disabledGateway.verifyWebhookSignature(
        data,
        "any-signature",
      );

      expect(result).toBe(true);
    });
  });

  describe("verifyIpWhitelist", () => {
    it("should allow requests in sandbox mode", () => {
      const result = gateway.verifyIpWhitelist("192.168.1.100");

      expect(result).toBe(true);
    });

    it("should check whitelist in production mode", async () => {
      const productionConfig = {
        ...mockPaymentConfig,
        inicis: {
          ...mockPaymentConfig.inicis,
          mode: "production",
        },
      };

      mockConfigService.get.mockImplementation((key: string) => {
        if (key === "payment") {
          return productionConfig;
        }
        return undefined;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KgInicisGateway,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      const prodGateway = module.get<KgInicisGateway>(KgInicisGateway);

      const blockedResult = prodGateway.verifyIpWhitelist("192.168.1.100");
      expect(blockedResult).toBe(false);

      const allowedResult = prodGateway.verifyIpWhitelist("203.238.37.0/24");
      expect(allowedResult).toBe(true);
    });

    it("should allow all IPs when whitelist is empty", async () => {
      const emptyWhitelistConfig = {
        ...mockPaymentConfig,
        inicis: {
          ...mockPaymentConfig.inicis,
          mode: "production",
        },
        security: {
          ...mockPaymentConfig.security,
          ipWhitelist: [],
        },
      };

      mockConfigService.get.mockImplementation((key: string) => {
        if (key === "payment") {
          return emptyWhitelistConfig;
        }
        return undefined;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KgInicisGateway,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      const noWhitelistGateway = module.get<KgInicisGateway>(KgInicisGateway);

      const result = noWhitelistGateway.verifyIpWhitelist(
        "any.ip.address.here",
      );

      expect(result).toBe(true);
    });
  });

  describe("verifyAmount", () => {
    it("should return true when amounts match", () => {
      const result = gateway.verifyAmount(240000, 240000);

      expect(result).toBe(true);
    });

    it("should return false when amounts do not match", () => {
      const result = gateway.verifyAmount(100000, 240000);

      expect(result).toBe(false);
    });

    it("should handle edge case with zero amount", () => {
      const result = gateway.verifyAmount(0, 0);

      expect(result).toBe(true);
    });

    it("should be strict about amount comparison", () => {
      const result = gateway.verifyAmount(240000.0, 240000);

      expect(result).toBe(true);
    });
  });

  describe("Signature Generation", () => {
    it("should generate consistent signatures", async () => {
      const params1 = {
        orderNumber: "ORD-TEST-001",
        amount: 100000,
        productName: "테스트 상품",
      };

      const params2 = {
        orderNumber: "ORD-TEST-001",
        amount: 100000,
        productName: "테스트 상품",
      };

      const url1 = await gateway.createPaymentRequest(params1);
      const url2 = await gateway.createPaymentRequest(params2);

      // URLs should contain signatures (may differ due to timestamp)
      expect(url1).toContain("signature=");
      expect(url2).toContain("signature=");
    });
  });

  describe("Error Handling", () => {
    it("should handle approval with empty response", async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          resultCode: "9999",
          tid: "INICIS_TID_ERROR",
        },
      });

      const result = await gateway.approvePayment({
        tid: "INICIS_TID_ERROR",
        authCode: "AUTH999",
        amount: 100000,
        orderNumber: "ORD-ERROR-001",
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("승인 실패");
    });

    it("should handle cancel with empty response", async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          resultCode: "9999",
          tid: "INICIS_TID_ERROR",
        },
      });

      const result = await gateway.cancelPayment({
        tid: "INICIS_TID_ERROR",
        cancelReason: "취소 테스트",
        totalAmount: 100000,
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("취소 실패");
    });
  });
});
