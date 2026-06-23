/**
 * Upload Service
 *
 * 진행률(progress) 추적이 필요한 업로드는 axios interceptor 경로가 아닌
 * 직접 XHR을 사용한다 (ReadableStream 기반 Fetch는 브라우저 호환성이 떨어짐).
 *
 * 환경별 경로:
 * - Web/브라우저: XHR → Backend (localhost:5003 fallback · env.ts 기준)
 * - Native(Flutter WebView): 동일 XHR을 WebView 내부에서 실행 → Flutter Dio가 아닌
 *   WebView의 XHR Stack이 Bridge 없이 직접 전송 (multipart 는 Bridge가 처리 못하므로
 *   Web axios fallback과 동일한 구조)
 */

import { hybridAuth } from './hybrid-auth';
import type {
  UploadedFile,
  UploadOptions,
  UploadProgress,
} from '@/types/file';
import {
  UPLOAD_LIMITS,
  DANGEROUS_EXTENSIONS,
  getFileExtension,
} from '@/types/file';
import { env } from '@/lib/env';
import { isNativeApp } from '@/lib/environment';
import { upload as nativeBridgeUpload } from './native-bridge';
import type {
  RemoteUploadedFile,
  UploadBridgeCategory,
} from './native-bridge';

const API_BASE_URL = env.NEXT_PUBLIC_API_URL;

/**
 * Native Bridge 업로드 경로 활성화 플래그 (Phase 3.2 SPEC §4)
 *
 * `NEXT_PUBLIC_UPLOAD_VIA_NATIVE_BRIDGE=true` 이고 native 환경일 때만
 * `nativeBridge.upload.uploadToServer` 경유. 기본값은 false 로,
 * native WebView 에서도 XHR FormData 직접 전송 (기존 안정 경로 유지).
 */
const USE_NATIVE_UPLOAD =
  process.env.NEXT_PUBLIC_UPLOAD_VIA_NATIVE_BRIDGE === 'true';

export class UploadValidationError extends Error {
  constructor(
    // [2026-05-18 BUG FIX] 'TOO_MANY' 코드 사용 회귀 — union 확장. line 142 호출부 정합.
    public readonly code: 'INVALID_TYPE' | 'TOO_LARGE' | 'EMPTY' | 'TOO_MANY',
    message: string,
  ) {
    super(message);
    this.name = 'UploadValidationError';
  }
}

export class UploadNetworkError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'UploadNetworkError';
  }
}

export class UploadCancelledError extends Error {
  constructor() {
    super('업로드가 취소되었습니다.');
    this.name = 'UploadCancelledError';
  }
}

/**
 * 클라이언트 사전 검증 — 카테고리별 MIME / 크기
 */
export function validateFile(
  file: File,
  category: UploadOptions['category'],
): void {
  if (!file) {
    throw new UploadValidationError('EMPTY', '업로드할 파일이 없습니다.');
  }
  const limit = UPLOAD_LIMITS[category];
  if (!limit) {
    throw new UploadValidationError(
      'INVALID_TYPE',
      '알 수 없는 업로드 카테고리입니다.',
    );
  }

  // 1) 보안 — 위험 확장자 블랙리스트 차단 (전역, 카테고리 무관)
  //    파일명 위변조(MIME 우회) 방지를 위해 확장자 기반 추가 검증.
  const ext = getFileExtension(file.name);
  if (!ext) {
    throw new UploadValidationError(
      'INVALID_TYPE',
      '파일 확장자가 없습니다.',
    );
  }
  if (DANGEROUS_EXTENSIONS.includes(ext)) {
    throw new UploadValidationError(
      'INVALID_TYPE',
      `보안상 ".${ext}" 확장자는 업로드할 수 없습니다.`,
    );
  }

  // 2) 보안 — 카테고리별 확장자 화이트리스트 검증
  if (!limit.acceptExtensions.includes(ext)) {
    const allowed = limit.acceptExtensions.map((e) => `.${e}`).join(', ');
    throw new UploadValidationError(
      'INVALID_TYPE',
      `${limit.label}은(는) ${allowed} 확장자만 업로드할 수 있습니다.`,
    );
  }

  // 3) MIME 타입 화이트리스트 검증 (브라우저가 감지한 MIME)
  const acceptedMimes = limit.accept.split(',').map((m) => m.trim());
  if (!acceptedMimes.includes(file.type)) {
    throw new UploadValidationError(
      'INVALID_TYPE',
      '지원하지 않는 파일 형식입니다.',
    );
  }

  // 4) 파일 사이즈 검증
  if (file.size > limit.maxSize) {
    const maxMb = Math.floor(limit.maxSize / 1024 / 1024);
    throw new UploadValidationError(
      'TOO_LARGE',
      `파일 크기가 ${maxMb}MB를 초과합니다.`,
    );
  }
}

/**
 * 다중 업로드 카운트 사전 검증 (UPLOAD_LIMITS 기반 SoT)
 *
 * 사용처에서 input change 시점 또는 uploadFiles 호출 전에 호출하여
 * 카테고리별 최대 개수(maxCount) 초과를 차단한다.
 * `existingCount` 가 있으면 (이미 선택된 개수 + 신규 추가 개수)로 검증.
 *
 * @throws UploadValidationError (code: 'TOO_MANY')
 */
export function validateFileCount(
  count: number,
  category: UploadOptions['category'],
  existingCount = 0,
): void {
  const limit = UPLOAD_LIMITS[category];
  if (!limit) {
    throw new UploadValidationError(
      'INVALID_TYPE',
      '알 수 없는 업로드 카테고리입니다.',
    );
  }
  const total = count + existingCount;
  if (total > limit.maxCount) {
    throw new UploadValidationError(
      'TOO_MANY',
      `${limit.label}은(는) 최대 ${limit.maxCount}장까지 업로드할 수 있습니다.`,
    );
  }
}

/**
 * 카테고리를 Bridge 카테고리로 좁힘 (실제로 동일 enum 이지만 타입 가드 명시)
 */
function toBridgeCategory(category: UploadOptions['category']): UploadBridgeCategory {
  return category;
}

/**
 * RemoteUploadedFile (Native Bridge 응답) → UploadedFile (Web 표준) 변환
 *
 * Bridge 응답이 일부 필드(storedName/extension/uploaderId/updatedAt 등) 누락 가능 →
 * 안전한 기본값으로 정규화. 호출처는 항상 UploadedFile 계약만 신뢰.
 */
function normalizeRemoteFile(
  remote: RemoteUploadedFile,
  refType?: string,
  refId?: string,
): UploadedFile {
  const r = remote as unknown as Partial<UploadedFile> & RemoteUploadedFile;
  return {
    id: r.id,
    category: r.category,
    originalName: r.originalName,
    storedName: r.storedName ?? r.originalName,
    extension: r.extension,
    url: r.url,
    thumbUrl: r.thumbUrl,
    exifJson: r.exifJson,
    mimeType: r.mimeType,
    size: r.size,
    width: r.width,
    height: r.height,
    uploaderId: r.uploaderId ?? '',
    modifiedById: r.modifiedById,
    refType: r.refType ?? refType,
    refId: r.refId ?? refId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt ?? r.createdAt,
  };
}

/**
 * Native Bridge 를 경유한 업로드 — 임시 로컬 저장 후 Bridge `uploadToServer` 호출.
 *
 * 진행률 콜백은 Bridge 가 단계 단위(시작/완료)만 지원하므로 0→100 시뮬레이션.
 * 다단계 진행률이 필요하면 USE_NATIVE_UPLOAD=false 로 XHR 경로를 사용.
 */
async function uploadViaNativeBridge(
  file: File,
  options: UploadOptions,
): Promise<UploadedFile> {
  // Bridge 는 `localPath` 만 받으므로 File → base64 → saveLocal → uploadToServer 경로 사용
  if (!nativeBridgeUpload.isAvailable()) {
    throw new UploadNetworkError(0, '네이티브 업로드 기능을 사용할 수 없습니다.');
  }

  // 진행률 0% 시작
  options.onProgress?.({ loaded: 0, total: file.size, percent: 0 });

  const arrayBuffer = await file.arrayBuffer();
  // 큰 파일도 안정적으로 base64 변환 (chunk 1MB)
  const bytes = new Uint8Array(arrayBuffer);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + CHUNK)),
    );
  }
  const dataBase64 =
    typeof btoa !== 'undefined' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');

  // 절반 진행률
  options.onProgress?.({
    loaded: Math.floor(file.size / 2),
    total: file.size,
    percent: 50,
  });

  const bridgeCategory = toBridgeCategory(options.category);

  const localFile = await nativeBridgeUpload.saveLocal({
    category: bridgeCategory,
    originalName: file.name,
    dataBase64,
  });

  const remote = await nativeBridgeUpload.uploadToServer({
    localPath: localFile.path,
    category: bridgeCategory,
    refType: options.refType,
    refId: options.refId,
    originalName: file.name,
  });

  options.onProgress?.({ loaded: file.size, total: file.size, percent: 100 });

  return normalizeRemoteFile(remote, options.refType, options.refId);
}

/**
 * 단일 파일 업로드 — 진행률 추적
 *
 * 환경별 경로:
 *   - USE_NATIVE_UPLOAD=true + Native 환경: Bridge 경유 (uploadViaNativeBridge)
 *   - 그 외 (기본): XHR FormData (uploadViaXHR)
 *
 * Per-entry 진행률: 호출처가 `options.onProgress` 를 entry별로 제공하면
 * 각 entry 가 정확한 진행률을 받을 수 있다. 다중 동시 업로드 시에도 안전.
 */
export function uploadFile(
  file: File,
  options: UploadOptions,
): Promise<UploadedFile> {
  validateFile(file, options.category);

  if (USE_NATIVE_UPLOAD && isNativeApp() && nativeBridgeUpload.isAvailable()) {
    return uploadViaNativeBridge(file, options);
  }

  return uploadViaXHR(file, options);
}

/**
 * XHR 기반 업로드 (Web 기본 경로 · 진행률 byte-단위 추적)
 */
function uploadViaXHR(
  file: File,
  options: UploadOptions,
): Promise<UploadedFile> {
  return new Promise<UploadedFile>(async (resolve, reject) => {
    try {
      const tokenInfo = await hybridAuth.getToken();
      const accessToken = tokenInfo?.accessToken;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', options.category);
      if (options.refType) formData.append('refType', options.refType);
      if (options.refId) formData.append('refId', options.refId);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE_URL}/api/v1/files/upload`, true);

      if (accessToken) {
        xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
      }

      if (options.onProgress) {
        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          const progress: UploadProgress = {
            loaded: event.loaded,
            total: event.total,
            percent: Math.round((event.loaded / event.total) * 100),
          };
          options.onProgress!(progress);
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const raw = JSON.parse(xhr.responseText);
            const data = (raw?.data ?? raw) as UploadedFile;
            resolve(data);
          } catch {
            reject(
              new UploadNetworkError(
                xhr.status,
                '서버 응답을 해석할 수 없습니다.',
              ),
            );
          }
        } else {
          let message = '업로드에 실패했습니다.';
          try {
            const err = JSON.parse(xhr.responseText) as { message?: string };
            if (err.message) message = err.message;
          } catch {
            // ignore
          }
          reject(new UploadNetworkError(xhr.status, message));
        }
      };

      xhr.onerror = () => {
        reject(new UploadNetworkError(0, '네트워크 오류가 발생했습니다.'));
      };

      xhr.onabort = () => {
        reject(new UploadCancelledError());
      };

      if (options.signal) {
        if (options.signal.aborted) {
          reject(new UploadCancelledError());
          return;
        }
        options.signal.addEventListener(
          'abort',
          () => {
            xhr.abort();
          },
          { once: true },
        );
      }

      xhr.send(formData);
    } catch (error) {
      reject(
        error instanceof Error
          ? error
          : new UploadNetworkError(0, '알 수 없는 오류가 발생했습니다.'),
      );
    }
  });
}

/**
 * 다중 파일 순차 업로드 — 각 파일 진행률은 개별 콜백으로 전달
 */
export async function uploadFiles(
  files: File[],
  options: UploadOptions & {
    onFileProgress?: (index: number, progress: UploadProgress) => void;
    onFileComplete?: (index: number, result: UploadedFile) => void;
    onFileError?: (index: number, error: Error) => void;
  },
): Promise<{ succeeded: UploadedFile[]; failed: Array<{ index: number; error: Error }> }> {
  // SoT 카운트 사전 검증 — UPLOAD_LIMITS.maxCount 초과 시 throw
  validateFileCount(files.length, options.category);

  const succeeded: UploadedFile[] = [];
  const failed: Array<{ index: number; error: Error }> = [];

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    try {
      const result = await uploadFile(file, {
        ...options,
        onProgress: (progress) => options.onFileProgress?.(i, progress),
      });
      succeeded.push(result);
      options.onFileComplete?.(i, result);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      failed.push({ index: i, error: err });
      options.onFileError?.(i, err);
    }
  }

  return { succeeded, failed };
}

// ==================== 영상 업로드 (multipart/form-data 단일 채널 · 2026-05-23) ====================

/**
 * 영상 참조 유형 — Backend CreateVideoDto.videoType enum 과 일치
 */
export type VideoRefType =
  | 'player_profile'
  | 'award'
  | 'training'
  | 'match'
  | 'highlight'
  | 'other';

/**
 * Backend `POST /api/v1/videos` 응답의 Video 엔티티 (필요 필드만 타이핑)
 */
export interface RegisteredVideo {
  id: string;
  title: string;
  videoUrl: string;
  videoType?: string;
  status?: string;
  createdAt?: string;
  uploader?: { id: string; firstName?: string; lastName?: string };
}

/**
 * 영상 multipart 업로드 메타데이터 — `POST /api/v1/videos` body 필드와 동일.
 * 본인 자녀 외 선수에 대한 권한 검증은 backend `files.service.validateUploadPermission` 가 처리.
 */
export interface UploadVideoMetadata {
  title: string;
  description?: string;
  teamId?: string;
  videoType?: 'training' | 'match' | 'highlight' | 'other';
  tournamentId?: string;
  matchId?: string;
  classId?: string;
  isPublic?: boolean;
  duration?: number;
}

/**
 * 영상 multipart 업로드 — 모바일 카메라/갤러리·웹 파일선택 공통 진입점.
 *
 * 단일 호출로 multer 업로드 + Video 레코드 자동 생성 완료.
 * - 50MB 초과 시 backend 400 응답 (multer ParseFilePipe)
 * - 비허용 MIME 시 400
 * - 401 인증 만료 / 403 권한 없음 / 503 서버 일시 장애
 *
 * 진행률은 XHR `upload.onprogress` 이벤트로 0-100% 추적.
 */
export async function uploadVideo(
  file: File,
  metadata: UploadVideoMetadata,
  options?: {
    onProgress?: UploadOptions['onProgress'];
    signal?: AbortSignal;
  },
): Promise<RegisteredVideo> {
  validateFile(file, 'VIDEO');

  const tokenInfo = await hybridAuth.getToken();
  const accessToken = tokenInfo?.accessToken;

  const formData = new FormData();
  formData.append('file', file);
  Object.entries(metadata).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      formData.append(key, String(value));
    }
  });

  return new Promise<RegisteredVideo>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/api/v1/videos`, true);
    if (accessToken) {
      xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    }

    if (options?.onProgress) {
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        options.onProgress!({
          loaded: event.loaded,
          total: event.total,
          percent: Math.round((event.loaded / event.total) * 100),
        });
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText) as {
            success?: boolean;
            message?: string;
            data: RegisteredVideo;
          };
          resolve(body.data);
        } catch {
          reject(
            new UploadNetworkError(
              xhr.status,
              '응답 본문을 해석할 수 없습니다.',
            ),
          );
        }
        return;
      }

      let message = '영상 업로드에 실패했습니다.';
      try {
        const err = JSON.parse(xhr.responseText) as { message?: string };
        if (err.message) message = err.message;
      } catch {
        // ignore body parse errors
      }
      reject(new UploadNetworkError(xhr.status, message));
    };

    xhr.onerror = () => {
      reject(new UploadNetworkError(0, '네트워크 오류가 발생했습니다.'));
    };

    xhr.onabort = () => {
      reject(new UploadCancelledError());
    };

    if (options?.signal) {
      if (options.signal.aborted) {
        reject(new UploadCancelledError());
        return;
      }
      options.signal.addEventListener(
        'abort',
        () => {
          xhr.abort();
        },
        { once: true },
      );
    }

    xhr.send(formData);
  });
}

/**
 * 파일 삭제
 */
export async function deleteFile(id: string): Promise<void> {
  const tokenInfo = await hybridAuth.getToken();
  const accessToken = tokenInfo?.accessToken;

  const response = await fetch(`${API_BASE_URL}/api/v1/files/${id}`, {
    method: 'DELETE',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });

  if (!response.ok) {
    throw new UploadNetworkError(response.status, '삭제에 실패했습니다.');
  }
}
