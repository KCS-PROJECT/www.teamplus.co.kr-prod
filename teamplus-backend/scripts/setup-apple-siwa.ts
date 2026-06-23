/**
 * Apple Sign in with Apple(SIWA) 운영 키 자동 주입 스크립트  (앱심사 #9)
 *
 * 사용자가 Apple Developer 에서 발급한 .p8 키만 있으면, AppleTokenService 가
 * 요구하는 4개 환경변수(APPLE_TEAM_ID/APPLE_KEY_ID/APPLE_CLIENT_ID/APPLE_PRIVATE_KEY)를
 * 안전하게 .env 에 주입한다. 운영(generateClientSecret)과 동일한 jose ES256 서명으로
 * .p8 유효성까지 검증한다.
 *
 * 사용법:
 *   npx tsx scripts/setup-apple-siwa.ts --p8 ./AuthKey_ABCDE12345.p8 --key-id ABCDE12345
 *
 * 옵션:
 *   --p8 <path>          (필수) Apple 에서 받은 .p8 파일 경로
 *   --key-id <id>        SIWA Key ID(10자). 미지정 시 파일명 AuthKey_<ID>.p8 에서 자동 추출
 *   --team-id <id>       Apple Team ID(10자). 기본 VG2U99V32J
 *   --client-id <id>     토큰 교환/revoke client_id. 기본 kr.co.teamplus(네이티브 번들 ID)
 *   --env <path>         대상 .env 파일. 기본 <backend>/.env
 *   --no-verify          jose ES256 서명 검증 생략
 *   --dry-run            실제 기록 없이 변경 미리보기(시크릿 마스킹)
 *
 * 안전장치: 기존 .env 는 .env.bak.<timestamp> 로 백업 후 수정. 다른 키/주석 보존.
 *           .p8 / 개인키는 출력에 절대 평문 노출하지 않음. .env 권한 600 설정.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, chmodSync } from "fs";
import { resolve, basename } from "path";

// ── 인자 파서 (--key value / --key=value / --flag) ───────────────────────
function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    if (key.includes("=")) {
      const [k, ...v] = key.split("=");
      out[k] = v.join("=");
    } else {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = true; // boolean flag
      }
    }
  }
  return out;
}

function fail(msg: string): never {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

function mask(s: string, head = 4, tail = 4): string {
  if (s.length <= head + tail) return "*".repeat(s.length);
  return `${s.slice(0, head)}…${s.slice(-tail)} (len=${s.length})`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.h) {
    console.log(
      "사용법: npx tsx scripts/setup-apple-siwa.ts --p8 <AuthKey_XXX.p8> [--key-id XXX] " +
        "[--team-id VG2U99V32J] [--client-id kr.co.teamplus] [--env .env] [--no-verify] [--dry-run]",
    );
    process.exit(0);
  }

  // 1) .p8 경로 ----------------------------------------------------------
  const p8Path = typeof args.p8 === "string" ? resolve(String(args.p8)) : "";
  if (!p8Path) fail("--p8 <.p8 파일 경로> 는 필수입니다.");
  if (!existsSync(p8Path)) fail(`.p8 파일을 찾을 수 없습니다: ${p8Path}`);

  const rawP8 = readFileSync(p8Path, "utf8").trim();
  if (!rawP8.includes("BEGIN PRIVATE KEY")) {
    fail(".p8 내용이 PKCS#8 PEM(-----BEGIN PRIVATE KEY-----) 형식이 아닙니다.");
  }

  // 2) Key ID (미지정 시 파일명에서 추출) --------------------------------
  let keyId = typeof args["key-id"] === "string" ? String(args["key-id"]).trim() : "";
  if (!keyId) {
    const m = basename(p8Path).match(/AuthKey_([A-Za-z0-9]{10})\.p8$/i);
    if (m) {
      keyId = m[1];
      console.log(`ℹ️  파일명에서 Key ID 자동 추출: ${keyId}`);
    }
  }
  if (!/^[A-Za-z0-9]{10}$/.test(keyId)) {
    fail("--key-id 가 10자 영숫자가 아닙니다. (Apple Key ID 형식)");
  }

  // 3) Team ID / Client ID ----------------------------------------------
  const teamId = (typeof args["team-id"] === "string" ? String(args["team-id"]) : "VG2U99V32J").trim();
  if (!/^[A-Za-z0-9]{10}$/.test(teamId)) {
    fail("--team-id 가 10자 영숫자가 아닙니다. (Apple Team ID 형식)");
  }
  const clientId = (typeof args["client-id"] === "string" ? String(args["client-id"]) : "kr.co.teamplus").trim();
  if (!clientId) fail("--client-id 가 비어 있습니다.");

  // 4) 개인키 1줄 정규화(\n 이스케이프) — 운영 service 가 양쪽 모두 처리 ----
  const pemLines = rawP8.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const privateKeyEscaped = pemLines.join("\\n");
  const pkcs8Real = pemLines.join("\n"); // 검증용 실제 개행

  // 5) jose ES256 서명 검증 (운영 generateClientSecret 동일 경로) ---------
  const doVerify = !(args["no-verify"] === true);
  if (doVerify) {
    try {
      const { importPKCS8, SignJWT } = await import("jose");
      const privateKey = await importPKCS8(pkcs8Real, "ES256");
      const jwt = await new SignJWT({})
        .setProtectedHeader({ alg: "ES256", kid: keyId })
        .setIssuer(teamId)
        .setAudience("https://appleid.apple.com")
        .setSubject(clientId)
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(privateKey);
      console.log(`✅ ES256 서명 검증 성공 (client_secret JWT 길이 ${jwt.length}) — .p8 키 유효`);
    } catch (e) {
      fail(
        `.p8 ES256 서명 검증 실패: ${(e as Error).message}\n` +
          "   → .p8 가 SIWA(Sign in with Apple) 용 키이고 손상되지 않았는지 확인하세요.",
      );
    }
  } else {
    console.log("⚠️  --no-verify: jose 서명 검증을 건너뜁니다.");
  }

  // 6) .env 업서트 -------------------------------------------------------
  const envPath = typeof args.env === "string" ? resolve(String(args.env)) : resolve(__dirname, "..", ".env");
  const entries: Record<string, string> = {
    APPLE_TEAM_ID: teamId,
    APPLE_KEY_ID: keyId,
    APPLE_CLIENT_ID: clientId,
    APPLE_PRIVATE_KEY: `"${privateKeyEscaped}"`, // dotenv 가 \n 을 개행으로 확장(double-quote)
  };

  console.log("\n주입할 값 (시크릿 마스킹):");
  console.log(`  APPLE_TEAM_ID     = ${teamId}`);
  console.log(`  APPLE_KEY_ID      = ${keyId}`);
  console.log(`  APPLE_CLIENT_ID   = ${clientId}`);
  console.log(`  APPLE_PRIVATE_KEY = ${mask(privateKeyEscaped)}`);
  console.log(`대상 .env: ${envPath}`);

  if (args["dry-run"] === true) {
    console.log("\n🟡 --dry-run: 실제 기록하지 않았습니다.");
    return;
  }

  const original = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  // 백업
  if (original) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const bak = `${envPath}.bak.${stamp}`;
    copyFileSync(envPath, bak);
    console.log(`\n🗄  기존 .env 백업: ${bak}`);
  }

  const lines = original.length ? original.split(/\r?\n/) : [];
  const remaining = new Set(Object.keys(entries));
  const updated = lines.map((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (m && entries[m[1]] !== undefined) {
      remaining.delete(m[1]);
      return `${m[1]}=${entries[m[1]]}`;
    }
    return line;
  });
  if (remaining.size > 0) {
    if (updated.length && updated[updated.length - 1].trim() !== "") updated.push("");
    updated.push("# Apple Sign in with Apple (SIWA) — setup-apple-siwa.ts 자동 주입");
    for (const k of remaining) updated.push(`${k}=${entries[k]}`);
  }
  let out = updated.join("\n");
  if (!out.endsWith("\n")) out += "\n";
  writeFileSync(envPath, out, "utf8");
  try {
    chmodSync(envPath, 0o600);
  } catch {
    /* 권한 설정 실패는 치명적 아님 */
  }

  console.log("\n✅ .env 주입 완료.");
  console.log("다음 단계:");
  console.log("  1) 백엔드 재시작 → 부팅 로그에 'Apple 자격증명 미설정' 경고가 사라지는지 확인");
  console.log("  2) SIWA 가입 테스트 계정으로 탈퇴 → withdraw-cleanup 시 auth/revoke 호출 로그 확인");
  console.log("  ⚠️ .p8 원본 파일은 안전한 곳에 보관(재다운로드 불가). .env 는 절대 커밋 금지(.gitignore 확인됨).");
}

main().catch((e) => fail((e as Error).message));
