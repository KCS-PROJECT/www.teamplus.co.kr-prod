'use client';

import { useState, useCallback, useRef } from 'react';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';

export type CheckinState = 'idle' | 'scanning' | 'checking' | 'success' | 'error';

export interface CheckinResult {
  id: string;
  memberId: string;
  scheduleId: string;
  className: string;
  attendanceStatus: string;
  checkedInAt: string;
  creditDeducted: boolean;
  proxyCheckIn: boolean;
}

export interface CheckinError {
  code:
    | 'ALREADY_CHECKED_IN'
    | 'EXPIRED'
    | 'REUSED'
    | 'INSUFFICIENT_CREDIT'
    | 'NOT_REGISTERED'
    | 'NETWORK'
    | 'UNKNOWN';
  message: string;
}

interface UseQrCheckinReturn {
  state: CheckinState;
  result: CheckinResult | null;
  error: CheckinError | null;
  /**
   * @param qrData 스캔한 QR(UUID v4)
   * @param childId 지정 시 학부모 대리 체크인 (백엔드가 ParentChild 검증 후 proxyCheckIn).
   *   미지정 시 본인 기준 체크인 (학생 QR 스캔 — 기존 동작).
   */
  checkIn: (qrData: string, childId?: string) => Promise<void>;
  reset: () => void;
}

/**
 * QR 출석 체크인 훅
 *
 * - UUID v4 형식 검증 후에만 API 호출 (조용히 무시)
 * - 동일 코드 연속 스캔 차단 (lastScannedRef)
 * - in-flight 요청 중복 차단 (inFlightRef)
 * - Backend {success, data} 응답 래퍼 자동 흡수
 * - 에러 분류: Backend errorCode 필드 우선 → 한국어 메시지 문자열 매칭 폴백 이중 전략
 */
export function useQrCheckin(): UseQrCheckinReturn {
  const [state, setState] = useState<CheckinState>('idle');
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [error, setError] = useState<CheckinError | null>(null);
  const lastScannedRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  const checkIn = useCallback(async (qrData: string, childId?: string) => {
    // UUID v4 정규식 검증 — 유효하지 않은 스캔은 조용히 무시
    const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidV4.test(qrData)) return;

    // 중복 스캔 · 동시 요청 차단
    if (qrData === lastScannedRef.current) return;
    if (inFlightRef.current) return;
    lastScannedRef.current = qrData;
    inFlightRef.current = true;

    setState('checking');
    setError(null);

    try {
      type Payload = CheckinResult;
      const res = await api.post<Payload | { success: boolean; data: Payload }>(
        '/attendance/check-in',
        // childId 지정 시 학부모 대리 체크인. 미지정 시 본인 기준(기존 동작).
        childId ? { qrData, childId } : { qrData },
      );

      // 응답 래퍼 흡수: attendance.controller 가 {success, data} 래퍼를 씌우는 케이스 대응
      const payload: Payload | undefined =
        res.data && typeof res.data === 'object' && 'id' in (res.data as object)
          ? (res.data as Payload)
          : (res.data as { data?: Payload } | undefined)?.data;

      if (res.success && payload?.id) {
        setResult(payload);
        setState('success');
      } else {
        // 에러 분류: Backend errorCode 필드 우선 → 한국어 메시지 폴백 매칭
        // Backend가 errorCode 를 표준화하지 않은 레거시 응답도 흡수하기 위한 이중 전략
        const serverCode = res.error?.code ?? '';
        const msg = res.error?.message ?? '';
        let code: CheckinError['code'] = 'UNKNOWN';
        let message: string = MESSAGES.error.general;
        if (serverCode === 'ALREADY_CHECKED_IN' || msg.includes('이미 출석')) {
          code = 'ALREADY_CHECKED_IN';
          message = MESSAGES.qrScan.alreadyCheckedIn;
        } else if (serverCode === 'QR_EXPIRED' || msg.includes('만료')) {
          code = 'EXPIRED';
          message = MESSAGES.qrScan.expired;
        } else if (serverCode === 'QR_ALREADY_SCANNED' || msg.includes('이미 사용된')) {
          code = 'REUSED';
          message = MESSAGES.qrScan.reused;
        } else if (serverCode === 'INSUFFICIENT_CREDIT' || msg.includes('결제권')) {
          code = 'INSUFFICIENT_CREDIT';
          message = MESSAGES.qrScan.insufficientCredit;
        } else if (serverCode === 'NOT_REGISTERED' || msg.includes('수강 등록')) {
          // Backend 403 ForbiddenException("해당 수업에 수강 등록되지 않았습니다...")
          // 해당 자녀가 이 수업에 등록되어 있지 않음 — 재스캔해도 동일 결과
          code = 'NOT_REGISTERED';
          message = MESSAGES.qrScan.notRegistered;
        } else if (serverCode === 'NETWORK_ERROR') {
          code = 'NETWORK';
          message = MESSAGES.qrScan.networkError;
        }
        setError({ code, message });
        setState('error');
      }
    } catch {
      setError({ code: 'NETWORK', message: MESSAGES.qrScan.networkError });
      setState('error');
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const reset = useCallback(() => {
    setState('idle');
    setResult(null);
    setError(null);
    lastScannedRef.current = null;
    inFlightRef.current = false;
  }, []);

  return { state, result, error, checkIn, reset };
}
