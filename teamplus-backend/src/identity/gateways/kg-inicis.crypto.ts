import * as crypto from "crypto";

/**
 * KG이니시스 통합인증 순수 함수 모듈
 *
 * 규격 SoT: docs/Reference/INICIS_UNIFIED_IDENTITY_API.md
 *
 * Nest DI 없이 단독 테스트가 가능하도록 부수효과 없는 함수만 둔다.
 * 해시·URL 검증·SEED 복호화·자동 submit 폼 생성이 전부 여기에 모인다.
 */

/** SEED/CBC/PKCS5 — 표준 crypto 알고리즘 이름 */
const SEED_CIPHER = "seed-cbc";

/** 실행 옵션 안내 — 로그와 예외 메시지에서 함께 쓴다. */
export const SEED_UNAVAILABLE_MESSAGE =
  "[KG이니시스 통합인증] SEED 알고리즘(seed-cbc)을 사용할 수 없습니다. " +
  "Node 실행 옵션에 --openssl-legacy-provider 를 추가하세요 " +
  "(npm scripts 는 cross-env NODE_OPTIONS, pm2 는 ecosystem.config.cjs 의 node_args).";

/**
 * Node 표준 crypto 는 `--openssl-legacy-provider` 없이 SEED 를 노출하지 않는다.
 *
 * 로드 시점에 throw 하면 import 체인(AppModule → IdentityModule)을 타고 백엔드 전체 부팅이
 * 실패하므로, 가용성 확인은 여기서 제공만 하고 판단은 호출부에 맡긴다.
 */
export function isSeedCipherAvailable(): boolean {
  return crypto.getCiphers().includes(SEED_CIPHER);
}

/** SEED 사용 직전 가드 — 미노출이면 원인이 드러나는 메시지로 끊는다. */
function assertSeedCipherAvailable(): void {
  if (!isSeedCipherAvailable()) {
    throw new Error(SEED_UNAVAILABLE_MESSAGE);
  }
}

/** KG `mTxId` 최대 길이 (20 byte) */
export const MTXID_LENGTH = 20;

/** SHA256 소문자 hex */
function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * STEP1 `authHash` = SHA256(mid + mTxId + apikey)
 */
export function buildAuthHash(
  mid: string,
  mTxId: string,
  apiKey: string,
): string {
  return sha256Hex(`${mid}${mTxId}${apiKey}`);
}

/**
 * STEP1 `userHash` = SHA256(userName + mid + userPhone + mTxId + userBirth + reqSvcCd)
 * `flgFixedUser=Y` 일 때만 필요하다.
 */
export function buildUserHash(
  userName: string,
  mid: string,
  userPhone: string,
  mTxId: string,
  userBirth: string,
  reqSvcCd: string,
): string {
  return sha256Hex(
    `${userName}${mid}${userPhone}${mTxId}${userBirth}${reqSvcCd}`,
  );
}

/**
 * requestId(`idv_` + uuid32 = 36자) → KG `mTxId`(20 byte 제한) 결정적 파생.
 *
 * STEP4 응답의 mTxId 를 같은 함수로 재계산해 대조하므로 별도 저장이 필요 없다.
 * 규격 외 길이의 requestId 도 항상 20자를 얻도록 해시 폴백을 둔다.
 */
export function deriveMTxId(requestId: string): string {
  const sliced = requestId.slice(4, 4 + MTXID_LENGTH);
  if (sliced.length === MTXID_LENGTH) {
    return sliced;
  }
  return sha256Hex(requestId).slice(0, MTXID_LENGTH);
}

/**
 * STEP2 `authRequestUrl` 검증 (SSRF 차단).
 *
 * prefix 비교(`startsWith`/`includes`)는 `https://kssa.inicis.com.evil.io` 를 통과시킨다.
 * URL 파싱 후 hostname 을 허용 집합과 정확히 일치시키는 방식만 안전하다.
 *
 * @throws 검증 실패 시 Error — 호출부는 STEP3 요청을 보내지 않아야 한다.
 */
export function assertAuthRequestUrl(
  url: string | undefined | null,
  allowedHosts: string[],
): void {
  if (!url || typeof url !== "string") {
    throw new Error("결과조회 URL이 비어 있습니다.");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("결과조회 URL 형식이 올바르지 않습니다.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error(
      `결과조회 URL이 HTTPS가 아닙니다: protocol=${parsed.protocol}`,
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  const allowed = allowedHosts.map((h) => h.trim().toLowerCase());
  if (!allowed.includes(hostname)) {
    throw new Error(`허용되지 않은 결과조회 호스트입니다: ${hostname}`);
  }
}

/** SEED 키(=STEP2 token) 버퍼화 */
function seedKey(tokenBase64: string): Buffer {
  return Buffer.from(tokenBase64, "base64");
}

/**
 * STEP4 개인정보 복호화 — SEED/CBC/PKCS5Padding.
 *
 * KEY = STEP2 `token` 을 Base64 디코딩한 16 byte, IV = 가맹점 SEED IV.
 * PKCS5 는 Node 기본 패딩이라 별도 설정이 필요 없다.
 */
export function seedDecrypt(
  cipherBase64: string,
  tokenBase64: string,
  iv: string,
): string {
  assertSeedCipherAvailable();
  const decipher = crypto.createDecipheriv(
    SEED_CIPHER,
    seedKey(tokenBase64),
    Buffer.from(iv, "utf8"),
  );
  return Buffer.concat([
    decipher.update(Buffer.from(cipherBase64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * SEED 암호화 — 복호화 경로를 왕복 검증하기 위한 대응 함수.
 * 운영 흐름에서 가맹점이 암호화할 일은 없다(KG 가 암호화해서 보낸다).
 */
export function seedEncrypt(
  plain: string,
  tokenBase64: string,
  iv: string,
): string {
  assertSeedCipherAvailable();
  const cipher = crypto.createCipheriv(
    SEED_CIPHER,
    seedKey(tokenBase64),
    Buffer.from(iv, "utf8"),
  );
  return Buffer.concat([
    cipher.update(Buffer.from(plain, "utf8")),
    cipher.final(),
  ]).toString("base64");
}

/** HTML 속성값 이스케이프 — 폼 필드에 섞인 따옴표/꺾쇠로 마크업이 깨지거나 스크립트가 주입되는 것을 막는다. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * STEP1 자동 submit 폼 HTML 생성.
 *
 * 인증창 호출은 `application/x-www-form-urlencoded` POST 라 리다이렉트로는 보낼 수 없다.
 * 값·이름·action 전부 이스케이프한다.
 */
export function buildAutoSubmitForm(
  actionUrl: string,
  fields: Record<string, string | undefined>,
): string {
  const inputs = Object.entries(fields)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(
      ([name, value]) =>
        `    <input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`,
    )
    .join("\n");

  return [
    "<!DOCTYPE html>",
    '<html lang="ko">',
    "  <head>",
    '    <meta charset="utf-8" />',
    "    <title>본인인증</title>",
    "  </head>",
    "  <body>",
    `    <form id="inicisAuthForm" method="post" accept-charset="UTF-8" action="${escapeHtml(actionUrl)}">`,
    inputs,
    "      <noscript>",
    '        <button type="submit">본인인증 계속하기</button>',
    "      </noscript>",
    "    </form>",
    "    <script>document.getElementById('inicisAuthForm').submit();</script>",
    "  </body>",
    "</html>",
  ].join("\n");
}
