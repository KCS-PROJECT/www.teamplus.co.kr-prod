/**
 * DateTime Service (Admin)
 *
 * Backend: src/datetime/datetime.controller.ts
 * Web/App 와 동일한 시그니처. 공통 훅 useDateTime 이 사용한다.
 */

import { api } from './api-client';

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
    return api.get<DateTimeData>(`/datetime${buildQuery(baseDate)}`);
  },

  async getYear(baseDate?: string): Promise<string> {
    const data = await api.get<{ year: string }>(`/datetime/year${buildQuery(baseDate)}`);
    return data.year;
  },

  async getMonth(baseDate?: string): Promise<string> {
    const data = await api.get<{ month: string }>(`/datetime/month${buildQuery(baseDate)}`);
    return data.month;
  },

  async getDate(baseDate?: string): Promise<string> {
    const data = await api.get<{ date: string }>(`/datetime/date${buildQuery(baseDate)}`);
    return data.date;
  },

  async getDateTime(baseDate?: string): Promise<string> {
    const data = await api.get<{ dateTime: string }>(`/datetime/datetime${buildQuery(baseDate)}`);
    return data.dateTime;
  },

  async getDateTimeSecond(baseDate?: string): Promise<string> {
    const data = await api.get<{ dateTimeSecond: string }>(
      `/datetime/datetime-second${buildQuery(baseDate)}`,
    );
    return data.dateTimeSecond;
  },

  async getDateTimeMillisecond(baseDate?: string): Promise<string> {
    const data = await api.get<{ dateTimeMillisecond: string }>(
      `/datetime/datetime-millisecond${buildQuery(baseDate)}`,
    );
    return data.dateTimeMillisecond;
  },

  async getWeeklyDates(baseDate?: string): Promise<string[]> {
    const data = await api.get<{ weeklyDates: string[] }>(`/datetime/weekly${buildQuery(baseDate)}`);
    return data.weeklyDates;
  },

  async getMonthlyDates(baseDate?: string): Promise<string[]> {
    const data = await api.get<{ monthlyDates: string[] }>(`/datetime/monthly${buildQuery(baseDate)}`);
    return data.monthlyDates;
  },
};

export default datetimeService;
