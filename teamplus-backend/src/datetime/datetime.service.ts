import { BadRequestException, Injectable } from "@nestjs/common";
import {
  DateTimeResponse,
  GetDateTimeQueryDto,
} from "./dto/datetime-query.dto";

/**
 * 날짜/시간 포맷팅 서비스 (Asia/Seoul 기준)
 *
 * - baseDate 미지정 시 호출 시점의 오늘
 * - baseDate 지정 시 해당 날짜 + 호출 시점의 시/분/초/밀리초
 *   (시간 정보는 항상 "지금" 시각을 사용 — Web/Admin/App 공통 패턴)
 */
@Injectable()
export class DateTimeService {
  /**
   * baseDate 파싱 → 기준 Date 객체 반환
   * 서버 TZ 가 Asia/Seoul 임을 가정 (teamplus-backend 표준 환경)
   */
  private resolveBase(baseDate?: string): { ref: Date; isCustom: boolean } {
    const now = new Date();
    if (!baseDate) {
      return { ref: now, isCustom: false };
    }

    if (!/^\d{8}$/.test(baseDate)) {
      throw new BadRequestException(
        "baseDate 는 YYYYMMDD 형식의 8자리 숫자여야 합니다.",
      );
    }

    const year = parseInt(baseDate.slice(0, 4), 10);
    const month = parseInt(baseDate.slice(4, 6), 10);
    const day = parseInt(baseDate.slice(6, 8), 10);

    if (
      Number.isNaN(year) ||
      Number.isNaN(month) ||
      Number.isNaN(day) ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31
    ) {
      throw new BadRequestException(
        `유효하지 않은 baseDate 입니다: ${baseDate}`,
      );
    }

    // baseDate 날짜 + 현재 시각/분/초/밀리초
    const ref = new Date(
      year,
      month - 1,
      day,
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds(),
    );

    // 윤년/말일 검증 (예: 0231 → 0303 으로 자동 보정되는 것 차단)
    if (
      ref.getFullYear() !== year ||
      ref.getMonth() !== month - 1 ||
      ref.getDate() !== day
    ) {
      throw new BadRequestException(`존재하지 않는 날짜입니다: ${baseDate}`);
    }

    return { ref, isCustom: true };
  }

  private pad(n: number, len = 2): string {
    return String(n).padStart(len, "0");
  }

  /**
   * 통합 조회 — 8개 포맷 한 번에 반환 (캐시 친화적, 단일 round-trip)
   */
  getAll(query: GetDateTimeQueryDto): DateTimeResponse {
    const { ref, isCustom } = this.resolveBase(query.baseDate);

    const yyyy = String(ref.getFullYear());
    const MM = this.pad(ref.getMonth() + 1);
    const dd = this.pad(ref.getDate());
    const HH = this.pad(ref.getHours());
    const mm = this.pad(ref.getMinutes());
    const ss = this.pad(ref.getSeconds());
    const SSSS = this.pad(ref.getMilliseconds(), 4); // 4자리 밀리세컨드 (예: 205 → "0205")

    return {
      year: yyyy,
      month: `${yyyy}${MM}`,
      date: `${yyyy}${MM}${dd}`,
      dateTime: `${yyyy}${MM}${dd}${HH}${mm}`,
      dateTimeSecond: `${yyyy}${MM}${dd}${HH}${mm}${ss}`,
      dateTimeMillisecond: `${yyyy}${MM}${dd}${HH}${mm}${ss}${SSSS}`,
      weeklyDates: this.getWeeklyDates(ref),
      monthlyDates: this.getMonthlyDates(ref),
      baseDate: `${yyyy}${MM}${dd}`,
      isCustomBase: isCustom,
      timezone: "Asia/Seoul",
    };
  }

  /**
   * 월요일 기준 그 주의 7일 (월~일)
   * 예: 2026-04-19(일) → ["13","14","15","16","17","18","19"]
   */
  private getWeeklyDates(ref: Date): string[] {
    const dayOfWeek = ref.getDay(); // 0=일, 1=월, ..., 6=토
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const monday = new Date(
      ref.getFullYear(),
      ref.getMonth(),
      ref.getDate() + diffToMonday,
    );

    const result: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(
        monday.getFullYear(),
        monday.getMonth(),
        monday.getDate() + i,
      );
      result.push(this.pad(d.getDate()));
    }
    return result;
  }

  /**
   * 해당 월의 1일 ~ 말일까지 ["01", "02", ..., "30"|"31"|"28"|"29"]
   */
  private getMonthlyDates(ref: Date): string[] {
    const lastDay = new Date(
      ref.getFullYear(),
      ref.getMonth() + 1,
      0,
    ).getDate();
    const result: string[] = [];
    for (let i = 1; i <= lastDay; i++) {
      result.push(this.pad(i));
    }
    return result;
  }
}
