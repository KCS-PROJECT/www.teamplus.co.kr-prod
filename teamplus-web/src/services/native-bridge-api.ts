/**
 * native-bridge API/결제/업로드 모듈 — C-1 분리 2026-06-07
 */
import { getBridge, ApiRequestError, generateRequestId, getOperationTimeout, pendingApiRequests, cancelRequest, CANCELLED_ERROR_CODE, callNativeApi } from "./native-bridge-core";
import type { ApiRequestOptions, RemoteUploadedFile, LocalStoredFile, LocalFileMeta, LocalFileContent, StorageInfo, UploadPermissionResult, UploadSource, UploadPickResult, UploadBridgeCategory } from "./native-bridge-core";
import { isFlutterBridgeAvailable } from "@/lib/environment";
import { createApiError, ApiErrorCode } from "@/types";
import { handleBridgeError } from "./bridge-error-handler";


/**
 * API 요청 관련 기능 (Web → Native → Backend)
 * 동기/비동기 옵션 지원
 */
export const api = {
  /**
   * GET 요청
   * @param endpoint - API 엔드포인트 (예: '/users', '/teams/my/list')
   * @param params - 쿼리 파라미터
   * @param options - { async: boolean } 동기/비동기 선택 (기본: 비동기)
   */
  async get<T>(
    endpoint: string,
    params?: Record<string, unknown>,
    options: ApiRequestOptions = { async: true },
  ): Promise<T> {
    return makeApiRequest<T>("GET", endpoint, undefined, params, options);
  },

  /**
   * POST 요청
   */
  async post<T>(
    endpoint: string,
    data?: unknown,
    options: ApiRequestOptions = { async: true },
  ): Promise<T> {
    return makeApiRequest<T>("POST", endpoint, data, undefined, options);
  },

  /**
   * PUT 요청
   */
  async put<T>(
    endpoint: string,
    data?: unknown,
    options: ApiRequestOptions = { async: true },
  ): Promise<T> {
    return makeApiRequest<T>("PUT", endpoint, data, undefined, options);
  },

  /**
   * PATCH 요청
   */
  async patch<T>(
    endpoint: string,
    data?: unknown,
    options: ApiRequestOptions = { async: true },
  ): Promise<T> {
    return makeApiRequest<T>("PATCH", endpoint, data, undefined, options);
  },

  /**
   * DELETE 요청
   */
  async delete<T>(
    endpoint: string,
    options: ApiRequestOptions = { async: true },
  ): Promise<T> {
    return makeApiRequest<T>("DELETE", endpoint, undefined, undefined, options);
  },
};

/**
 * 공통 API 요청 함수
 */
async function makeApiRequest<T>(
  method: string,
  endpoint: string,
  data?: unknown,
  queryParams?: Record<string, unknown>,
  options: ApiRequestOptions = { async: true },
): Promise<T> {
  const requestId = generateRequestId();
  const isAsync = options.async !== false;

  // 이미 취소된 signal인 경우 즉시 reject
  if (options.signal?.aborted) {
    const cancelError = createApiError(
      CANCELLED_ERROR_CODE,
      "요청이 취소되었습니다.",
    );
    throw new ApiRequestError(cancelError);
  }

  if (isAsync) {
    // 비동기: Promise로 응답 대기
    return new Promise<T>((resolve, reject) => {
      // 타임아웃 설정 (작업별 차등)
      const timeout = getOperationTimeout("api");
      const timeoutId = setTimeout(() => {
        const pending = pendingApiRequests.get(requestId);
        if (pending) {
          if (pending.timeoutId) clearTimeout(pending.timeoutId);
          pendingApiRequests.delete(requestId);
          const timeoutError = createApiError(
            ApiErrorCode.TIMEOUT_ERROR,
            `API 요청 타임아웃 (${timeout / 1000}초)`,
          );
          reject(new ApiRequestError(timeoutError));
        }
      }, timeout);

      // pendingRequests에 등록
      pendingApiRequests.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeoutId,
      });

      // AbortSignal 리스너 등록
      if (options.signal) {
        options.signal.addEventListener(
          "abort",
          () => {
            cancelRequest(requestId);
          },
          { once: true },
        );
      }

      // Native에 요청 전송
      callNativeApi({
        method,
        endpoint,
        data,
        queryParams,
        async: true,
        requestId,
      }).catch((err) => {
        // 요청 전송 자체가 실패한 경우
        clearTimeout(timeoutId);
        pendingApiRequests.delete(requestId);
        reject(err);
      });
    });
  } else {
    // 동기: 직접 결과 반환
    const result = await callNativeApi({
      method,
      endpoint,
      data,
      queryParams,
      async: false,
    });
    return result as T;
  }
}

/**
 * 결제 관련 기능
 */
export const payment = {
  async initiate(paymentData: {
    orderId: string;
    amount: number;
    productName: string;
    buyerName: string;
    buyerPhone: string;
    buyerEmail: string;
  }): Promise<{
    success: boolean;
    transactionId?: string;
    errorMessage?: string;
  }> {
    try {
      const bridge = getBridge();
      return await bridge.payment.initiate(paymentData);
    } catch (error) {
      handleBridgeError("payment", error, {
        operation: "initiate",
        orderId: paymentData.orderId,
      });
      return {
        success: false,
        errorMessage:
          error instanceof Error ? error.message : "결제 처리 중 오류",
      };
    }
  },

  async verify(transactionId: string): Promise<{
    success: boolean;
    verified: boolean;
    errorMessage?: string;
  }> {
    try {
      const bridge = getBridge();
      return await bridge.payment.verify(transactionId);
    } catch (error) {
      handleBridgeError("payment", error, {
        operation: "verify",
        transactionId,
      });
      return {
        success: false,
        verified: false,
        errorMessage:
          error instanceof Error ? error.message : "결제 검증 중 오류",
      };
    }
  },
};

// ============================================
// 업로드 (카메라·갤러리·문서)
// ============================================

/**
 * Flutter Native로부터 파일 선택 결과를 받아 Web `File` 객체로 변환.
 *
 * Flutter가 dataUrl을 주면 그대로 디코딩,
 * path만 주면 Flutter가 별도 endpoint로 바이너리를 제공해야 하므로
 * 여기서는 fetch로 읽어 Blob을 구성한다 (Flutter는 file://, content:// 등).
 */
async function toFile(result: UploadPickResult): Promise<File> {
  if (result.dataUrl) {
    const response = await fetch(result.dataUrl);
    const blob = await response.blob();
    return new File([blob], result.name, {
      type: result.mimeType || blob.type,
    });
  }
  if (result.path) {
    const response = await fetch(result.path);
    const blob = await response.blob();
    return new File([blob], result.name, {
      type: result.mimeType || blob.type,
    });
  }
  throw new Error("업로드 선택 결과에 path/dataUrl이 없습니다.");
}

/**
 * 업로드 관련 네이티브 기능
 *
 * @example
 * const result = await upload.pickImage({ source: 'camera' });
 * const file = await upload.toWebFile(result);
 * // useUpload 훅으로 file 업로드
 */
export const upload = {
  /**
   * Flutter Bridge `upload` 모듈 가용성 확인 (iOS/Android 네이티브 앱에서만 true)
   */
  isAvailable(): boolean {
    if (!isFlutterBridgeAvailable()) return false;
    const bridge = window.FlutterBridge;
    return Boolean(bridge?.upload);
  },

  /**
   * 카메라/갤러리로 이미지 선택.
   *
   * @throws Bridge 미가용/권한 거부/사용자 취소
   */
  async pickImage(options: {
    source: UploadSource;
    maxSize?: number;
    quality?: number;
  }): Promise<UploadPickResult> {
    try {
      const bridge = getBridge();
      if (!bridge.upload) {
        throw new Error(
          "네이티브 업로드 기능을 사용할 수 없습니다. 앱을 최신으로 업데이트해주세요.",
        );
      }
      return await bridge.upload.pickImage(options);
    } catch (error) {
      handleBridgeError("upload", error, {
        operation: "pickImage",
        source: options.source,
      });
      throw error;
    }
  },

  /**
   * 임의 파일 선택 (문서·첨부).
   */
  async pickFile(
    options: {
      accept?: string[];
      maxSize?: number;
    } = {},
  ): Promise<UploadPickResult> {
    try {
      const bridge = getBridge();
      if (!bridge.upload) {
        throw new Error(
          "네이티브 업로드 기능을 사용할 수 없습니다. 앱을 최신으로 업데이트해주세요.",
        );
      }
      return await bridge.upload.pickFile(options);
    } catch (error) {
      handleBridgeError("upload", error, { operation: "pickFile" });
      throw error;
    }
  },

  /**
   * 갤러리 다중 이미지 선택.
   */
  async pickMultipleImages(
    options: {
      maxCount?: number;
      maxSize?: number;
      quality?: number;
      maxWidth?: number;
      maxHeight?: number;
    } = {},
  ): Promise<UploadPickResult[]> {
    try {
      const bridge = getBridge();
      if (!bridge.upload) {
        throw new Error(
          "네이티브 업로드 기능을 사용할 수 없습니다. 앱을 최신으로 업데이트해주세요.",
        );
      }
      const result = await bridge.upload.pickMultipleImages(options);
      return result.files;
    } catch (error) {
      handleBridgeError("upload", error, { operation: "pickMultipleImages" });
      throw error;
    }
  },

  /**
   * 네이티브에서 직접 백엔드로 업로드.
   * JWT 토큰은 Native Dio가 자동 첨부.
   */
  async uploadToServer(params: {
    localPath: string;
    category: UploadBridgeCategory;
    refType?: string;
    refId?: string;
    originalName?: string;
  }): Promise<RemoteUploadedFile> {
    try {
      const bridge = getBridge();
      if (!bridge.upload) {
        throw new Error("네이티브 업로드 기능을 사용할 수 없습니다.");
      }
      return await bridge.upload.uploadToServer(params);
    } catch (error) {
      handleBridgeError("upload", error, { operation: "uploadToServer" });
      throw error;
    }
  },

  /**
   * 서버 업로드 파일 삭제.
   */
  async deleteRemote(id: string): Promise<void> {
    try {
      const bridge = getBridge();
      if (!bridge.upload) {
        throw new Error("네이티브 업로드 기능을 사용할 수 없습니다.");
      }
      await bridge.upload.deleteRemote({ id });
    } catch (error) {
      handleBridgeError("upload", error, { operation: "deleteRemote", id });
      throw error;
    }
  },

  // ===== 로컬 CRUD (연월 경로 자동 생성) =====

  /**
   * 로컬 저장. `dataBase64` 또는 `sourcePath` 중 하나 제공.
   */
  async saveLocal(params: {
    category: UploadBridgeCategory;
    originalName: string;
    dataBase64?: string;
    sourcePath?: string;
  }): Promise<LocalStoredFile> {
    const bridge = getBridge();
    if (!bridge.upload)
      throw new Error("네이티브 업로드 기능을 사용할 수 없습니다.");
    try {
      return await bridge.upload.saveLocal(params);
    } catch (error) {
      handleBridgeError("upload", error, { operation: "saveLocal" });
      throw error;
    }
  },

  /**
   * 로컬 파일 읽기 (base64 반환).
   */
  async readLocal(path: string): Promise<LocalFileContent> {
    const bridge = getBridge();
    if (!bridge.upload)
      throw new Error("네이티브 업로드 기능을 사용할 수 없습니다.");
    try {
      return await bridge.upload.readLocal({ path });
    } catch (error) {
      handleBridgeError("upload", error, { operation: "readLocal", path });
      throw error;
    }
  },

  /**
   * 로컬 파일 목록. 카테고리 미지정 시 전체.
   */
  async listLocal(category?: UploadBridgeCategory): Promise<LocalFileMeta[]> {
    const bridge = getBridge();
    if (!bridge.upload)
      throw new Error("네이티브 업로드 기능을 사용할 수 없습니다.");
    try {
      const result = await bridge.upload.listLocal({ category });
      return result.files;
    } catch (error) {
      handleBridgeError("upload", error, { operation: "listLocal" });
      throw error;
    }
  },

  /**
   * 로컬 파일명 변경 (연월 경로 유지).
   */
  async renameLocal(
    oldPath: string,
    newFileName: string,
  ): Promise<LocalFileMeta> {
    const bridge = getBridge();
    if (!bridge.upload)
      throw new Error("네이티브 업로드 기능을 사용할 수 없습니다.");
    try {
      return await bridge.upload.renameLocal({ oldPath, newFileName });
    } catch (error) {
      handleBridgeError("upload", error, { operation: "renameLocal" });
      throw error;
    }
  },

  /**
   * 로컬 파일 단일 삭제.
   */
  async deleteLocal(path: string): Promise<void> {
    const bridge = getBridge();
    if (!bridge.upload)
      throw new Error("네이티브 업로드 기능을 사용할 수 없습니다.");
    try {
      await bridge.upload.deleteLocal({ path });
    } catch (error) {
      handleBridgeError("upload", error, { operation: "deleteLocal", path });
      throw error;
    }
  },

  /**
   * 카테고리 전체 삭제 (연월 구조 유지, 파일만 제거).
   */
  async clearCategory(category: UploadBridgeCategory): Promise<number> {
    const bridge = getBridge();
    if (!bridge.upload)
      throw new Error("네이티브 업로드 기능을 사용할 수 없습니다.");
    try {
      const result = await bridge.upload.clearCategory({ category });
      return result.deletedCount;
    } catch (error) {
      handleBridgeError("upload", error, {
        operation: "clearCategory",
        category,
      });
      throw error;
    }
  },

  /**
   * 저장소 통계 (총 바이트·파일 수·카테고리별).
   */
  async getStorageInfo(): Promise<StorageInfo> {
    const bridge = getBridge();
    if (!bridge.upload)
      throw new Error("네이티브 업로드 기능을 사용할 수 없습니다.");
    try {
      return await bridge.upload.getStorageInfo();
    } catch (error) {
      handleBridgeError("upload", error, { operation: "getStorageInfo" });
      throw error;
    }
  },

  /**
   * 권한 요청 (카메라/사진/마이크).
   */
  async requestPermission(
    kind: "camera" | "photos" | "microphone",
  ): Promise<UploadPermissionResult> {
    const bridge = getBridge();
    if (!bridge.upload)
      throw new Error("네이티브 업로드 기능을 사용할 수 없습니다.");
    try {
      return await bridge.upload.requestPermission({ kind });
    } catch (error) {
      handleBridgeError("upload", error, {
        operation: "requestPermission",
        kind,
      });
      throw error;
    }
  },

  /**
   * OS 설정 앱 열기 (permanentlyDenied 복구).
   */
  async openSettings(): Promise<boolean> {
    const bridge = getBridge();
    if (!bridge.upload)
      throw new Error("네이티브 업로드 기능을 사용할 수 없습니다.");
    try {
      const result = await bridge.upload.openSettings();
      return result.opened;
    } catch (error) {
      handleBridgeError("upload", error, { operation: "openSettings" });
      throw error;
    }
  },

  /**
   * PickResult → Web File 변환 (multipart 업로드용).
   */
  toWebFile(result: UploadPickResult): Promise<File> {
    return toFile(result);
  },
};
