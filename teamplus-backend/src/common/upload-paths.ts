import { Logger } from "@nestjs/common";
import { mkdirSync, statSync } from "fs";
import { isAbsolute, join, normalize, resolve, sep } from "path";

/**
 * 업로드 디렉토리 단일 진입점 (Single Source of Truth)
 *
 * 핵심 원칙 (2026-05-23 v3):
 *   1) **물리 경로는 항상 워크스페이스 루트(www.teamplus.co.kr/uploads/)로 고정**
 *      `process.cwd()` 의존성 제거 — `__dirname` 기반 WORKSPACE_ROOT 상수로 계산.
 *      개발(`tsx src/...`) · 빌드(`node dist/...`) · pm2 cwd 영향 받지 않음.
 *      teamplus-backend 안이 아닌 monorepo 루트에 두어 향후 다중 백엔드/관리도구
 *      에서도 동일 위치 공유 가능 (예: 정산 스크립트가 직접 디스크 접근).
 *   2) `UPLOAD_ROOT` 환경변수 우선
 *      - 절대 경로면 그대로 사용 (운영 — 외부 디스크 마운트)
 *      - 상대 경로면 WORKSPACE_ROOT 기준으로 resolve
 *   3) DB 의 `path` / `url` 값 → 물리 디스크 절대 경로 변환은
 *      `resolveUploadAbsolutePath()` 단일 헬퍼 통과 — path traversal 방지 통합.
 *
 * 사용처: main.ts · files.service · users.service · videos.* · shop.* · chat.* ·
 *         inspections.* · tms.* · scripts/uploads-doctor
 */

const logger = new Logger("UploadPaths");

/**
 * 워크스페이스(monorepo) 루트 절대 경로.
 * - 개발 (tsx): __dirname = `<workspace>/teamplus-backend/src/common` → `../../..` = workspace root
 * - 빌드 (dist): __dirname = `<workspace>/teamplus-backend/dist/common` → `../../..` = workspace root
 * 모듈 로드 시점에 1회 계산.
 *
 * 결과 경로 예: `/Users/.../www.teamplus.co.kr`
 */
export const WORKSPACE_ROOT = resolve(__dirname, "..", "..", "..");

/**
 * 기본 카테고리 디렉토리 — 부팅 시 자동 생성 대상.
 *
 * 향후 새 카테고리 추가 시 본 배열에 등재하면 자동으로 디렉토리 생성됨.
 * 모든 도메인 모듈(files/videos/chat/shop/equipment-inspection/tms) 의
 * multer destination 은 본 헬퍼(`getCategoryDir`) 만 사용하여 UPLOAD_ROOT 단일 진입점 보장.
 */
export const UPLOAD_CATEGORY_DIRS = [
  "image", // FilesModule IMAGE
  "avatar", // FilesModule AVATAR
  "video", // FilesModule VIDEO (5종 표준)
  "videos", // VideosModule (전용 multer)
  "document", // FilesModule DOCUMENT
  "attachment", // FilesModule ATTACHMENT
  "award_evidence", // 수상 증빙
  "exports", // PIPA 데이터 다운로드 ZIP
  "chat", // ChatModule (레거시 호환)
  "products", // ShopModule (레거시 호환)
  "inspections", // EquipmentInspectionModule
  "tms", // TmsModule (날짜 하위 디렉토리 자동 생성)
] as const;

let cachedRoot: string | null = null;

/**
 * 업로드 루트 디렉토리 절대 경로.
 *
 * - `UPLOAD_ROOT` env (절대 경로) → 그대로 사용
 * - `UPLOAD_ROOT` env (상대 경로) → WORKSPACE_ROOT 기준 resolve
 * - env 미설정 → `<WORKSPACE_ROOT>/uploads`
 *
 * 한 번 계산 후 캐시 (process 수명 동안 변경 안 됨).
 */
export function getUploadRoot(): string {
  if (cachedRoot) return cachedRoot;

  const envRoot = process.env.UPLOAD_ROOT?.trim();
  if (envRoot) {
    cachedRoot = isAbsolute(envRoot)
      ? envRoot
      : resolve(WORKSPACE_ROOT, envRoot);
  } else {
    // 기본값 — 항상 <workspace>/uploads/ (cwd 무관)
    cachedRoot = join(WORKSPACE_ROOT, "uploads");
  }

  return cachedRoot;
}

/**
 * 특정 카테고리 디렉토리 절대 경로.
 *
 * @example
 *   getCategoryDir('avatar') → '<backend>/uploads/avatar'
 *   getCategoryDir('videos') → '<backend>/uploads/videos'
 */
export function getCategoryDir(category: string): string {
  return join(getUploadRoot(), category);
}

/**
 * DB 의 `path` / `url` 값을 디스크 절대 경로로 안전하게 변환.
 *
 * **단일 진입점 — path traversal 방지 통합**.
 *
 * 허용되는 입력 형식:
 *   - "/uploads/image/2026/05/23/foo.jpg"   (공개 URL 형식)
 *   - "image/2026/05/23/foo.jpg"             (DB path 형식 — leading slash 없음)
 *   - "/image/2026/05/23/foo.jpg"            (DB path 형식 — leading slash 있음)
 *
 * 거부되는 입력 (보안):
 *   - "../../etc/passwd"
 *   - 절대 경로 ("/usr/..." 등 — uploads prefix 없는 경우)
 *   - "data:" / "blob:" / "http://" — 외부 URL (이미 호스팅됨)
 *
 * @returns 안전한 절대 경로 (UPLOAD_ROOT 하위 보장) — 거부 시 null
 */
export function resolveUploadAbsolutePath(
  dbPathOrUrl: string | null | undefined,
): string | null {
  if (!dbPathOrUrl) return null;
  const input = dbPathOrUrl.trim();
  if (input === "") return null;

  // 외부 URL — 디스크 경로 아님
  if (
    input.startsWith("data:") ||
    input.startsWith("blob:") ||
    input.startsWith("http://") ||
    input.startsWith("https://")
  ) {
    return null;
  }

  // /uploads/ 접두 또는 leading slash 제거
  let rel = input.replace(/^\/+uploads\/+/, "").replace(/^\/+/, "");
  if (rel === "") return null;

  // normalize 로 ../ 압축 → resolve 후 UPLOAD_ROOT 하위 검증
  rel = normalize(rel);
  if (rel.startsWith("..") || rel.includes(`..${sep}..`)) {
    logger.warn(`path traversal 시도 차단: ${dbPathOrUrl}`);
    return null;
  }

  const root = getUploadRoot();
  const absolute = resolve(root, rel);

  // 최종 안전망: 절대 경로가 UPLOAD_ROOT 하위인지 확인
  if (!absolute.startsWith(root + sep) && absolute !== root) {
    logger.warn(`UPLOAD_ROOT 이탈 차단: ${dbPathOrUrl} → ${absolute}`);
    return null;
  }

  return absolute;
}

/**
 * 업로드 루트 + 카테고리 디렉토리 자동 생성 + 권한 검증.
 *
 * - 디렉토리 없으면 `mkdirSync({ recursive: true, mode: 0o750 })`
 * - 쓰기 권한 없으면 경고 로그 (부팅은 계속 — graceful)
 * - 운영자에게 권한 설정 가이드 출력
 */
export function ensureUploadDirectories(): void {
  const root = getUploadRoot();
  logger.log(`UPLOAD_ROOT = ${root}`);
  logger.log(`WORKSPACE_ROOT = ${WORKSPACE_ROOT}`);

  try {
    mkdirSync(root, { recursive: true, mode: 0o750 });
  } catch (error) {
    logger.error(
      `UPLOAD_ROOT 생성 실패: ${root}\n${(error as Error).message}`,
    );
    logger.warn(
      `운영자 조치 필요: \`mkdir -p ${root} && chown -R nestjs:nestjs ${root} && chmod 750 ${root}\``,
    );
    return;
  }

  for (const category of UPLOAD_CATEGORY_DIRS) {
    const dir = join(root, category);
    try {
      mkdirSync(dir, { recursive: true, mode: 0o750 });
    } catch (error) {
      logger.warn(
        `카테고리 디렉토리 생성 실패: ${dir} - ${(error as Error).message}`,
      );
    }
  }

  // 권한 검증 (쓰기 가능 여부 stat 으로 확인)
  try {
    const stat = statSync(root);
    if (!stat.isDirectory()) {
      logger.error(`UPLOAD_ROOT 가 디렉토리가 아닙니다: ${root}`);
      return;
    }
    logger.log(
      `업로드 디렉토리 초기화 완료: ${UPLOAD_CATEGORY_DIRS.length}개 카테고리`,
    );
  } catch (error) {
    logger.warn(`업로드 디렉토리 stat 실패: ${(error as Error).message}`);
  }
}

/**
 * 테스트 전용 — 캐시 리셋 (production 코드에서 호출 금지).
 */
export function __resetUploadRootCacheForTests(): void {
  cachedRoot = null;
}
