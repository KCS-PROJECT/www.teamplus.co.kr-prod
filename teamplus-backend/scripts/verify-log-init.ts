/**
 * 로그 시스템 초기화 verify 스크립트 (P1-9)
 * 사용: npx tsx scripts/verify-log-init.ts
 */
import {
  ALL_ERROR_CATEGORIES,
  ALL_NORMAL_CATEGORIES,
  ensureAllCategoryFiles,
  formatDate,
  getAllErrorsPath,
  getErrorsSummaryPath,
  getGlobalIndexPath,
  getLogPath,
  getLogRoot,
  updateAllCurrentSymlinks,
  updateManifestEntry,
} from "../src/logger/file-path.util";

console.log("=".repeat(60));
console.log("TEAMPLUS 로그 시스템 초기화 verify");
console.log("=".repeat(60));
console.log("LOG_ROOT       :", getLogRoot());
console.log("TODAY (KST)    :", formatDate());
console.log("GLOBAL_INDEX   :", getGlobalIndexPath());
console.log("ALL_ERRORS     :", getAllErrorsPath());
console.log("ERRORS_SUMMARY :", getErrorsSummaryPath());
console.log("-".repeat(60));

ensureAllCategoryFiles();
console.log("✓ 모든 카테고리 파일 생성");

updateAllCurrentSymlinks();
console.log("✓ current/ 심볼릭 링크 갱신");

// 매니페스트도 갱신
for (const cat of ALL_NORMAL_CATEGORIES) {
  updateManifestEntry({ type: "normal", category: cat });
}
for (const cat of ALL_ERROR_CATEGORIES) {
  updateManifestEntry({ type: "error", category: cat });
}
console.log("✓ manifest.json 갱신");

console.log("-".repeat(60));
console.log("일반 카테고리 파일:");
for (const cat of ALL_NORMAL_CATEGORIES) {
  console.log("  ", getLogPath({ type: "normal", category: cat }));
}
console.log("오류 카테고리 파일:");
for (const cat of ALL_ERROR_CATEGORIES) {
  console.log("  ", getLogPath({ type: "error", category: cat }));
}
console.log("=".repeat(60));
console.log("✓ 초기화 완료 — log/ 디렉토리를 확인하세요");
