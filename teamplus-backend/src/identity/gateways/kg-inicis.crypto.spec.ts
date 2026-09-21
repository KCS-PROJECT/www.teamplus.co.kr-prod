import {
  MTXID_LENGTH,
  isSeedCipherAvailable,
  assertAuthRequestUrl,
  buildAuthHash,
  buildAutoSubmitForm,
  buildUserHash,
  deriveMTxId,
  escapeHtml,
  seedDecrypt,
  seedEncrypt,
} from "./kg-inicis.crypto";

/**
 * KG이니시스 통합인증 순수 함수 검증
 *
 * SEED 는 `--openssl-legacy-provider` 가 있어야 동작한다
 * (npm scripts 는 cross-env NODE_OPTIONS 로 주입).
 */
describe("kg-inicis.crypto", () => {
  const MID = "INIiasTest";
  const API_KEY = "TGdxb2l3enJDWFRTbTgvREU3MGYwUT09";
  const MTXID = "abcdefghij0123456789";
  const ALLOWED_HOSTS = ["kssa.inicis.com", "fcsa.inicis.com"];
  const SEED_IV = "SASKGINICIS00000";
  // STEP2 token 은 Base64 디코딩 시 16 byte 여야 한다.
  const TOKEN = Buffer.alloc(16, 7).toString("base64");

  describe("buildAuthHash", () => {
    it("SHA256(mid + mTxId + apikey) 소문자 hex 고정 벡터", () => {
      expect(buildAuthHash(MID, MTXID, API_KEY)).toBe(
        "d32c4c1c9ae2c979ace7df91d0ba606cff83e0c7eba3c8ba3df40ea110672e06",
      );
    });

    it("결합 순서가 다르면 다른 값이 나온다", () => {
      expect(buildAuthHash(MID, MTXID, API_KEY)).not.toBe(
        buildAuthHash(MTXID, MID, API_KEY),
      );
    });
  });

  describe("buildUserHash", () => {
    it("SHA256(userName + mid + userPhone + mTxId + userBirth + reqSvcCd) 고정 벡터", () => {
      expect(
        buildUserHash("홍길동", MID, "01012345678", MTXID, "19900315", "01"),
      ).toBe(
        "b35c08896fe62c2c1c57df072a9f31a5f03891331a79ed45beb581ee7d84c47b",
      );
    });
  });

  describe("deriveMTxId", () => {
    const requestId = "idv_0123456789abcdef0123456789abcdef";

    it("requestId 의 uuid 앞 20 hex 를 쓴다", () => {
      expect(deriveMTxId(requestId)).toBe("0123456789abcdef0123");
    });

    it("같은 requestId 는 항상 같은 값 (결정적)", () => {
      expect(deriveMTxId(requestId)).toBe(deriveMTxId(requestId));
    });

    it("다른 requestId 는 다른 값", () => {
      expect(deriveMTxId(requestId)).not.toBe(
        deriveMTxId("idv_ffffffffffffffffffffffffffffffff"),
      );
    });

    it("규격 외 짧은 requestId 도 길이 20 을 보장한다", () => {
      expect(deriveMTxId("idv_short")).toHaveLength(MTXID_LENGTH);
      expect(deriveMTxId(requestId)).toHaveLength(MTXID_LENGTH);
    });
  });

  describe("assertAuthRequestUrl", () => {
    it("허용 호스트는 통과한다", () => {
      expect(() =>
        assertAuthRequestUrl(
          "https://kssa.inicis.com/api/result",
          ALLOWED_HOSTS,
        ),
      ).not.toThrow();
      expect(() =>
        assertAuthRequestUrl("https://fcsa.inicis.com/auth/api", ALLOWED_HOSTS),
      ).not.toThrow();
    });

    it("서브도메인 사칭(kssa.inicis.com.evil.io)을 차단한다", () => {
      expect(() =>
        assertAuthRequestUrl(
          "https://kssa.inicis.com.evil.io/api/result",
          ALLOWED_HOSTS,
        ),
      ).toThrow();
    });

    it("http 는 차단한다", () => {
      expect(() =>
        assertAuthRequestUrl("http://kssa.inicis.com/api", ALLOWED_HOSTS),
      ).toThrow();
    });

    it("빈 값은 차단한다", () => {
      expect(() => assertAuthRequestUrl("", ALLOWED_HOSTS)).toThrow();
      expect(() => assertAuthRequestUrl(undefined, ALLOWED_HOSTS)).toThrow();
    });

    it("허용 목록 밖 호스트는 차단한다", () => {
      expect(() =>
        assertAuthRequestUrl("https://evil.example.com/api", ALLOWED_HOSTS),
      ).toThrow();
    });
  });

  describe("SEED 가용성", () => {
    it("실행 옵션이 적용된 환경에서는 seed-cbc 가 노출된다", () => {
      expect(isSeedCipherAvailable()).toBe(true);
    });

    /**
     * 로드 시점에 throw 하면 AppModule → IdentityModule import 체인을 타고
     * 백엔드 전체 부팅이 실패한다. 모듈 로드는 통과하고, 사용 시점에만 끊겨야 한다.
     */
    it("미노출이어도 모듈 로드는 통과하고 사용 시점에만 throw 한다", () => {
      jest.isolateModules(() => {
        jest.doMock("crypto", () => ({
          ...jest.requireActual("crypto"),
          getCiphers: () => ["aes-256-cbc"],
        }));

        // require 자체가 throw 하지 않는 것이 이 테스트의 핵심이다.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require("./kg-inicis.crypto");

        expect(mod.isSeedCipherAvailable()).toBe(false);
        expect(() => mod.seedDecrypt("AAAA", TOKEN, SEED_IV)).toThrow(
          /openssl-legacy-provider/,
        );
        expect(() => mod.seedEncrypt("홍길동", TOKEN, SEED_IV)).toThrow(
          /openssl-legacy-provider/,
        );
      });
      jest.dontMock("crypto");
    });
  });

  describe("seedDecrypt", () => {
    it("한글 평문을 왕복한다", () => {
      const plain = "홍길동";
      const cipher = seedEncrypt(plain, TOKEN, SEED_IV);
      expect(cipher).not.toBe(plain);
      expect(seedDecrypt(cipher, TOKEN, SEED_IV)).toBe(plain);
    });

    it("긴 한글 평문도 왕복한다 (패딩 경계)", () => {
      const plain = "대한민국 아이스하키 협회 본인확인 테스트";
      expect(
        seedDecrypt(seedEncrypt(plain, TOKEN, SEED_IV), TOKEN, SEED_IV),
      ).toBe(plain);
    });

    it("잘못된 token 으로는 복호화되지 않는다", () => {
      const cipher = seedEncrypt("홍길동", TOKEN, SEED_IV);
      const wrongToken = Buffer.alloc(16, 9).toString("base64");
      expect(() => seedDecrypt(cipher, wrongToken, SEED_IV)).toThrow();
    });

    it("키 길이가 16 byte 가 아니면 throw 한다", () => {
      expect(() =>
        seedDecrypt("AAAA", Buffer.alloc(8).toString("base64"), SEED_IV),
      ).toThrow();
    });
  });

  describe("buildAutoSubmitForm", () => {
    it("모든 값과 이름을 HTML escape 한다", () => {
      const html = buildAutoSubmitForm("https://sa.inicis.com/auth", {
        mid: '"><script>alert(1)</script>',
        mTxId: "a&b",
      });

      expect(html).not.toContain("<script>alert(1)</script>");
      expect(html).toContain("&quot;&gt;&lt;script&gt;alert(1)");
      expect(html).toContain('value="a&amp;b"');
      expect(html).toContain('action="https://sa.inicis.com/auth"');
    });

    it("undefined 필드는 렌더링하지 않는다", () => {
      const html = buildAutoSubmitForm("https://sa.inicis.com/auth", {
        mid: "INIiasTest",
        userHash: undefined,
      });

      expect(html).toContain('name="mid"');
      expect(html).not.toContain('name="userHash"');
    });

    it("자동 submit 스크립트와 noscript 대체 버튼을 포함한다", () => {
      const html = buildAutoSubmitForm("https://sa.inicis.com/auth", {
        mid: "INIiasTest",
      });

      expect(html).toContain('method="post"');
      expect(html).toContain(
        "document.getElementById('inicisAuthForm').submit()",
      );
      expect(html).toContain("<noscript>");
    });
  });

  describe("escapeHtml", () => {
    it("특수문자 5종을 변환한다", () => {
      expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
    });
  });
});
