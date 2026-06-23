/**
 * 통합 업로드 타입
 * Backend의 UploadedFile / UploadCategory 모델과 1:1 대응.
 */

/** 업로드 카테고리 — Backend UploadCategory enum과 일치 */
export type UploadCategory =
  | 'IMAGE'
  | 'DOCUMENT'
  | 'VIDEO'
  | 'AVATAR'
  | 'ATTACHMENT';

/** 서버 응답 — FileResponseDto와 일치 */
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
  /** 자동 생성 썸네일 URL (sharp 처리 후 — IMAGE/AVATAR 카테고리) — Phase 2.1 SPEC */
  thumbUrl?: string;
  /** EXIF 메타데이터 JSON (sharp 추출 후 — IMAGE 카테고리) — Phase 2.1 SPEC */
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

/** 업로드 진행률 스냅샷 */
export interface UploadProgress {
  /** 0 ~ 100 */
  percent: number;
  /** 현재까지 전송된 바이트 */
  loaded: number;
  /** 전체 바이트 */
  total: number;
}

/** 단일 업로드 요청 옵션 */
export interface UploadOptions {
  category: UploadCategory;
  refType?: string;
  refId?: string;
  /** 진행률 콜백 (0-100) */
  onProgress?: (progress: UploadProgress) => void;
  /** AbortSignal — 업로드 취소 */
  signal?: AbortSignal;
}

/** 카테고리별 제한 (클라이언트 사전 검증용)
 *  [2026-05-23 SoT 정책] 모든 첨부 파일은 단일 진입점인 UPLOAD_LIMITS 기준에 따른다:
 *   · VIDEO 단일 파일 → **50MB** (multipart 단일 채널, 클라이언트 사전 압축 권장)
 *   · 그 외(IMAGE/AVATAR/DOCUMENT/ATTACHMENT) 단일 파일 → **10MB**
 *   · 다중 업로드 최대 개수 → **15장** (IMAGE/DOCUMENT/ATTACHMENT), AVATAR 1, VIDEO 5
 *   · 보안: 확장자 화이트리스트(acceptExtensions) + 블랙리스트(DANGEROUS_EXTENSIONS) 이중 검증
 */
export interface CategoryLimit {
  /** 단일 파일 최대 사이즈 (bytes) */
  maxSize: number;
  /** 다중 업로드 최대 개수 — 호출처에서 override 가능하지만 이 값 초과는 거부됨 */
  maxCount: number;
  /** MIME 타입 화이트리스트 (input accept 속성 + 클라이언트 검증) */
  accept: string;
  /** 확장자 화이트리스트 (소문자, 점 제외) — 보안: MIME과 확장자 cross-check */
  acceptExtensions: readonly string[];
  label: string;
}

/**
 * 위험 확장자 블랙리스트 (전역, 카테고리 무관)
 *  - 실행 파일 / 스크립트 / 매크로 / 서버사이드 코드 / XSS 가능 마크업 등
 *  - acceptExtensions 화이트리스트 통과 후 추가 안전망으로 차단
 *  - 클라이언트는 우회 가능 → 백엔드도 동일 정책 적용 권장
 */
export const DANGEROUS_EXTENSIONS: readonly string[] = [
  // 실행 파일
  // [수정 2026-05-23 BE-039] "app" 제거 — 다의어(MyApp/HockeyApp/AppIcon 등)로 false positive
  //  큼. .app 마지막 확장자 자체는 acceptExtensions 화이트리스트가 차단하므로 안전.
  //  백엔드 `DANGEROUS_EXTENSIONS` 와 정합 (teamplus-backend/src/files/files.service.ts).
  'exe', 'bat', 'cmd', 'com', 'msi', 'dmg', 'apk', 'ipa', 'deb', 'rpm',
  // 셸 스크립트
  'sh', 'bash', 'zsh', 'ksh', 'fish', 'ps1', 'psm1', 'psd1', 'vbs', 'vbe', 'wsf', 'wsh',
  // JS 변형 (XSS 위험)
  'js', 'mjs', 'cjs', 'jse', 'jsx', 'ts', 'tsx',
  // 서버사이드 코드
  'php', 'php3', 'php4', 'php5', 'phtml', 'jsp', 'jspx', 'asp', 'aspx', 'cer', 'cgi', 'pl', 'py', 'rb',
  // 마크업/XSS
  'html', 'htm', 'xhtml', 'mhtml', 'mht', 'shtml', 'hta', 'svg', 'xml',
  // 매크로 가능 오피스 (저장된 매크로 포함)
  'docm', 'xlsm', 'pptm', 'dotm', 'xltm', 'potm',
  // 압축 (집중 검사 필요 — ATTACHMENT 화이트리스트에 zip 허용 시 별도 정책)
  'jar', 'war', 'ear',
  // 기타
  'iso', 'reg', 'lnk', 'scr', 'pif', 'gadget', 'inf',
] as const;

// 2026-05-23: 사용자 정책 — VIDEO 50MB / 그 외 카테고리(IMAGE/AVATAR/DOCUMENT/ATTACHMENT) 10MB.
//   다중 업로드 시에도 각 파일이 카테고리별 maxSize 를 초과할 수 없음.
//   (Backend FilesService · Videos Module · Admin upload.service 와 동기화)
export const UPLOAD_LIMITS: Readonly<Record<UploadCategory, CategoryLimit>> = {
  IMAGE: {
    maxSize: 10 * 1024 * 1024, // 10MB
    maxCount: 15,
    accept: 'image/jpeg,image/png,image/gif,image/webp',
    acceptExtensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    label: '이미지',
  },
  AVATAR: {
    maxSize: 10 * 1024 * 1024, // 10MB
    maxCount: 1,
    accept: 'image/jpeg,image/png,image/webp',
    acceptExtensions: ['jpg', 'jpeg', 'png', 'webp'],
    label: '프로필 사진',
  },
  DOCUMENT: {
    maxSize: 10 * 1024 * 1024, // 10MB
    maxCount: 15,
    accept:
      'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv',
    acceptExtensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'],
    label: '문서',
  },
  VIDEO: {
    maxSize: 50 * 1024 * 1024, // 50MB — multipart 단일 채널, 클라이언트 사전 압축 권장
    maxCount: 5,
    accept: 'video/mp4,video/webm,video/quicktime',
    acceptExtensions: ['mp4', 'webm', 'mov'],
    label: '영상',
  },
  ATTACHMENT: {
    maxSize: 10 * 1024 * 1024, // 10MB
    maxCount: 15,
    accept:
      'image/jpeg,image/png,image/gif,image/webp,application/pdf,application/zip,text/plain,text/csv',
    acceptExtensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'zip', 'txt', 'csv'],
    label: '첨부파일',
  },
} as const;

/** 파일명에서 확장자만 추출 (소문자, 점 제외, 다중 확장자 안전 처리) */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot < 0 || lastDot === filename.length - 1) return '';
  return filename.slice(lastDot + 1).toLowerCase();
}
