/* eslint-disable no-console */
/**
 * Roles Check — RolesGuard / @Public 누락 정적 검증.
 *
 * 모든 `*.controller.ts` 를 스캔하여 클래스 또는 메서드 한 곳에라도
 *  - `@Roles(...)`  → RolesGuard 가 RBAC 검증
 *  - `@Public()`    → JwtAuthGuard 의도적 우회
 * 둘 다 존재하지 않는 controller / endpoint 를 모두 출력하고 exit 1.
 *
 * Health/Welcome 등 의도적 public 컨트롤러는 WHITELIST 에 추가.
 *
 * 사용:
 *   npx tsx tools/roles-check.ts
 */

import { readFileSync } from "fs";
import { join, relative } from "path";
import { globSync } from "glob";

interface Issue {
  file: string;
  controllerName: string;
  method?: string;
}

/** 의도적으로 인증 없이 노출되는 컨트롤러/엔드포인트 — 진단 false positive 회피 */
const WHITELIST: Record<string, string[] | "all"> = {
  AppController: "all", // /health, /welcome
};

function loadControllerFiles(): string[] {
  const cwd = process.cwd();
  const root = cwd.endsWith("tools") ? join(cwd, "..") : cwd;
  return globSync("src/**/*.controller.ts", {
    cwd: root,
    ignore: ["**/*.spec.ts", "**/__tests__/**"],
    absolute: true,
  });
}

const HTTP_DECORATORS = ["Get", "Post", "Put", "Patch", "Delete", "All", "Options", "Head"];

interface MethodInfo {
  name: string;
  decoratorBlock: string; // 메서드 직전 데코레이터 텍스트
}

/**
 * controller 파일에서 클래스 레벨 데코레이터 영역 + 각 메서드 데코레이터 블럭 추출.
 * TypeScript AST 미사용 — 단순 라인 기반 스캔으로 안정성·속도 확보.
 */
function parseController(src: string): {
  className: string;
  classDecorators: string;
  methods: MethodInfo[];
} {
  const lines = src.split("\n");

  // export class XXX 위치
  let classLineIdx = -1;
  let className = "(unknown)";
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*export\s+class\s+(\w+)/);
    if (m) {
      classLineIdx = i;
      className = m[1];
      break;
    }
  }
  if (classLineIdx === -1) {
    return { className, classDecorators: "", methods: [] };
  }

  // 클래스 레벨 데코레이터: 클래스 선언 위로 연속된 `@` 라인을 수집
  // export class 위 데코레이터 블록 — `@Decorator(...)` 멀티라인 포함
  const classDecorators = lines.slice(0, classLineIdx).join("\n");

  // 메서드 추출 — 클래스 본문 내에서 데코레이터 라인 + HTTP 메서드 데코레이터 + 메서드 시그니처
  const methods: MethodInfo[] = [];
  let currentDecorators: string[] = [];
  let depthInDecoratorCall = 0;

  for (let i = classLineIdx + 1; i < lines.length; i++) {
    const line = lines[i];

    // 데코레이터 라인 시작: `  @Xxx(`
    if (/^\s*@/.test(line) || depthInDecoratorCall > 0) {
      currentDecorators.push(line);
      // 괄호 균형 추적 (멀티라인 데코레이터 지원: @ApiResponse({ ... }))
      for (const ch of line) {
        if (ch === "(") depthInDecoratorCall++;
        else if (ch === ")") depthInDecoratorCall = Math.max(0, depthInDecoratorCall - 1);
      }
      continue;
    }

    // 메서드 시그니처 라인: `  async xxx(` 또는 `  xxx(`
    const methodMatch = line.match(/^\s*(?:public\s+|private\s+|protected\s+)?(?:async\s+)?(\w+)\s*\(/);
    if (
      methodMatch &&
      currentDecorators.length > 0 &&
      // constructor 제외
      methodMatch[1] !== "constructor" &&
      // HTTP 데코레이터 포함 여부 (실제 endpoint 메서드만)
      currentDecorators.some((l) =>
        HTTP_DECORATORS.some((d) => new RegExp(`@${d}\\s*\\(`).test(l)),
      )
    ) {
      methods.push({
        name: methodMatch[1],
        decoratorBlock: currentDecorators.join("\n"),
      });
      currentDecorators = [];
      continue;
    }

    // 그 외 라인 — 데코레이터 추적 리셋
    if (line.trim() !== "" && !/^\s*\}/.test(line)) {
      currentDecorators = [];
    }
  }

  return { className, classDecorators, methods };
}

function checkFile(filePath: string): Issue[] {
  const src = readFileSync(filePath, "utf-8");
  const { className, classDecorators, methods } = parseController(src);
  const issues: Issue[] = [];

  const classHasRoles = /@Roles\s*\(/.test(classDecorators);
  const classHasPublic = /@Public\s*\(\s*\)/.test(classDecorators);
  if (classHasRoles || classHasPublic) return issues;

  // WHITELIST 체크
  const wl = WHITELIST[className];
  if (wl === "all") return issues;

  for (const m of methods) {
    if (Array.isArray(wl) && wl.includes(m.name)) continue;
    const methodHasRoles = /@Roles\s*\(/.test(m.decoratorBlock);
    const methodHasPublic = /@Public\s*\(\s*\)/.test(m.decoratorBlock);
    if (!methodHasRoles && !methodHasPublic) {
      issues.push({ file: filePath, controllerName: className, method: m.name });
    }
  }
  return issues;
}

function main() {
  const files = loadControllerFiles();
  const allIssues: Issue[] = [];
  for (const f of files) {
    allIssues.push(...checkFile(f));
  }

  if (allIssues.length === 0) {
    console.log(
      `✅ [roles-check] ${files.length} controller(s) inspected — no missing @Roles/@Public.`,
    );
    process.exit(0);
  }

  const cwd = process.cwd();
  console.error(
    `❌ [roles-check] ${allIssues.length} endpoint(s) missing @Roles or @Public:`,
  );
  // 동일 컨트롤러 묶음 출력
  const byController = new Map<string, Issue[]>();
  for (const i of allIssues) {
    const key = `${relative(cwd, i.file)} :: ${i.controllerName}`;
    if (!byController.has(key)) byController.set(key, []);
    byController.get(key)!.push(i);
  }
  for (const [key, issues] of byController) {
    console.error(`\n  ${key}`);
    for (const i of issues) {
      console.error(`    - ${i.method}`);
    }
  }
  console.error(
    "\nFix: 클래스 레벨 또는 메서드 레벨에 @Roles('ADMIN', ...) 또는 @Public() 추가.",
  );
  process.exit(1);
}

main();
