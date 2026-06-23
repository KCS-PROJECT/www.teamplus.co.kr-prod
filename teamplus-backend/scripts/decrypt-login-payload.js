#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function loadEnv(envPath) {
  const env = {};
  const contents = fs.readFileSync(envPath, "utf8");

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;

    const index = line.indexOf("=");
    const key = line.slice(0, index);
    const value = line.slice(index + 1);
    env[key] = value;
  }

  return env;
}

function getSecretKey() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    throw new Error(`.env 파일을 찾을 수 없습니다: ${envPath}`);
  }

  const env = loadEnv(envPath);
  const key = env.CRYPTO_SECRET_KEY;

  if (!key || key.length !== 64) {
    throw new Error(
      "CRYPTO_SECRET_KEY가 없거나 64자리 hex 문자열이 아닙니다.",
    );
  }

  return Buffer.from(key, "hex");
}

function parsePayload(raw) {
  const parsed = JSON.parse(raw);

  if (
    !parsed ||
    typeof parsed.encryptedData !== "string" ||
    typeof parsed.iv !== "string" ||
    typeof parsed.authTag !== "string"
  ) {
    throw new Error(
      "payload는 encryptedData, iv, authTag 문자열을 포함해야 합니다.",
    );
  }

  return parsed;
}

function decryptPayload(payload, key) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(payload.iv, "base64"),
  );

  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));

  let decrypted = decipher.update(
    Buffer.from(payload.encryptedData, "base64"),
    undefined,
    "utf8",
  );
  decrypted += decipher.final("utf8");

  return decrypted;
}

function readFromStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data.trim()));
    process.stdin.on("error", reject);
  });
}

async function getRawInput() {
  const arg = process.argv[2];

  if (arg) {
    const filePath = path.resolve(process.cwd(), arg);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return fs.readFileSync(filePath, "utf8").trim();
    }
    return arg;
  }

  if (process.stdin.isTTY) {
    throw new Error(
      "복호화할 payload를 인자로 넘기거나 stdin으로 전달해야 합니다.",
    );
  }

  return readFromStdin();
}

async function main() {
  try {
    const rawInput = await getRawInput();
    const payload = parsePayload(rawInput);
    const secretKey = getSecretKey();
    const decrypted = decryptPayload(payload, secretKey);

    try {
      const parsed = JSON.parse(decrypted);
      process.stdout.write(`${JSON.stringify(parsed, null, 2)}\n`);
    } catch {
      process.stdout.write(`${decrypted}\n`);
    }
  } catch (error) {
    process.stderr.write(
      `decrypt-login-payload 실패: ${error.message || String(error)}\n`,
    );
    process.stderr.write(
      "사용법: npm run auth:decrypt -- '{\"encryptedData\":\"...\",\"iv\":\"...\",\"authTag\":\"...\"}'\n",
    );
    process.stderr.write(
      "또는   : cat payload.json | npm run auth:decrypt\n",
    );
    process.exit(1);
  }
}

main();
