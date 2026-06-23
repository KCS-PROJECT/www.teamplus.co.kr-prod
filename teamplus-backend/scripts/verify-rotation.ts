/**
 * 10MB 회전 verify 스크립트 (P6-5)
 *
 * 시나리오:
 * 1. access.log에 11MB 더미 데이터 write
 * 2. rotateIfExceeded() 호출 → .log → .log.1, 새 .log
 * 3. 4회 반복 (총 5회) → .log.1 ~ .log.5 누적
 * 4. 1회 더 → .log.5는 .log.6이 아닌 삭제 (백업 한도 5)
 *
 * 실행: npx tsx scripts/verify-rotation.ts
 */
import * as fs from "fs";
import * as path from "path";
import {
  ensureFile,
  formatDate,
  getLogPath,
  rotateIfExceeded,
  ROTATE_MAX_BYTES,
  ROTATE_MAX_BACKUPS,
} from "../src/logger/file-path.util";

const target = getLogPath({ type: "normal", category: "access" });
const dir = path.dirname(target);

console.log("=".repeat(70));
console.log("10MB 회전 verify");
console.log("=".repeat(70));
console.log("대상:", target);
console.log("MAX_BYTES:", (ROTATE_MAX_BYTES / 1024 / 1024).toFixed(0), "MB");
console.log("MAX_BACKUPS:", ROTATE_MAX_BACKUPS);
console.log("-".repeat(70));

// 더미 데이터 한 줄 (~256 bytes)
const dummyLine =
  JSON.stringify({
    level: 30,
    time: new Date().toISOString(),
    category: "access",
    type: "normal",
    msg: "X".repeat(200),
  }) + "\n";

function fillTo11MB() {
  ensureFile(target);
  const repeat = Math.ceil((ROTATE_MAX_BYTES + 1024 * 1024) / dummyLine.length);
  const chunk = dummyLine.repeat(1000);
  let written = 0;
  while (written < ROTATE_MAX_BYTES + 1024 * 1024) {
    fs.appendFileSync(target, chunk);
    written += chunk.length;
  }
}

function showState(label: string) {
  console.log(`\n[${label}]`);
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("access.log"))
    .sort();
  for (const f of files) {
    const fp = path.join(dir, f);
    const sz = fs.statSync(fp).size;
    console.log(`  ${(sz / 1024 / 1024).toFixed(2).padStart(7)} MB — ${f}`);
  }
}

// 시나리오 실행
showState("초기 상태");

for (let i = 1; i <= 6; i++) {
  console.log(`\n--- ${i}회차: 11MB 채우고 rotateIfExceeded() 호출 ---`);
  fillTo11MB();
  const rotated = rotateIfExceeded(target);
  console.log(`  회전 결과: ${rotated ? "✓ 회전됨" : "✗ 미회전"}`);
  showState(`${i}회차 후`);
}

console.log("\n" + "=".repeat(70));
console.log(
  "예상: access.log(새, 0byte) + access.log.1 ~ access.log.5 (총 6개)",
);
console.log("실제 결과를 위 트리에서 확인하세요.");
console.log("=".repeat(70));
