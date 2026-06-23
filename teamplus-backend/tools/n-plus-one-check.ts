/* eslint-disable no-console */
/**
 * N+1 Query Heuristic Detector (2026-05-14 신규)
 *
 * 정적 분석으로 Prisma `include` 남용 / `select` 누락 위험을 탐지한다.
 * 진정한 런타임 N+1 은 EXPLAIN 또는 query log 가 필요하지만, 본 도구는
 * *예방* 차원에서 다음 신호를 보고:
 *
 *  1. `findMany({ include: ... })` 없이 `findMany()` 만 호출 — select 누락
 *  2. 중첩 `include` 3단계 이상 — JOIN 비대화 위험
 *  3. `await ... .map(async ... findUnique/findFirst)` — 반복 호출 패턴
 *  4. `for (... of ...) { await prisma. ... }` — 직렬 N+1
 *
 * 사용:
 *   npm run perf:n-plus-one
 *
 * 결과는 우선순위(high/medium/low)와 함께 출력. exit code 는 항상 0
 * (정보 제공 목적). CI 에서 차단하려면 본 스크립트를 fail 모드로 확장.
 */

import { readFileSync } from "fs";
import { join, relative } from "path";
import { globSync } from "glob";

interface Finding {
  file: string;
  line: number;
  severity: "high" | "medium" | "low";
  category: string;
  snippet: string;
  hint: string;
}

function loadSourceFiles(): string[] {
  const cwd = process.cwd();
  const root = cwd.endsWith("tools") ? join(cwd, "..") : cwd;
  return globSync("src/**/*.ts", {
    cwd: root,
    ignore: ["**/*.spec.ts", "**/__tests__/**", "**/*.dto.ts"],
    absolute: true,
  });
}

function analyzeFile(filePath: string): Finding[] {
  const findings: Finding[] = [];
  const src = readFileSync(filePath, "utf-8");
  const lines = src.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNo = i + 1;

    // 1) findMany() 또는 findMany({ where: ... }) 만 — select/include 없음 → 전체 컬럼 SELECT
    if (
      /\.findMany\(\s*\)/.test(line) ||
      (/\.findMany\(\s*\{/.test(line) &&
        !/select\s*:/.test(line) &&
        !/include\s*:/.test(line) &&
        // 다음 5라인까지 검사
        !lines
          .slice(i, Math.min(lines.length, i + 40))
          .some((l) => /\s+(select|include)\s*:/.test(l)))
    ) {
      // count() 같은 단순 메서드는 제외 — findMany 만
      if (/\.findMany\(/.test(line)) {
        findings.push({
          file: filePath,
          line: lineNo,
          severity: "medium",
          category: "missing-select",
          snippet: trimmed.slice(0, 120),
          hint:
            "findMany() 에 select 명시 권장 — 전체 컬럼 SELECT 회피, payload 축소.",
        });
      }
    }

    // 2) 중첩 include 3단계 이상 — 같은 라인에 include 가 3번 이상
    const includeCount = (line.match(/include\s*:/g) || []).length;
    if (includeCount >= 3) {
      findings.push({
        file: filePath,
        line: lineNo,
        severity: "high",
        category: "deep-include",
        snippet: trimmed.slice(0, 160),
        hint:
          "include 3단계 이상 — Cartesian product 위험. 분리된 쿼리 또는 select 로 필요 필드만 추출 권장.",
      });
    }

    // 3) await ... .map(async ... findUnique/findFirst) — 컬렉션 순회 중 단건 조회
    if (
      /\.map\s*\(\s*async/.test(line) &&
      lines
        .slice(i, Math.min(lines.length, i + 8))
        .some((l) =>
          /await\s+(this\.prisma|prisma|tx)\.\w+\.(findUnique|findFirst|count)/.test(
            l,
          ),
        )
    ) {
      findings.push({
        file: filePath,
        line: lineNo,
        severity: "high",
        category: "map-await-find",
        snippet: trimmed.slice(0, 160),
        hint:
          "Array.map(async) 내부에서 findUnique/findFirst 반복 호출 — 명백한 N+1. " +
          "findMany({ where: { id: { in: [...] } } }) 한 번으로 일괄 조회 후 Map 으로 매핑 권장.",
      });
    }

    // 4) for...of 안에서 await prisma. — 직렬 N+1
    //    상수 배열(UPPER_SNAKE_CASE) 순회는 제외 — 컴파일 타임 상수라 N+1 무관.
    //    [개선 2026-05-14 v3] for 블록의 실제 종료 `}` 까지만 검사 — 25라인 고정 윈도우 false positive 제거.
    const forOfMatch = line.match(/^\s*for\s*\(.+of\s+([A-Z_][A-Z0-9_]*)\s*\)/);
    const isConstantArrayLoop = !!forOfMatch;
    if (/^\s*for\s*\(.+of\s+.+\)/.test(line) && !isConstantArrayLoop) {
      // 라인 끝의 `{` 위치 확인 (없으면 매칭 실패로 간주)
      if (/\{\s*$/.test(line)) {
        // 블록 끝을 찾는다 — brace 카운트 기반
        let depth = 1;
        let blockEnd = i + 1;
        for (let j = i + 1; j < lines.length; j++) {
          const l = lines[j];
          // 단순 카운트 — 문자열/주석은 일반 코드에서 흔히 무시 가능 (heuristic)
          for (const ch of l) {
            if (ch === "{") depth++;
            else if (ch === "}") depth--;
            if (depth === 0) {
              blockEnd = j;
              break;
            }
          }
          if (depth === 0) break;
          if (j - i > 200) {
            blockEnd = j;
            break;
          }
        }
        const hasAwaitPrisma = lines
          .slice(i + 1, blockEnd)
          .some((l) =>
            /await\s+(this\.prisma|prisma|tx)\.\w+\.(findUnique|findFirst|findMany|create|update|delete|upsert)/.test(
              l,
            ),
          );
        if (hasAwaitPrisma) {
          findings.push({
            file: filePath,
            line: lineNo,
            severity: "high",
            category: "loop-await-prisma",
            snippet: trimmed.slice(0, 120),
            hint:
              "for...of 안에서 Prisma 호출 — 직렬 N+1. Promise.all + 일괄 쿼리 또는 $transaction 으로 묶어 처리 권장.",
          });
        }
      }
    }
  }
  return findings;
}

function main() {
  const files = loadSourceFiles();
  const all: Finding[] = [];
  for (const f of files) {
    all.push(...analyzeFile(f));
  }

  if (all.length === 0) {
    console.log(
      `✅ [n-plus-one-check] ${files.length} files inspected — no heuristic findings.`,
    );
    process.exit(0);
  }

  const cwd = process.cwd();
  const bySeverity = {
    high: all.filter((f) => f.severity === "high"),
    medium: all.filter((f) => f.severity === "medium"),
    low: all.filter((f) => f.severity === "low"),
  };

  console.log(
    `🔍 [n-plus-one-check] ${all.length} potential issues across ${files.length} files`,
  );
  console.log(
    `  high=${bySeverity.high.length}, medium=${bySeverity.medium.length}, low=${bySeverity.low.length}`,
  );

  for (const [severity, list] of Object.entries(bySeverity)) {
    if (list.length === 0) continue;
    console.log(`\n=== ${severity.toUpperCase()} (${list.length}) ===`);
    // category 별 묶음
    const byCategory = new Map<string, Finding[]>();
    for (const f of list) {
      if (!byCategory.has(f.category)) byCategory.set(f.category, []);
      byCategory.get(f.category)!.push(f);
    }
    const showAll = process.argv.includes("--all");
    for (const [category, items] of byCategory) {
      console.log(`\n  [${category}] ${items.length} occurrence(s)`);
      const sliceMax = showAll ? items.length : 5;
      for (const item of items.slice(0, sliceMax)) {
        const rel = relative(cwd, item.file);
        console.log(`    ${rel}:${item.line}`);
        console.log(`      ${item.snippet}`);
      }
      if (!showAll && items.length > 5) {
        console.log(`    ... +${items.length - 5} more (use --all to view)`);
      }
      console.log(`    💡 ${items[0].hint}`);
    }
  }

  console.log(
    "\n📌 본 도구는 정보 제공용입니다. 실제 N+1 확인은 query log + EXPLAIN ANALYZE 권장.",
  );
  // exit 0 — CI 차단 모드는 별도 ENV (N_PLUS_ONE_FAIL=1)
  process.exit(process.env.N_PLUS_ONE_FAIL === "1" && bySeverity.high.length > 0 ? 1 : 0);
}

main();
