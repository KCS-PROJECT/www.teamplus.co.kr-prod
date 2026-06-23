'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * 네트워크 연결 상태
 */
export enum NetworkStatus {
  Online = 'online',
  Offline = 'offline',
  Unknown = 'unknown',
}

/**
 * 네트워크 연결 유형
 */
export type NetworkType = 'wifi' | '4g' | '3g' | '2g' | 'slow-2g' | 'unknown' | 'none';

/**
 * 네트워크 상태 정보
 */
export interface NetworkInfo {
  /** 온라인 상태 여부 */
  isOnline: boolean;
  /** 오프라인 상태 여부 */
  isOffline: boolean;
  /** 네트워크 상태 */
  status: NetworkStatus;
  /** 연결 유형 (Network Information API 지원 시) */
  type: NetworkType;
  /** 효과적인 연결 유형 (Network Information API 지원 시) */
  effectiveType: NetworkType;
  /** 다운링크 속도 (Mbps) */
  downlink: number | null;
  /** RTT (ms) */
  rtt: number | null;
  /** 데이터 절약 모드 여부 */
  saveData: boolean;
  /** 마지막 상태 변경 시간 */
  timestamp: Date;
}

/**
 * 대기 중인 요청
 */
interface PendingRequest {
  id: string;
  execute: () => Promise<void>;
  maxRetries: number;
  retryCount: number;
  onFailed?: (error: unknown) => void;
  createdAt: Date;
}

// Network Information API 타입 정의
interface NetworkInformation extends EventTarget {
  readonly downlink: number;
  readonly effectiveType: '2g' | '3g' | '4g' | 'slow-2g';
  readonly rtt: number;
  readonly saveData: boolean;
  readonly type?: string;
  onchange?: ((this: NetworkInformation, ev: Event) => void) | null;
}

declare global {
  interface Navigator {
    connection?: NetworkInformation;
    mozConnection?: NetworkInformation;
    webkitConnection?: NetworkInformation;
  }
}

/**
 * 유효한 네트워크 타입인지 확인
 */
function isValidNetworkType(type: string | undefined): type is NetworkType {
  const validTypes: NetworkType[] = ['wifi', '4g', '3g', '2g', 'slow-2g', 'unknown', 'none'];
  return !!type && validTypes.includes(type as NetworkType);
}

/**
 * 기본 네트워크 상태 정보를 생성합니다.
 * 브라우저 환경인 경우 실제 상태를 반영하고, SSR 환경인 경우 기본값을 반환합니다.
 */
const createInitialNetworkInfo = (): NetworkInfo => {
  const isClient = typeof navigator !== 'undefined';
  const isOnline = isClient ? navigator.onLine : true;

  return {
    isOnline,
    isOffline: !isOnline,
    status: isClient
      ? (isOnline ? NetworkStatus.Online : NetworkStatus.Offline)
      : NetworkStatus.Unknown,
    type: 'unknown',
    effectiveType: 'unknown',
    downlink: null,
    rtt: null,
    saveData: false,
    timestamp: new Date(),
  };
};

/**
 * Network Information API 연결 가져오기
 */
function getConnection(): NetworkInformation | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return navigator.connection || navigator.mozConnection || navigator.webkitConnection;
}

/**
 * 네트워크 정보 수집
 */
function getNetworkInfo(): NetworkInfo {
  if (typeof navigator === 'undefined') {
    return createInitialNetworkInfo();
  }

  const isOnline = navigator.onLine;
  const connection = getConnection();

  return {
    isOnline,
    isOffline: !isOnline,
    status: isOnline ? NetworkStatus.Online : NetworkStatus.Offline,
    type: isValidNetworkType(connection?.type) ? connection.type : 'unknown',
    effectiveType: isValidNetworkType(connection?.effectiveType) ? connection.effectiveType : 'unknown',
    downlink: connection?.downlink ?? null,
    rtt: connection?.rtt ?? null,
    saveData: connection?.saveData ?? false,
    timestamp: new Date(),
  };
}

/**
 * 네트워크 상태 Hook 옵션
 */
export interface UseNetworkStatusOptions {
  /** 상태 변경 시 콜백 */
  onChange?: (info: NetworkInfo) => void;
  /** 온라인 복구 시 콜백 */
  onOnline?: () => void;
  /** 오프라인 시 콜백 */
  onOffline?: () => void;
  /** 폴링 간격 (ms) - 0이면 비활성화 */
  pollingInterval?: number;
  /** 온라인 복구 후 요청 처리 지연 시간 (ms) */
  onlineProcessDelay?: number;
}

/**
 * 네트워크 상태 감지 Hook
 */
export function useNetworkStatus(options: UseNetworkStatusOptions = {}) {
  const {
    onChange,
    onOnline,
    onOffline,
    pollingInterval = 0,
    onlineProcessDelay = 500
  } = options;

  const [networkInfo, setNetworkInfo] = useState<NetworkInfo>(createInitialNetworkInfo);
  const [pendingCount, setPendingCount] = useState(0);
  
  const pendingRequestsRef = useRef<PendingRequest[]>([]);
  const previousStatusRef = useRef<NetworkStatus>(
    typeof navigator !== 'undefined'
      ? (navigator.onLine ? NetworkStatus.Online : NetworkStatus.Offline)
      : NetworkStatus.Unknown
  );
  const processTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 대기 중인 요청 처리
  const processPendingRequests = useCallback(async () => {
    if (pendingRequestsRef.current.length === 0) return;

    const requests = [...pendingRequestsRef.current];
    pendingRequestsRef.current = [];
    setPendingCount(0);

    for (const request of requests) {
      try {
        await request.execute();
      } catch (error) {
        if (request.retryCount < request.maxRetries) {
          request.retryCount++;
          pendingRequestsRef.current.push(request);
          setPendingCount(prev => prev + 1);
        } else {
          request.onFailed?.(error);
        }
      }
    }
  }, []);

  // 네트워크 상태 업데이트
  const updateNetworkInfo = useCallback(() => {
    const info = getNetworkInfo();
    setNetworkInfo(info);

    // 상태 변경 감지
    if (previousStatusRef.current !== info.status) {
      // Unknown 상태에서 실제 상태로 바뀌는 첫 마운트 시점에는 onChange를 호출하지 않음
      if (previousStatusRef.current !== NetworkStatus.Unknown) {
        onChange?.(info);
      }

      // 온라인 복구 시
      if (info.status === NetworkStatus.Online && previousStatusRef.current === NetworkStatus.Offline) {
        onOnline?.();
        
        // 네트워크 안정화를 위해 지연 후 대기 요청 처리
        if (processTimerRef.current) clearTimeout(processTimerRef.current);
        processTimerRef.current = setTimeout(() => {
          processPendingRequests();
        }, onlineProcessDelay);
      } 
      // 오프라인 전환 시
      else if (info.status === NetworkStatus.Offline) {
        if (processTimerRef.current) {
          clearTimeout(processTimerRef.current);
          processTimerRef.current = null;
        }
        onOffline?.();
      }

      previousStatusRef.current = info.status;
    }
  }, [onChange, onOnline, onOffline, processPendingRequests, onlineProcessDelay]);

  // 요청 큐에 추가
  const queueRequest = useCallback((
    request: Omit<PendingRequest, 'retryCount' | 'createdAt'>
  ) => {
    const pendingRequest: PendingRequest = {
      ...request,
      maxRetries: request.maxRetries ?? 3,
      retryCount: 0,
      createdAt: new Date(),
    };
    pendingRequestsRef.current.push(pendingRequest);
    setPendingCount(pendingRequestsRef.current.length);
  }, []);

  // 특정 요청 취소
  const cancelPendingRequest = useCallback((requestId: string): boolean => {
    const index = pendingRequestsRef.current.findIndex((r) => r.id === requestId);
    if (index >= 0) {
      pendingRequestsRef.current.splice(index, 1);
      setPendingCount(pendingRequestsRef.current.length);
      return true;
    }
    return false;
  }, []);

  // 모든 대기 중인 요청 취소
  const cancelAllPendingRequests = useCallback(() => {
    pendingRequestsRef.current = [];
    setPendingCount(0);
  }, []);

  // 이벤트 리스너 등록
  useEffect(() => {
    const handleOnline = () => updateNetworkInfo();
    const handleOffline = () => updateNetworkInfo();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const connection = getConnection();
    // addEventListener 지원 여부 확인
    if (connection && typeof connection.addEventListener === 'function') {
      connection.addEventListener('change', updateNetworkInfo);
    }

    let pollingTimer: ReturnType<typeof setInterval> | null = null;
    if (pollingInterval > 0) {
      pollingTimer = setInterval(updateNetworkInfo, pollingInterval);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (connection && typeof connection.removeEventListener === 'function') {
        connection.removeEventListener('change', updateNetworkInfo);
      }
      if (pollingTimer) clearInterval(pollingTimer);
      if (processTimerRef.current) clearTimeout(processTimerRef.current);
    };
  }, [updateNetworkInfo, pollingInterval]);

  return {
    ...networkInfo,
    /** 요청 큐에 추가 (오프라인 시 사용) */
    queueRequest,
    /** 특정 요청 취소 */
    cancelPendingRequest,
    /** 모든 대기 중인 요청 취소 */
    cancelAllPendingRequests,
    /** 대기 중인 요청 개수 (실시간 반영) */
    pendingRequestCount: pendingCount,
    /** 수동으로 상태 새로고침 */
    refresh: updateNetworkInfo,
  };
}

export default useNetworkStatus;