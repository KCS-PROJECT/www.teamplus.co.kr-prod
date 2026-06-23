/**
 * DateTime Service
 *
 * Backend: src/datetime/datetime.controller.ts
 *   - GET /api/v1/datetime                       (통합 8개 포맷)
 *   - GET /api/v1/datetime/year                  (yyyy)
 *   - GET /api/v1/datetime/month                 (yyyyMM)
 *   - GET /api/v1/datetime/date                  (yyyyMMdd)
 *   - GET /api/v1/datetime/datetime              (yyyyMMddHHmm)
 *   - GET /api/v1/datetime/datetime-second       (yyyyMMddHHmmss)
 *   - GET /api/v1/datetime/datetime-millisecond  (yyyyMMddHHmmssSSSS)
 *   - GET /api/v1/datetime/weekly                (월요일 기준 7일)
 *   - GET /api/v1/datetime/monthly               (해당 월 1일~말일)
 *
 * baseDate (YYYYMMDD) 미지정 시 호출 시점의 오늘.
 */

import { api } from '@/services/api-client';

export interface DateTimeData {
  year: string;
  month: string;
  date: string;
  dateTime: string;
  dateTimeSecond: string;
  dateTimeMillisecond: string;
  weeklyDates: string[];
  monthlyDates: string[];
  baseDate: string;
  isCustomBase: boolean;
  timezone: string;
}

function buildQuery(baseDate?: string): string {
  if (!baseDate) return '';
  return `?baseDate=${encodeURIComponent(baseDate)}`;
}

export const datetimeService = {
  /** 통합 8개 포맷 한 번에 조회 (공통 훅이 사용) */
  async getAll(baseDate?: string): Promise<DateTimeData> {
    const res = await api.get<DateTimeData>(`/datetime${buildQuery(baseDate)}`);
    if (!res.success || !res.data) {
      throw new Error(res.error?.message ?? '날짜 정보를 불러오지 못했습니다.');
    }
    return res.data;
  },

  async getYear(baseDate?: string): Promise<string> {
    const res = await api.get<{ year: string }>(`/datetime/year${buildQuery(baseDate)}`);
    if (!res.success || !res.data) throw new Error(res.error?.message ?? '년도 조회 실패');
    return res.data.year;
  },

  async getMonth(baseDate?: string): Promise<string> {
    const res = await api.get<{ month: string }>(`/datetime/month${buildQuery(baseDate)}`);
    if (!res.success || !res.data) throw new Error(res.error?.message ?? '월 조회 실패');
    return res.data.month;
  },

  async getDate(baseDate?: string): Promise<string> {
    const res = await api.get<{ date: string }>(`/datetime/date${buildQuery(baseDate)}`);
    if (!res.success || !res.data) throw new Error(res.error?.message ?? '날짜 조회 실패');
    return res.data.date;
  },

  async getDateTime(baseDate?: string): Promise<string> {
    const res = await api.get<{ dateTime: string }>(`/datetime/datetime${buildQuery(baseDate)}`);
    if (!res.success || !res.data) throw new Error(res.error?.message ?? '날짜시간 조회 실패');
    return res.data.dateTime;
  },

  async getDateTimeSecond(baseDate?: string): Promise<string> {
    const res = await api.get<{ dateTimeSecond: string }>(
      `/datetime/datetime-second${buildQuery(baseDate)}`,
    );
    if (!res.success || !res.data) throw new Error(res.error?.message ?? '초 조회 실패');
    return res.data.dateTimeSecond;
  },

  async getDateTimeMillisecond(baseDate?: string): Promise<string> {
    const res = await api.get<{ dateTimeMillisecond: string }>(
      `/datetime/datetime-millisecond${buildQuery(baseDate)}`,
    );
    if (!res.success || !res.data) throw new Error(res.error?.message ?? '밀리초 조회 실패');
    return res.data.dateTimeMillisecond;
  },

  async getWeeklyDates(baseDate?: string): Promise<string[]> {
    const res = await api.get<{ weeklyDates: string[] }>(`/datetime/weekly${buildQuery(baseDate)}`);
    if (!res.success || !res.data) throw new Error(res.error?.message ?? '주간 조회 실패');
    return res.data.weeklyDates;
  },

  async getMonthlyDates(baseDate?: string): Promise<string[]> {
    const res = await api.get<{ monthlyDates: string[] }>(`/datetime/monthly${buildQuery(baseDate)}`);
    if (!res.success || !res.data) throw new Error(res.error?.message ?? '월간 조회 실패');
    return res.data.monthlyDates;
  },
};

export default datetimeService;
