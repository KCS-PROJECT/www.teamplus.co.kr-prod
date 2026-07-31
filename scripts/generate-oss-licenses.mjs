#!/usr/bin/env node
/**
 * 오픈소스 라이선스 고지 데이터 생성.
 *
 * 근거: Apache-2.0 §4(d) 는 NOTICE 포함을, MIT·BSD 계열은 저작권 고지와 라이선스 전문
 * 포함을 요구한다. 런타임에 실제로 배포되는 의존성(production dependencies)의 고지가
 * 없으면 attribution 조건을 충족하지 못한다.
 *
 * 사용:
 *   node scripts/generate-oss-licenses.mjs
 *
 * 산출: teamplus-web/src/lib/legal/oss-licenses.generated.json
 *   (devDependencies 는 배포물에 포함되지 않으므로 제외한다)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(
  ROOT,
  "teamplus-web/src/lib/legal/oss-licenses.generated.json",
);

/** production 의존성만 재귀 수집 — devDependencies 는 배포물에 없다. */
function collectProdDeps(projectDir) {
  const seen = new Map();
  const visit = (pkgName) => {
    if (seen.has(pkgName)) return;
    const pkgDir = join(projectDir, "node_modules", pkgName);
    const pkgJson = join(pkgDir, "package.json");
    if (!existsSync(pkgJson)) return;

    let meta;
    try {
      meta = JSON.parse(readFileSync(pkgJson, "utf8"));
    } catch {
      return;
    }

    seen.set(pkgName, {
      name: meta.name ?? pkgName,
      version: meta.version ?? "",
      license: normalizeLicense(meta),
      author: normalizeAuthor(meta),
      homepage: meta.homepage ?? repoUrl(meta) ?? "",
    });

    for (const dep of Object.keys(meta.dependencies ?? {})) visit(dep);
  };

  const rootMeta = JSON.parse(
    readFileSync(join(projectDir, "package.json"), "utf8"),
  );
  for (const dep of Object.keys(rootMeta.dependencies ?? {})) visit(dep);
  return [...seen.values()];
}

function normalizeLicense(meta) {
  if (typeof meta.license === "string") return meta.license;
  if (meta.license?.type) return meta.license.type;
  if (Array.isArray(meta.licenses)) {
    return meta.licenses.map((l) => l.type ?? l).join(" OR ");
  }
  return "UNKNOWN";
}

function normalizeAuthor(meta) {
  const a = meta.author;
  if (!a) return "";
  if (typeof a === "string") return a.replace(/\s*<[^>]*>/g, "").trim();
  return (a.name ?? "").trim();
}

function repoUrl(meta) {
  const r = meta.repository;
  if (!r) return null;
  const url = typeof r === "string" ? r : r.url;
  if (!url) return null;
  return url
    .replace(/^git\+/, "")
    .replace(/\.git$/, "")
    .replace(/^git:\/\//, "https://");
}

const PROJECTS = [
  { key: "web", dir: join(ROOT, "teamplus-web"), label: "사용자 웹" },
  { key: "home", dir: join(ROOT, "teamplus-home"), label: "소개 사이트" },
  { key: "admin", dir: join(ROOT, "teamplus-admin"), label: "관리자" },
  { key: "backend", dir: join(ROOT, "teamplus-backend"), label: "API 서버" },
];

const merged = new Map();
const perProject = {};

for (const p of PROJECTS) {
  if (!existsSync(join(p.dir, "node_modules"))) {
    console.warn(`건너뜀 (node_modules 없음): ${p.key}`);
    continue;
  }
  const deps = collectProdDeps(p.dir);
  perProject[p.key] = { label: p.label, count: deps.length };
  for (const d of deps) {
    // 같은 패키지가 프로젝트마다 다른 버전일 수 있으므로 name+version 으로 구분
    merged.set(`${d.name}@${d.version}`, d);
  }
  console.log(`${p.key}: production 의존성 ${deps.length}개`);
}

const packages = [...merged.values()].sort((a, b) =>
  a.name.localeCompare(b.name),
);

const byLicense = {};
for (const p of packages) {
  byLicense[p.license] = (byLicense[p.license] ?? 0) + 1;
}

writeFileSync(
  OUT,
  JSON.stringify(
    {
      generatedFrom: "production dependencies (devDependencies 제외)",
      projects: perProject,
      totalPackages: packages.length,
      licenseSummary: Object.fromEntries(
        Object.entries(byLicense).sort((a, b) => b[1] - a[1]),
      ),
      packages,
    },
    null,
    2,
  ) + "\n",
  "utf8",
);

console.log(`\n총 ${packages.length}개 패키지 → ${OUT}`);
console.log("라이선스 분포:");
for (const [k, v] of Object.entries(byLicense).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(4)}  ${k}`);
}
