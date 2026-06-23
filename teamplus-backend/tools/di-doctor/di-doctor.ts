#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * NestJS DI Doctor
 * ================
 *
 * NestJS 의존성 주입(DI) 그래프를 정적 분석하여 다음 문제를 빌드 전에 탐지하고 자동 수정합니다:
 *   1. `@Injectable()` 서비스의 생성자 파라미터로 주입하는 Provider 가
 *      해당 서비스가 속한 모듈의 스코프에서 해결 가능한지 검증
 *   2. 해결 불가 시, 그 Provider 를 export 하는 모듈을 역추적하여
 *      `imports: [XxxModule]` 누락을 자동으로 추가(--fix 모드)
 *
 * 특징:
 *   - Zero external dependency. 프로젝트에 이미 설치된 `typescript` 만 사용.
 *   - @Global() 모듈의 exports 는 자동으로 전역 스코프에 포함
 *   - 부팅하지 않고도 DI 에러를 미리 잡아내 CI/개발 루프 초반에 차단
 *
 * 사용법:
 *   npm run di:verify           # 검증만 (CI에서 사용)
 *   npm run di:fix              # 자동 수정 (로컬 개발 루프)
 *   npm run di:verify -- --json # JSON 출력 (Claude Code 에이전트용)
 */

import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";

// ────────────────────────────────────────────────────────────────
// 설정
// ────────────────────────────────────────────────────────────────
const SRC_ROOT = path.resolve(__dirname, "..", "..", "src");

/** `@Injectable()` 서비스 정보 */
interface ServiceInfo {
  name: string;
  filePath: string;
  /** 생성자에서 주입받는 타입 이름 목록 (readonly private xxx: YyyService → 'YyyService') */
  dependencies: string[];
}

/** `@Module()` 모듈 정보 */
interface ModuleInfo {
  name: string;
  filePath: string;
  isGlobal: boolean;
  imports: string[];
  providers: string[];
  exports: string[];
  /** `@Module` 데코레이터의 인자 object literal AST node (--fix 시 편집용) */
  decoratorObjectLiteral?: ts.ObjectLiteralExpression;
  /** 데코레이터 object literal 위치 (편집 타깃) */
  sourceFile?: ts.SourceFile;
}

interface AnalysisResult {
  services: Map<string, ServiceInfo>;
  modules: Map<string, ModuleInfo>;
  /** provider 이름 → 해당 provider 를 export 하는 모듈 이름 목록 */
  providerExportedBy: Map<string, string[]>;
  /** provider 이름 → 해당 provider 를 직접 정의하는 모듈 이름 목록 */
  providerDefinedBy: Map<string, string[]>;
  /** 전역 스코프(= @Global 모듈의 exports 합집합) */
  globalScope: Set<string>;
}

interface DIProblem {
  severity: "error";
  moduleName: string;
  moduleFilePath: string;
  serviceName: string;
  missingDependency: string;
  /** 누락된 의존성을 export 하는 후보 모듈(들) */
  suggestedImports: string[];
}

// ────────────────────────────────────────────────────────────────
// 1. 파일 수집
// ────────────────────────────────────────────────────────────────
function collectSourceFiles(rootDir: string): string[] {
  const result: string[] = [];
  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", "dist", ".git"].includes(entry.name)) continue;
        walk(full);
      } else if (
        entry.isFile() &&
        (full.endsWith(".ts") || full.endsWith(".tsx")) &&
        !full.endsWith(".d.ts") &&
        !full.endsWith(".spec.ts") &&
        !full.endsWith(".e2e-spec.ts")
      ) {
        result.push(full);
      }
    }
  };
  walk(rootDir);
  return result;
}

// ────────────────────────────────────────────────────────────────
// 2. AST 유틸: 데코레이터 찾기
// ────────────────────────────────────────────────────────────────
function getDecoratorByName(
  node: ts.ClassDeclaration,
  name: string,
): ts.Decorator | undefined {
  const modifiers = ts.canHaveDecorators(node)
    ? ts.getDecorators(node)
    : undefined;
  if (!modifiers) return undefined;
  return modifiers.find((d) => {
    const expr = d.expression;
    if (ts.isCallExpression(expr)) {
      const callee = expr.expression;
      if (ts.isIdentifier(callee) && callee.text === name) return true;
    }
    return false;
  });
}

/**
 * Decorator expression 의 첫 번째 인자 object literal 을 반환
 * 예: `@Module({ imports: [...], providers: [...] })`
 */
function getDecoratorFirstArgObject(
  decorator: ts.Decorator,
): ts.ObjectLiteralExpression | undefined {
  if (!ts.isCallExpression(decorator.expression)) return undefined;
  const firstArg = decorator.expression.arguments[0];
  if (firstArg && ts.isObjectLiteralExpression(firstArg)) return firstArg;
  return undefined;
}

/** 재귀적으로 Expression 에서 "모듈/프로바이더 토큰 이름"을 추출 */
function resolveTokenName(el: ts.Expression): string {
  // XxxModule, XxxService 같은 식별자
  if (ts.isIdentifier(el)) return el.text;

  // CallExpression 케이스
  if (ts.isCallExpression(el)) {
    const callee = el.expression;

    // Case A: forwardRef(() => XxxModule)
    //  → 첫 번째 인자가 arrow function 이면 body 에서 실제 모듈 이름을 추출
    if (ts.isIdentifier(callee) && callee.text === "forwardRef") {
      const fn = el.arguments[0];
      if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) {
        const body = fn.body;
        if (ts.isIdentifier(body)) return body.text;
        if (ts.isBlock(body)) {
          // () => { return XxxModule; } 케이스
          for (const stmt of body.statements) {
            if (ts.isReturnStatement(stmt) && stmt.expression) {
              return resolveTokenName(stmt.expression);
            }
          }
        }
      }
      return ""; // 분석 불가
    }

    // Case B: BullModule.registerQueue({ name: "alimtalk" })
    //  → PropertyAccessExpression 의 LHS (BullModule)
    if (ts.isPropertyAccessExpression(callee)) {
      const lhs = callee.expression;
      if (ts.isIdentifier(lhs)) return lhs.text;
    }

    // Case C: XxxModule.forRoot(...) 가 아닌 XxxModule() 같은 호출 (드물지만)
    if (ts.isIdentifier(callee)) return callee.text;

    return "";
  }

  // { provide: XXX, useClass: YYY } → provide 키의 값을 token 으로 사용
  if (ts.isObjectLiteralExpression(el)) {
    for (const p of el.properties) {
      if (
        ts.isPropertyAssignment(p) &&
        ts.isIdentifier(p.name) &&
        p.name.text === "provide" &&
        ts.isIdentifier(p.initializer)
      ) {
        return p.initializer.text;
      }
    }
  }

  return "";
}

/** object literal 의 특정 property 를 배열 타입으로 읽어 문자열 목록으로 변환 */
function readArrayProp(
  obj: ts.ObjectLiteralExpression,
  propName: string,
): string[] {
  for (const prop of obj.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === propName
    ) {
      const init = prop.initializer;
      if (ts.isArrayLiteralExpression(init)) {
        return init.elements
          .map((el) => resolveTokenName(el))
          .filter((s) => s.length > 0);
      }
    }
  }
  return [];
}

// ────────────────────────────────────────────────────────────────
// 3. 클래스 분석: 서비스 / 모듈
// ────────────────────────────────────────────────────────────────
function analyzeClass(
  cls: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
  filePath: string,
  services: Map<string, ServiceInfo>,
  modules: Map<string, ModuleInfo>,
) {
  const className = cls.name?.text;
  if (!className) return;

  // ----- @Module -----
  const moduleDecorator = getDecoratorByName(cls, "Module");
  if (moduleDecorator) {
    const globalDecorator = getDecoratorByName(cls, "Global");
    const obj = getDecoratorFirstArgObject(moduleDecorator);
    const moduleInfo: ModuleInfo = {
      name: className,
      filePath,
      isGlobal: !!globalDecorator,
      imports: obj ? readArrayProp(obj, "imports") : [],
      providers: obj ? readArrayProp(obj, "providers") : [],
      exports: obj ? readArrayProp(obj, "exports") : [],
      decoratorObjectLiteral: obj,
      sourceFile,
    };
    modules.set(className, moduleInfo);
    return;
  }

  // ----- @Injectable -----
  const injectableDecorator = getDecoratorByName(cls, "Injectable");
  if (injectableDecorator) {
    // 생성자 파라미터 수집
    const ctor = cls.members.find((m) => ts.isConstructorDeclaration(m)) as
      | ts.ConstructorDeclaration
      | undefined;
    const deps: string[] = [];
    if (ctor) {
      for (const param of ctor.parameters) {
        // 파라미터에 토큰 오버라이드 데코레이터가 있으면 타입 힌트를 무시
        //   @Inject('XYZ')
        //   @InjectQueue('alimtalk')  → Bull
        //   @InjectRepository(User)   → TypeORM
        //   @InjectModel(User.name)   → Mongoose
        //   @InjectRedis()            → @liaoliaots/nestjs-redis
        if (hasTokenOverrideDecorator(param)) continue;

        const typeNode = param.type;
        if (!typeNode) continue;
        // 가장 흔한 케이스: TypeReference (예: PrismaService)
        if (ts.isTypeReferenceNode(typeNode) && ts.isIdentifier(typeNode.typeName)) {
          deps.push(typeNode.typeName.text);
        } else if (
          ts.isTypeReferenceNode(typeNode) &&
          ts.isQualifiedName(typeNode.typeName)
        ) {
          // Ns.Xxx 형태 → 뒤쪽 이름만 취함
          deps.push(typeNode.typeName.right.text);
        }
      }
    }
    services.set(className, {
      name: className,
      filePath,
      dependencies: deps,
    });
  }
}

/**
 * 생성자 파라미터에 토큰을 오버라이드하는 데코레이터가 있는지 검사
 * 있으면 해당 파라미터는 DI 토큰이 타입과 다르므로 정적 분석 대상에서 제외
 */
function hasTokenOverrideDecorator(param: ts.ParameterDeclaration): boolean {
  const decorators = ts.canHaveDecorators(param)
    ? ts.getDecorators(param)
    : undefined;
  if (!decorators) return false;
  const overrideNames = new Set([
    "Inject",
    "InjectQueue",
    "InjectRepository",
    "InjectModel",
    "InjectRedis",
    "InjectDataSource",
    "InjectEntityManager",
    "InjectConnection",
  ]);
  for (const d of decorators) {
    if (ts.isCallExpression(d.expression)) {
      const callee = d.expression.expression;
      if (ts.isIdentifier(callee) && overrideNames.has(callee.text)) {
        return true;
      }
    }
  }
  return false;
}

// ────────────────────────────────────────────────────────────────
// 4. 전체 분석
// ────────────────────────────────────────────────────────────────
function analyze(): AnalysisResult {
  const services = new Map<string, ServiceInfo>();
  const modules = new Map<string, ModuleInfo>();

  const files = collectSourceFiles(SRC_ROOT);
  for (const filePath of files) {
    const text = fs.readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(
      filePath,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    ts.forEachChild(sourceFile, (node) => {
      if (ts.isClassDeclaration(node)) {
        analyzeClass(node, sourceFile, filePath, services, modules);
      }
    });
  }

  // provider → 어느 모듈에서 정의/export 하는지 역인덱스 구축
  const providerDefinedBy = new Map<string, string[]>();
  const providerExportedBy = new Map<string, string[]>();
  const globalScope = new Set<string>();
  for (const mod of modules.values()) {
    for (const p of mod.providers) {
      const arr = providerDefinedBy.get(p) ?? [];
      arr.push(mod.name);
      providerDefinedBy.set(p, arr);
    }
    for (const e of mod.exports) {
      const arr = providerExportedBy.get(e) ?? [];
      arr.push(mod.name);
      providerExportedBy.set(e, arr);
      if (mod.isGlobal) globalScope.add(e);
    }
  }

  return { services, modules, providerExportedBy, providerDefinedBy, globalScope };
}

// ────────────────────────────────────────────────────────────────
// 5. 검증: 각 서비스의 의존성이 자신의 모듈 스코프에서 해결 가능한가
// ────────────────────────────────────────────────────────────────
function detectProblems(result: AnalysisResult): DIProblem[] {
  const { services, modules, providerExportedBy, providerDefinedBy, globalScope } =
    result;
  const problems: DIProblem[] = [];

  // 각 서비스가 속한 모듈 찾기 (providers 에 서비스명이 포함된 모듈)
  // 하나의 서비스가 여러 모듈에서 provide 되는 경우는 드물지만 있을 수 있음
  const serviceToModules = new Map<string, string[]>();
  for (const mod of modules.values()) {
    for (const p of mod.providers) {
      const arr = serviceToModules.get(p) ?? [];
      arr.push(mod.name);
      serviceToModules.set(p, arr);
    }
  }

  for (const svc of services.values()) {
    const owningModules = serviceToModules.get(svc.name) ?? [];
    if (owningModules.length === 0) {
      // 어떤 모듈에도 등록되지 않은 서비스 → 스킵(테스트 전용이거나 미사용)
      continue;
    }
    for (const modName of owningModules) {
      const mod = modules.get(modName)!;
      // 같은 모듈의 다른 provider 또는 imports 한 모듈의 exports 또는 글로벌 스코프
      const importedModules = mod.imports;
      const reachable = new Set<string>();
      // 1) 같은 모듈 내부 provider
      for (const p of mod.providers) reachable.add(p);
      // 2) 직접 import 한 모듈의 exports
      for (const impName of importedModules) {
        const impMod = modules.get(impName);
        if (impMod) {
          for (const e of impMod.exports) reachable.add(e);
        }
      }
      // 3) 글로벌 스코프 (@Global 모듈의 exports)
      for (const g of globalScope) reachable.add(g);

      // 이제 서비스의 의존성을 체크
      for (const dep of svc.dependencies) {
        // 프레임워크 제공 토큰(Logger 등)이나 외부 패키지는 화이트리스트로 제외
        if (WHITELIST.has(dep)) continue;
        if (reachable.has(dep)) continue;

        // 해결 불가 → 어느 모듈에서 export 하면 되는지 후보 추출
        const candidates = (providerExportedBy.get(dep) ?? []).filter(
          (m) => m !== mod.name,
        );
        // export 하지 않지만 provider 로 가진 모듈도 suggestion 후보 (사용자가 export 해야 함)
        if (candidates.length === 0) {
          const defined = providerDefinedBy.get(dep) ?? [];
          for (const d of defined) if (!candidates.includes(d)) candidates.push(d);
        }

        problems.push({
          severity: "error",
          moduleName: mod.name,
          moduleFilePath: mod.filePath,
          serviceName: svc.name,
          missingDependency: dep,
          suggestedImports: candidates,
        });
      }
    }
  }
  return problems;
}

/** 프레임워크/외부 제공 토큰 — DI 분석 제외 */
const WHITELIST = new Set<string>([
  "Logger",
  "ConfigService",
  "HttpService",
  "JwtService",
  "Reflector",
  "ModuleRef",
  "EventEmitter2",
  "Cache",
  "Connection",
]);

// ────────────────────────────────────────────────────────────────
// 6. 자동 수정: 누락 import 를 .module.ts 에 주입
// ────────────────────────────────────────────────────────────────
function applyFixes(problems: DIProblem[]): { fixed: number; skipped: DIProblem[] } {
  // 모듈별로 추가할 import 목록 집계
  const fixByModule = new Map<string, { filePath: string; addImports: Set<string> }>();
  const skipped: DIProblem[] = [];

  for (const p of problems) {
    if (p.suggestedImports.length === 0) {
      skipped.push(p); // 후보 없음 → 수동 필요
      continue;
    }
    if (p.suggestedImports.length > 1) {
      // 모호한 경우 첫 번째 후보 사용하되 경고
      console.warn(
        `[di-doctor] ambiguous fix: ${p.serviceName}.${p.missingDependency} -> ${p.suggestedImports.join(", ")} (picking ${p.suggestedImports[0]})`,
      );
    }
    const pick = p.suggestedImports[0];
    const entry =
      fixByModule.get(p.moduleFilePath) ??
      { filePath: p.moduleFilePath, addImports: new Set<string>() };
    entry.addImports.add(pick);
    fixByModule.set(p.moduleFilePath, entry);
  }

  let fixedCount = 0;
  for (const { filePath, addImports } of fixByModule.values()) {
    const original = fs.readFileSync(filePath, "utf8");
    let modified = original;

    for (const importName of addImports) {
      // 1) ES import 문 추가 (중복 방지)
      if (!new RegExp(`import\\s*\\{[^}]*\\b${importName}\\b[^}]*\\}`).test(modified)) {
        const importLine = buildImportLine(importName, filePath);
        // 마지막 import 문 뒤에 삽입
        const lastImportMatch = [...modified.matchAll(/^import .+;$/gm)].pop();
        if (lastImportMatch && lastImportMatch.index !== undefined) {
          const insertAt = lastImportMatch.index + lastImportMatch[0].length;
          modified =
            modified.slice(0, insertAt) + "\n" + importLine + modified.slice(insertAt);
        } else {
          modified = importLine + "\n" + modified;
        }
      }

      // 2) @Module({ ... }) 의 imports 배열에 주입
      modified = injectIntoModuleDecorator(modified, importName);
    }

    if (modified !== original) {
      fs.writeFileSync(filePath, modified, "utf8");
      fixedCount++;
      console.log(`[di-doctor] fixed: ${path.relative(process.cwd(), filePath)}`);
    }
  }
  return { fixed: fixedCount, skipped };
}

/** 모듈 이름으로 import path 추정 — 같은 src 트리에서 모듈 파일을 찾아 상대경로로 import */
function buildImportLine(importName: string, forFilePath: string): string {
  // 실제 파일 경로 탐색
  const files = collectSourceFiles(SRC_ROOT);
  const classFileRegex = new RegExp(
    `export\\s+class\\s+${importName}\\b`,
    "m",
  );
  let target: string | undefined;
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    if (classFileRegex.test(text)) {
      target = f;
      break;
    }
  }
  if (!target) {
    return `import { ${importName} } from "@/TODO_${importName}";`;
  }
  // tsconfig path alias "@/..." 우선
  const relFromSrc = path.relative(SRC_ROOT, target).replace(/\\/g, "/");
  const withoutExt = relFromSrc.replace(/\.(ts|tsx)$/, "");
  return `import { ${importName} } from "@/${withoutExt}";`;
}

/** @Module 데코레이터의 imports 배열에 항목 추가 */
function injectIntoModuleDecorator(source: string, importName: string): string {
  // @Module({ ... })  블록을 찾음
  const moduleRegex = /@Module\s*\(\s*\{([\s\S]*?)\}\s*\)/;
  const match = source.match(moduleRegex);
  if (!match) return source;
  const body = match[1];

  // imports 필드가 이미 있는가?
  const importsFieldRegex = /imports\s*:\s*\[([\s\S]*?)\]/;
  const importsMatch = body.match(importsFieldRegex);

  let newBody: string;
  if (importsMatch) {
    // 이미 추가되어 있으면 skip
    if (new RegExp(`\\b${importName}\\b`).test(importsMatch[1])) return source;
    const newImports = importsMatch[1].trim().length
      ? `${importsMatch[1].trimEnd()}${importsMatch[1].trimEnd().endsWith(",") ? "" : ","} ${importName}`
      : ` ${importName} `;
    newBody = body.replace(importsFieldRegex, `imports: [${newImports}]`);
  } else {
    // imports 필드 없음 → 추가
    newBody = `\n  imports: [${importName}],${body}`;
  }
  return source.replace(moduleRegex, `@Module({${newBody}})`);
}

// ────────────────────────────────────────────────────────────────
// 7. 출력
// ────────────────────────────────────────────────────────────────
function reportText(problems: DIProblem[]): void {
  if (problems.length === 0) {
    console.log("✅ [di-doctor] No DI issues found.");
    return;
  }
  console.log(`❌ [di-doctor] Found ${problems.length} DI issue(s):\n`);
  for (const p of problems) {
    const rel = path.relative(process.cwd(), p.moduleFilePath);
    console.log(`  • ${p.moduleName}  (${rel})`);
    console.log(
      `      ${p.serviceName} → ${p.missingDependency}  [unreachable]`,
    );
    if (p.suggestedImports.length > 0) {
      console.log(
        `      💡 add to imports: ${p.suggestedImports.join(" or ")}`,
      );
    } else {
      console.log(`      ⚠️  no module exports ${p.missingDependency} — manual fix required`);
    }
    console.log();
  }
}

function reportJson(problems: DIProblem[]): void {
  console.log(JSON.stringify({ problems }, null, 2));
}

// ────────────────────────────────────────────────────────────────
// 8. CLI
// ────────────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  const mode = args[0] ?? "verify";
  const jsonOut = args.includes("--json");

  if (mode !== "verify" && mode !== "fix") {
    console.error(`Usage: di-doctor [verify|fix] [--json]`);
    process.exit(2);
  }

  const result = analyze();
  const problems = detectProblems(result);

  if (mode === "verify") {
    if (jsonOut) reportJson(problems);
    else reportText(problems);
    process.exit(problems.length > 0 ? 1 : 0);
  }

  // fix 모드: 먼저 현황 보고 → 수정 → 재검증
  reportText(problems);
  if (problems.length === 0) process.exit(0);

  const { fixed, skipped } = applyFixes(problems);
  console.log(`\n[di-doctor] applied fixes to ${fixed} module file(s)`);
  if (skipped.length > 0) {
    console.log(`[di-doctor] ${skipped.length} issue(s) could not be auto-fixed:`);
    for (const s of skipped) {
      console.log(`  • ${s.moduleName}: ${s.serviceName} → ${s.missingDependency}`);
    }
  }

  // 재검증
  const reResult = analyze();
  const reProblems = detectProblems(reResult);
  if (reProblems.length > 0) {
    console.log(`\n[di-doctor] ${reProblems.length} issue(s) remain after auto-fix:`);
    reportText(reProblems);
    process.exit(1);
  }
  console.log(`\n✅ [di-doctor] All DI issues resolved.`);
  process.exit(0);
}

main();
