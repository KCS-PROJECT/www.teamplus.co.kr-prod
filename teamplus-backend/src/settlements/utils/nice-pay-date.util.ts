import { BadRequestException } from "@nestjs/common";
import { dateOnlyToString, nowKstParts } from "@/common/utils/kst-date.util";

/** 나이스 지급 요청·취소 마감 — 지급일(영업일) 당일 오전 10:30(KST), 자정부터 센 분. */
export const PAY_CUTOFF_MINUTES = 10 * 60 + 30;
const MAX_DAYS_AHEAD = 31;
const DAY_MS = 24 * 60 * 60 * 1000;

function invalid(message: string): BadRequestException {
  return new BadRequestException({
    message,
    errorCode: "PAYOUT_DATE_INVALID",
  });
}

/**
 * 나이스 지급 엑셀의 지급일 검증 — KST 기준 오늘 이후(오늘이면 10:30 전), 평일, 한 달 이내.
 * 공휴일은 판정하지 않는다(나이스가 거절한다). 통과하면 나이스 양식의 "YYYYMMDD" 를 돌려준다.
 */
export function assertNicePayDate(payDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payDate)) {
    throw invalid("지급일은 YYYY-MM-DD 형식이어야 합니다.");
  }
  const target = new Date(`${payDate}T00:00:00Z`);
  if (
    Number.isNaN(target.getTime()) ||
    target.toISOString().slice(0, 10) !== payDate
  ) {
    throw invalid("존재하지 않는 날짜입니다.");
  }

  const now = nowKstParts();
  const today = `${now.year}-${now.month}-${now.day}`;
  if (payDate < today) {
    throw invalid("지급일은 오늘 이후여야 합니다.");
  }
  if (
    payDate === today &&
    Number(now.hour) * 60 + Number(now.minute) >= PAY_CUTOFF_MINUTES
  ) {
    throw invalid(
      "오늘 지급 요청은 오전 10시 30분에 마감되었습니다. 다음 영업일을 선택해주세요.",
    );
  }
  const weekday = target.getUTCDay();
  if (weekday === 0 || weekday === 6) {
    throw invalid("주말은 지급일로 선택할 수 없습니다.");
  }
  const todayUtc = new Date(`${today}T00:00:00Z`);
  if (target.getTime() - todayUtc.getTime() > MAX_DAYS_AHEAD * DAY_MS) {
    throw invalid(`지급일은 오늘부터 ${MAX_DAYS_AHEAD}일 이내여야 합니다.`);
  }
  return payDate.replace(/-/g, "");
}

/**
 * 지급일(@db.Date, KST 달력일의 UTC 자정)이 아직 나이스 마감 전인지 — 미래 지급일이면 참, 당일이면 10:30 전만 참.
 * 지급 취소 가능 여부의 단일 판정이다(서버 검사와 목록의 cancelable 이 같이 쓴다).
 */
export function isBeforePayCutoff(
  settlementDate: Date,
  now: ReturnType<typeof nowKstParts> = nowKstParts(),
): boolean {
  const payDate = dateOnlyToString(settlementDate);
  const today = `${now.year}-${now.month}-${now.day}`;
  if (payDate !== today) return payDate > today;
  return Number(now.hour) * 60 + Number(now.minute) < PAY_CUTOFF_MINUTES;
}
