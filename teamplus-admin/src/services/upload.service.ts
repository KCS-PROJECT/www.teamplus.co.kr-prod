/**
 * TEAMPLUS Admin — 통합 업로드 서비스
 *
 * Backend `src/files/` 모듈과 1:1 대응:
 *   - POST  /api/v1/files/upload          (단일)
 *   - POST  /api/v1/files/upload-multiple (최대 10개, 합계 50MB)
 *   - GET   /api/v1/files/:id
 *   - DELETE /api/v1/files/:id            (업로더 또는 ADMIN)
 *
 * 모든 업로드 파일은 서버의 `teamplus-backend/uploads/{category소문자}/` 디렉토리에 저장되고,
 * DB `UploadedFile` 테이블에 메타데이터가 기록됩니다.
 *
 * 영상(VIDEO)은 Cloudflare R2 presigned URL 방식이 별도 존재합니다 (→ /api/v1/uploads/presigned-url).
 * Admin은 영상 업로드 필요 시 Web의 `upload.service.ts` 구조를 참조하거나 Web에서 업로드를 위임하세요.
 */

import axios, { AxiosProgressEvent } from "axios";
import { getAccessToken } from "./api-client";
import { env } from "@/lib/env";

// upload.service 는 `${API_BASE_URL}/api/v1/...` 로 path 를 수동 조립하므로
// env.API_ORIGIN (= `/api/v1` suffix 없는 origin) 을 사용한다.
const API_BASE_URL = env.API_ORIGIN;

// ===== Types =====

/** Backend `UploadCategory` enum과 1:1 대응 */
export type UploadCategory =
  | "IMAGE"
  | "DOCUMENT"
  | "VIDEO"
  | "AVATAR"
  | "ATTACHMENT";

/**
 * Backend `FileResponseDto` 응답
 *
 * 모든 업로드는 다음 필드를 반드시 포함합니다:
 * - 파일타입(mimeType) · 사이즈(size) · 확장자(extension)
 * - 최초등록일(createdAt) · 최초등록자(uploaderId)
 * - 최종수정일(updatedAt) · 최종수정자(modifiedById)
 */
export interface UploadedFile {
  id: string;
  category: UploadCategory;
  /** 사용자 원본 파일명 */
  originalName: string;
  /** 서버 저장 파일명 — 형식: {사용자명}_{YYYYMMDDHHmm}_{hash}.{ext} */
  storedName: string;
  /** 확장자 (소문자, 점 제외) — 예: "jpg", "pdf", "mp4" */
  extension?: string;
  /** 공개 접근 URL — /uploads/{category}/{YYYY}/{MM}/{DD}/{파일명} */
  url: string;
  /** 자동 생성 썸네일 URL (sharp 처리 후 — IMAGE/AVATAR) — Phase 2.1 SPEC */
  thumbUrl?: string;
  /** EXIF 메타데이터 JSON (sharp 추출 후 — IMAGE) — Phase 2.1 SPEC */
  exifJson?: Record<string, unknown>;
  mimeType: string;
  /** 바이트 단위 */
  size: number;
  width?: number;
  height?: number;
  /** 최초 등록자 ID */
  uploaderId: string;
  /** 최종 수정자 ID — 최초엔 uploaderId와 동일 */
  modifiedById?: string;
  refType?: string;
  refId?: string;
  /** 최초 등록일 (ISO 8601) */
  createdAt: string;
  /** 최종 수정일 (ISO 8601) — Prisma @updatedAt 자동 갱신 */
  updatedAt: string;
}

export interface UploadProgress {
  percent: number;
  loaded: number;
  total: number;
}

export interface UploadOptions {
  category: UploadCategory;
  /** 참조 엔티티 타입 (예: 'notice', 'banner', 'shop_product', 'award') */
  refType?: string;
  /** 참조 엔티티 ID */
  refId?: string;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

// ===== 카테고리별 제한 (Backend `CATEGORY_RULES`와 일치) =====

export interface CategoryLimit {
  maxSize: number;
  /** 다중 업로드 최대 개수 — 호출처에서 override 가능하지만 이 값 초과는 거부됨 */
  maxCount: number;
  accept: string;
  /** 확장자 화이트리스트 (소문자, 점 제외) — MIME 위장 방지용 cross-check */
  acceptExtensions: readonly string[];
  label: string;
}

/**
 * 위험 확장자 블랙리스트 (전역, 카테고리 무관) — Web `DANGEROUS_EXTENSIONS` 와 동기화.
 *  - 실행 파일 / 셸 / 매크로 / 서버사이드 코드 / XSS 가능 마크업 / 압축 실행 등
 *  - acceptExtensions 화이트리스트 통과 후 추가 안전망으로 차단
 *  - 클라이언트는 우회 가능 → 백엔드도 동일 정책 적용됨 (`files.service.ts`)
 */
export const DANGEROUS_EXTENSIONS: readonly string[] = [
  // 실행 파일
  "exe",
  "bat",
  "cmd",
  "com",
  "msi",
  "dmg",
  "app",
  "apk",
  "ipa",
  "deb",
  "rpm",
  // 셸 스크립트
  "sh",
  "bash",
  "zsh",
  "ksh",
  "fish",
  "ps1",
  "psm1",
  "psd1",
  "vbs",
  "vbe",
  "wsf",
  "wsh",
  // JS 변형 (XSS 위험)
  "js",
  "mjs",
  "cjs",
  "jse",
  "jsx",
  "ts",
  "tsx",
  // 서버사이드 코드
  "php",
  "php3",
  "php4",
  "php5",
  "phtml",
  "jsp",
  "jspx",
  "asp",
  "aspx",
  "cer",
  "cgi",
  "pl",
  "py",
  "rb",
  // 마크업/XSS
  "html",
  "htm",
  "xhtml",
  "mhtml",
  "mht",
  "shtml",
  "hta",
  "svg",
  "xml",
  // 매크로 가능 오피스 (저장된 매크로 포함)
  "docm",
  "xlsm",
  "pptm",
  "dotm",
  "xltm",
  "potm",
  // 압축 (집중 검사 필요)
  "jar",
  "war",
  "ear",
  // 기타
  "iso",
  "reg",
  "lnk",
  "scr",
  "pif",
  "gadget",
  "inf",
] as const;

/** 파일명에서 확장자만 추출 (소문자, 점 제외, 다중 확장자 안전 처리) */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot < 0 || lastDot === filename.length - 1) return "";
  return filename.slice(lastDot + 1).toLowerCase();
}

// 2026-05-23: 사용자 정책 — VIDEO 50MB / 그 외(IMAGE/AVATAR/DOCUMENT/ATTACHMENT) 10MB (Web · Backend FilesService · Backend Videos 와 동기화).
//   다중 업로드 시에도 각 개별 파일이 카테고리별 maxSize 를 초과할 수 없음.
export const UPLOAD_LIMITS: Readonly<Record<UploadCategory, CategoryLimit>> = {
  IMAGE: {
    maxSize: 10 * 1024 * 1024, // 10MB
    maxCount: 15,
    accept: "image/jpeg,image/png,image/gif,image/webp",
    acceptExtensions: ["jpg", "jpeg", "png", "gif", "webp"],
    label: "이미지",
  },
  AVATAR: {
    maxSize: 10 * 1024 * 1024, // 10MB
    maxCount: 1,
    accept: "image/jpeg,image/png,image/webp",
    acceptExtensions: ["jpg", "jpeg", "png", "webp"],
    label: "프로필 사진",
  },
  DOCUMENT: {
    maxSize: 10 * 1024 * 1024, // 10MB
    maxCount: 15,
    accept:
      "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv",
    acceptExtensions: [
      "pdf",
      "doc",
      "docx",
      "xls",
      "xlsx",
      "ppt",
      "pptx",
      "txt",
      "csv",
    ],
    label: "문서",
  },
  VIDEO: {
    maxSize: 50 * 1024 * 1024, // 50MB — multipart 단일 채널, 클라이언트 사전 압축 권장
    maxCount: 5,
    accept: "video/mp4,video/webm,video/quicktime",
    acceptExtensions: ["mp4", "webm", "mov"],
    label: "영상",
  },
  ATTACHMENT: {
    maxSize: 10 * 1024 * 1024, // 10MB
    maxCount: 15,
    accept:
      "image/jpeg,image/png,image/gif,image/webp,application/pdf,application/zip,text/plain,text/csv",
    acceptExtensions: [
      "jpg",
      "jpeg",
      "png",
      "gif",
      "webp",
      "pdf",
      "zip",
      "txt",
      "csv",
    ],
    label: "첨부파일",
  },
} as const;

/**
 * 다중 업로드 카운트 사전 검증 (UPLOAD_LIMITS 기반 SoT · Web 과 동일 시그니처)
 * @throws UploadValidationError code='TOO_MANY'
 */
export function validateFileCount(
  count: number,
  category: UploadCategory,
  existingCount = 0,
): void {
  const limit = UPLOAD_LIMITS[category];
  if (!limit) {
    throw new UploadValidationError(
      "INVALID_TYPE",
      "알 수 없는 업로드 카테고리입니다.",
    );
  }
  const total = count + existingCount;
  if (total > limit.maxCount) {
    throw new UploadValidationError(
      "TOO_MANY",
      `${limit.label}은(는) 최대 ${limit.maxCount}장까지 업로드할 수 있습니다.`,
    );
  }
}

export const MULTI_UPLOAD_MAX_FILES = 10;
export const MULTI_UPLOAD_TOTAL_SIZE = 50 * 1024 * 1024;

// ===== Errors =====

export class UploadValidationError extends Error {
  constructor(
    public readonly code: "INVALID_TYPE" | "TOO_LARGE" | "EMPTY" | "TOO_MANY",
    message: string,
  ) {
    super(message);
    this.name = "UploadValidationError";
  }
}

export class UploadNetworkError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "UploadNetworkError";
  }
}

export class UploadCancelledError extends Error {
  constructor() {
    super("업로드가 취소되었습니다.");
    this.name = "UploadCancelledError";
  }
}

// ===== Validation =====

/**
 * 클라이언트 사전 검증 — 4단계 보안 검증 (Web `validateFile` 와 동일).
 * 서버 측 Magic Bytes 검증도 존재하므로 이중 방어.
 *
 * 검증 순서:
 *   1) 빈 파일 차단
 *   2) 위험 확장자 블랙리스트 (DANGEROUS_EXTENSIONS — exe/sh/php/js/html/svg/docm/jar 등 50+)
 *   3) 카테고리별 확장자 화이트리스트 (acceptExtensions)
 *   4) MIME 타입 화이트리스트 (accept)
 *   5) 파일 사이즈 (5MB 통일)
 */
export function validateFile(file: File, category: UploadCategory): void {
  if (!file) {
    throw new UploadValidationError("EMPTY", "업로드할 파일이 없습니다.");
  }
  const limit = UPLOAD_LIMITS[category];
  if (!limit) {
    throw new UploadValidationError(
      "INVALID_TYPE",
      "알 수 없는 업로드 카테고리입니다.",
    );
  }

  // 1) 보안 — 확장자 없는 파일 차단 (MIME 위장 우회 방지)
  const ext = getFileExtension(file.name);
  if (!ext) {
    throw new UploadValidationError("INVALID_TYPE", "파일 확장자가 없습니다.");
  }

  // 2) 보안 — 위험 확장자 블랙리스트 차단 (전역, 카테고리 무관)
  if (DANGEROUS_EXTENSIONS.includes(ext)) {
    throw new UploadValidationError(
      "INVALID_TYPE",
      `보안상 ".${ext}" 확장자는 업로드할 수 없습니다.`,
    );
  }

  // 3) 보안 — 카테고리별 확장자 화이트리스트 검증
  if (!limit.acceptExtensions.includes(ext)) {
    const allowed = limit.acceptExtensions.map((e) => `.${e}`).join(", ");
    throw new UploadValidationError(
      "INVALID_TYPE",
      `${limit.label}은(는) ${allowed} 확장자만 업로드할 수 있습니다.`,
    );
  }

  // 4) MIME 타입 화이트리스트 검증 (브라우저가 감지한 MIME)
  const acceptedMimes = limit.accept.split(",").map((m) => m.trim());
  if (!acceptedMimes.includes(file.type)) {
    throw new UploadValidationError(
      "INVALID_TYPE",
      `${limit.label}에 허용되지 않는 형식입니다.`,
    );
  }

  // 5) 파일 사이즈 검증
  if (file.size > limit.maxSize) {
    const maxMb = Math.floor(limit.maxSize / 1024 / 1024);
    throw new UploadValidationError(
      "TOO_LARGE",
      `파일 크기가 ${maxMb}MB를 초과합니다.`,
    );
  }
}

// ===== Upload =====

function handleError(err: unknown, defaultMsg: string): never {
  if (axios.isCancel(err)) {
    throw new UploadCancelledError();
  }
  if (axios.isAxiosError(err)) {
    const status = err.response?.status ?? 0;
    const serverMsg =
      (err.response?.data as { message?: string } | undefined)?.message ??
      err.message ??
      defaultMsg;
    throw new UploadNetworkError(status, serverMsg);
  }
  throw new UploadNetworkError(0, defaultMsg);
}

/**
 * 단일 파일 업로드 — `POST /api/v1/files/upload`
 *
 * @example
 *   const result = await uploadFile(file, {
 *     category: 'IMAGE',
 *     refType: 'banner',
 *     onProgress: (p) => setProgress(p.percent),
 *   });
 *   console.log(result.url); // "/uploads/image/xxx-yyy.jpg"
 */
export async function uploadFile(
  file: File,
  options: UploadOptions,
): Promise<UploadedFile> {
  validateFile(file, options.category);

  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", options.category);
  if (options.refType) formData.append("refType", options.refType);
  if (options.refId) formData.append("refId", options.refId);

  try {
    const res = await axios.post<{ success: boolean; data: UploadedFile }>(
      `${API_BASE_URL}/api/v1/files/upload`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${getAccessToken() ?? ""}`,
        },
        signal: options.signal,
        onUploadProgress: (e: AxiosProgressEvent) => {
          if (!options.onProgress || !e.total) return;
          options.onProgress({
            percent: Math.round((e.loaded / e.total) * 100),
            loaded: e.loaded,
            total: e.total,
          });
        },
      },
    );
    return res.data.data ?? (res.data as unknown as UploadedFile);
  } catch (err) {
    handleError(err, "파일 업로드에 실패했습니다.");
  }
}

/**
 * 다중 파일 업로드 — `POST /api/v1/files/upload-multiple`
 * 최대 10개 · 합계 50MB
 */
export async function uploadFiles(
  files: File[],
  options: UploadOptions,
): Promise<UploadedFile[]> {
  if (!files || files.length === 0) {
    throw new UploadValidationError("EMPTY", "업로드할 파일이 없습니다.");
  }
  if (files.length > MULTI_UPLOAD_MAX_FILES) {
    throw new UploadValidationError(
      "TOO_MANY",
      `다중 업로드는 최대 ${MULTI_UPLOAD_MAX_FILES}개까지 가능합니다.`,
    );
  }
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  if (totalSize > MULTI_UPLOAD_TOTAL_SIZE) {
    throw new UploadValidationError(
      "TOO_LARGE",
      `다중 업로드 합계 크기가 ${Math.floor(MULTI_UPLOAD_TOTAL_SIZE / 1024 / 1024)}MB를 초과했습니다.`,
    );
  }
  files.forEach((f) => validateFile(f, options.category));

  const formData = new FormData();
  files.forEach((f) => formData.append("files", f));
  formData.append("category", options.category);
  if (options.refType) formData.append("refType", options.refType);
  if (options.refId) formData.append("refId", options.refId);

  try {
    const res = await axios.post<{ success: boolean; data: UploadedFile[] }>(
      `${API_BASE_URL}/api/v1/files/upload-multiple`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${getAccessToken() ?? ""}`,
        },
        signal: options.signal,
        onUploadProgress: (e: AxiosProgressEvent) => {
          if (!options.onProgress || !e.total) return;
          options.onProgress({
            percent: Math.round((e.loaded / e.total) * 100),
            loaded: e.loaded,
            total: e.total,
          });
        },
      },
    );
    return res.data.data ?? (res.data as unknown as UploadedFile[]);
  } catch (err) {
    handleError(err, "다중 파일 업로드에 실패했습니다.");
  }
}

/**
 * 파일 삭제 — `DELETE /api/v1/files/:id`
 * 업로더 본인 또는 ADMIN만 가능
 */
export async function deleteFile(id: string): Promise<void> {
  try {
    await axios.delete(`${API_BASE_URL}/api/v1/files/${id}`, {
      headers: {
        Authorization: `Bearer ${getAccessToken() ?? ""}`,
      },
    });
  } catch (err) {
    handleError(err, "파일 삭제에 실패했습니다.");
  }
}

/**
 * 파일 조회 — `GET /api/v1/files/:id`
 */
export async function getFile(id: string): Promise<UploadedFile> {
  try {
    const res = await axios.get<{ success: boolean; data: UploadedFile }>(
      `${API_BASE_URL}/api/v1/files/${id}`,
      {
        headers: {
          Authorization: `Bearer ${getAccessToken() ?? ""}`,
        },
      },
    );
    return res.data.data ?? (res.data as unknown as UploadedFile);
  } catch (err) {
    handleError(err, "파일 조회에 실패했습니다.");
  }
}

/**
 * 상대 URL을 절대 URL로 변환 — `"/uploads/image/xxx.jpg"` → `"http://api.../uploads/image/xxx.jpg"`
 * 이미지 표시나 다운로드 링크용.
 */
export function toAbsoluteUrl(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//.test(url)) return url;
  return `${API_BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

export const uploadService = {
  validateFile,
  uploadFile,
  uploadFiles,
  deleteFile,
  getFile,
  toAbsoluteUrl,
  UPLOAD_LIMITS,
  MULTI_UPLOAD_MAX_FILES,
  MULTI_UPLOAD_TOTAL_SIZE,
};

export default uploadService;
