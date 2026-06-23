'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/services/api-client';

interface TodaySchedule {
  scheduleId: string;
  className: string;
  startTime: string;
  classId: string;
}

interface QrState {
  qrData: string;
  expiresAt: Date;
  className: string;
}

interface AttendanceStatus {
  current: number;
  total: number;
  percentage: number;
}

interface UseQrGenerateReturn {
  schedules: TodaySchedule[];
  selectedSchedule: TodaySchedule | null;
  selectSchedule: (schedule: TodaySchedule) => void;
  qr: QrState | null;
  generateQr: () => Promise<void>;
  refreshQr: () => Promise<void>;
  timeRemaining: number;
  isExpired: boolean;
  attendance: AttendanceStatus;
  isLoadingSchedules: boolean;
  isGenerating: boolean;
  error: string | null;
}

export function useQrGenerate(): UseQrGenerateReturn {
  const [schedules, setSchedules] = useState<TodaySchedule[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<TodaySchedule | null>(null);
  const [qr, setQr] = useState<QrState | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isExpired, setIsExpired] = useState(false);
  const [attendance, setAttendance] = useState<AttendanceStatus>({ current: 0, total: 0, percentage: 0 });
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 오늘 날짜 문자열 (YYYY-MM-DD)
  const today = new Date().toISOString().split('T')[0];

  // 오늘 수업 목록 조회
  const fetchTodaySchedules = useCallback(async () => {
    setIsLoadingSchedules(true);
    setError(null);
    try {
      // 1. 코치가 관리하는 팀 목록
      // 백엔드는 배열을 직접 반환하지만, 방어적으로 { clubs } / { data } 래퍼도 허용
      const clubsRes = await api.get<
        { id: string }[] | { clubs?: { id: string }[]; data?: { id: string }[] }
      >('/teams/managed/list');
      const clubs = Array.isArray(clubsRes.data)
        ? clubsRes.data
        : clubsRes.data?.clubs || clubsRes.data?.data || [];
      if (clubs.length === 0) {
        setSchedules([]);
        setIsLoadingSchedules(false);
        return;
      }

      const allSchedules: TodaySchedule[] = [];

      for (const club of clubs) {
        // 2. 팀별 수업 목록
        const classesRes = await api.get<
          | { id: string; className: string; startTime?: string }[]
          | { classes?: { id: string; className: string; startTime?: string }[]; data?: { id: string; className: string; startTime?: string }[] }
        >(`/teams/${club.id}/classes`);
        const classes = Array.isArray(classesRes.data)
          ? classesRes.data
          : classesRes.data?.classes || classesRes.data?.data || [];
        if (classes.length === 0) continue;

        // 3. 각 수업의 오늘 일정
        const schedulePromises = classes.map(async (cls) => {
          try {
            const schedRes = await api.get<
              | { id: string; scheduledDate: string; startTime?: string }[]
              | { schedules?: { id: string; scheduledDate: string; startTime?: string }[]; data?: { id: string; scheduledDate: string; startTime?: string }[] }
            >(
              `/teams/${club.id}/classes/${cls.id}/schedules`,
              { params: { startDate: today, endDate: today } }
            );
            const scheds = Array.isArray(schedRes.data)
              ? schedRes.data
              : schedRes.data?.schedules || schedRes.data?.data || [];
            return scheds.map((s) => ({
              scheduleId: s.id,
              className: cls.className,
              startTime: s.startTime || cls.startTime || '',
              classId: cls.id,
            }));
          } catch {
            return [];
          }
        });

        const results = await Promise.all(schedulePromises);
        allSchedules.push(...results.flat());
      }

      // startTime 기준 정렬
      const sortedSchedules = [...allSchedules].sort((a, b) => a.startTime.localeCompare(b.startTime));
      setSchedules(sortedSchedules);

      // 수업이 1개뿐이면 자동 선택
      if (allSchedules.length === 1) {
        setSelectedSchedule(allSchedules[0]);
      }
    } catch {
      setError('수업 목록을 불러오는데 실패했습니다.');
    } finally {
      setIsLoadingSchedules(false);
    }
  }, [today]);

  // QR 생성
  const generateQr = useCallback(async () => {
    if (!selectedSchedule) return;
    setIsGenerating(true);
    setError(null);
    try {
      type QrPayload = { qrData: string; expiresAt: string; className: string };
      // attendance.controller.ts 는 `{ success, data }` 래퍼를 씌우지만 타 컨트롤러는 없음 → 양쪽 수용
      const res = await api.post<QrPayload | { success: boolean; data: QrPayload }>(
        '/attendance/qr-generate',
        { scheduleId: selectedSchedule.scheduleId }
      );
      const payload: QrPayload | undefined =
        res.data && typeof res.data === 'object' && 'qrData' in res.data
          ? (res.data as QrPayload)
          : (res.data as { data?: QrPayload } | undefined)?.data;
      if (res.success && payload?.qrData) {
        const expiresAt = new Date(payload.expiresAt);
        setQr({
          qrData: payload.qrData,
          expiresAt,
          className: payload.className,
        });
        setIsExpired(false);
      } else {
        setError(res.error?.message || 'QR 코드 생성에 실패했습니다.');
      }
    } catch {
      setError('QR 코드 생성에 실패했습니다.');
    } finally {
      setIsGenerating(false);
    }
  }, [selectedSchedule]);

  // QR 재생성
  const refreshQr = useCallback(async () => {
    await generateQr();
  }, [generateQr]);

  // 수업 선택 (사용자가 다시 선택하면 이전 에러를 리셋해 재시도 가능)
  const selectSchedule = useCallback((schedule: TodaySchedule) => {
    setSelectedSchedule(schedule);
    setQr(null);
    setError(null);
    setIsExpired(false);
    setTimeRemaining(0);
    setAttendance({ current: 0, total: 0, percentage: 0 });
  }, []);

  // 카운트다운 타이머 (서버 expiresAt 기준)
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!qr) return;

    const tick = () => {
      const remaining = Math.floor((qr.expiresAt.getTime() - Date.now()) / 1000);
      if (remaining <= 0) {
        setTimeRemaining(0);
        setIsExpired(true);
        if (timerRef.current) clearInterval(timerRef.current);
        if (pollingRef.current) clearInterval(pollingRef.current);
      } else {
        setTimeRemaining(remaining);
      }
    };

    tick();
    timerRef.current = setInterval(tick, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [qr]);

  // 출석 현황 폴링 (10초)
  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (!selectedSchedule || !qr || isExpired) return;

    const poll = async () => {
      try {
        const res = await api.get<{ present: number; total: number; presentRate: string }>(
          `/attendance/schedule/${selectedSchedule.scheduleId}`
        );
        if (res.success && res.data) {
          setAttendance({
            current: res.data.present,
            total: res.data.total,
            percentage: parseFloat(res.data.presentRate) || 0,
          });
        }
      } catch {
        // 폴링 실패 시 무시
      }
    };

    poll();
    pollingRef.current = setInterval(poll, 10000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [selectedSchedule, qr, isExpired]);

  // visibilitychange 시 타이머 보정
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && qr) {
        const remaining = Math.floor((qr.expiresAt.getTime() - Date.now()) / 1000);
        if (remaining <= 0) {
          setTimeRemaining(0);
          setIsExpired(true);
        } else {
          setTimeRemaining(remaining);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [qr]);

  // 마운트 시 수업 목록 조회
  useEffect(() => {
    fetchTodaySchedules();
  }, [fetchTodaySchedules]);

  // 정리
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  return {
    schedules,
    selectedSchedule,
    selectSchedule,
    qr,
    generateQr,
    refreshQr,
    timeRemaining,
    isExpired,
    attendance,
    isLoadingSchedules,
    isGenerating,
    error,
  };
}
