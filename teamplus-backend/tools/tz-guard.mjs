#!/usr/bin/env node
/**
 * TZ 가드 — 서버 타임존 의존 시간 코드의 신규 유입 차단 (prebuild 훅).
 *
 * 금지 패턴 (근거: claudedocs/timezone-storage-redesign-2026-07-02.md · docs/solutions/2026-07-02-timezone-step3-scheduled-date.md):
 *  1. 오프셋 없는 날짜시각 리터럴 파싱  예) new Date(`${d}T00:00:00`)
 *     → 서버 로컬 TZ 로 해석되어 환경마다 다른 순간 저장. Z 또는 +09:00 명시 필수
 *     (kst-date.util 의 dateOnlyToUtc / parseKstDateOnly / composeKstInstant 사용).
 *  2. Date#toLocaleTimeString / toLocaleDateString — 서버 TZ 재변환으로 시각/날짜 시프트.
 *     시각 표시는 startTime("HH:mm") SoT 또는 schedule-time.util(resolveScheduleTime) 사용.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = new URL("../src", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const RULES = [
  {
    name: "오프셋 없는 날짜시각 리터럴 (Z/+09:00 필수)",
    // 시각 리터럴 직후 따옴표/백틱 종료 = 오프셋·밀리초 없음
    re: /T\d{2}:\d{2}:\d{2}["'`]/,
  },
  {
    name: "toLocaleTimeString/toLocaleDateString (서버 TZ 재변환 금지)",
    re: /toLocale(Time|Date)String\(/,
  },
];

const violations = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (p.endsWith(".ts") && !p.endsWith(".spec.ts")) scan(p);
  }
}

function scan(file) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, ""); // 주석 제외
    for (const rule of RULES) {
      if (rule.re.test(code)) {
        violations.push(`${file}:${i + 1} [${rule.name}]\n    ${line.trim()}`);
      }
    }
  });
}

walk(SRC);

if (violations.length > 0) {
  console.error(`\n✗ TZ 가드 실패 — 서버 TZ 의존 패턴 ${violations.length}건:\n`);
  for (const v of violations) console.error("  " + v + "\n");
  console.error("  해결: src/common/utils/kst-date.util.ts · schedule-time.util.ts 유틸 사용");
  console.error("  규약: docs/Guides/CLAUDE_STANDARDS.md 시간 처리 절 참조\n");
  process.exit(1);
}
console.log("✓ TZ 가드 통과 — 서버 TZ 의존 패턴 0건");
