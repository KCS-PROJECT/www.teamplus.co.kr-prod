import { MESSAGES } from '@/lib/messages';

// payoutScheduledDate 는 "YYYY-MM-DD" 달력일 — Date 로 파싱하지 않고 숫자로 쪼개 월·일만 쓴다.
export function formatPayoutScheduled(value?: string | null): string {
  const m = value ? /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value) : null;
  if (!m) return '';
  return MESSAGES.settlements.payoutScheduledLabel(Number(m[2]), Number(m[3]));
}
