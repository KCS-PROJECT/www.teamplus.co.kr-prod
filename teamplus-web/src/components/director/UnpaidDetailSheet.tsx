'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import {
  getTeamUnpaidMemberDetail,
  type UnpaidDetailLine,
  type UnpaidMemberDetailResponse,
} from '@/services/payment';

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('ko-KR').format(n);
}

interface UnpaidDetailSheetProps {
  isOpen: boolean;
  /** 상세를 조회할 미납 회원(자녀) ID. null 이면 시트 비활성. */
  memberId: string | null;
  /** 선택 월 — 인별 미수금과 동일 월 스코프로 상세 조회. */
  yearMonth: string;
  /** 목록에서 이미 아는 기본 정보 — 조회 전 헤더 즉시 표시용 */
  fallbackName?: string;
  fallbackAmount?: number;
  onClose: () => void;
}

/** 미납 라인 부제 — 결제방식 · 팀 · 출석 회수(후불 확정 시) 조합. */
function detailLineSubtitle(line: UnpaidDetailLine): string {
  const parts: string[] = [
    line.billingTiming === 'POSTPAID'
      ? MESSAGES.settlement.billingPostpaid
      : MESSAGES.settlement.billingPrepaid,
  ];
  if (line.teamName) parts.push(line.teamName);
  if (typeof line.attendanceCount === 'number') {
    parts.push(MESSAGES.settlement.detailAttendanceCount(line.attendanceCount));
  }
  return parts.join(' · ');
}

/**
 * UnpaidDetailSheet — 미수금 회원 상세 바텀시트.
 * 보호자 연락처(전화걸기/문자) + source(수업/대회)별 미납 내역을 표시한다.
 */
export function UnpaidDetailSheet({
  isOpen,
  memberId,
  yearMonth,
  fallbackName,
  fallbackAmount,
  onClose,
}: UnpaidDetailSheetProps) {
  const [detail, setDetail] = useState<UnpaidMemberDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  // 요청 시퀀스 — 회원/월 전환·재시도 시 늦게 도착한 이전 응답이 최신 상세를 덮는 race 차단.
  // 진입 시 1 증가시켜 주입하고, await 이후 최신 seq 와 다르면 폐기(금융 상세 오염 방지).
  const reqSeq = useRef(0);

  // 금융 화면 — 신규 상세는 실패 시 throw(scope 밖·미납 0건이면 404). 여기서 흡수해 에러 표기.
  const load = useCallback(async (id: string, ym: string) => {
    const seq = ++reqSeq.current;
    setIsLoading(true);
    setHasError(false);
    try {
      const data = await getTeamUnpaidMemberDetail({ memberId: id, yearMonth: ym });
      if (seq !== reqSeq.current) return; // 폐기 — 더 최신 상세 요청이 진행 중
      setDetail(data);
    } catch {
      if (seq !== reqSeq.current) return; // 폐기 — 늦은 실패가 최신 성공을 덮지 않음
      setHasError(true);
    } finally {
      if (seq === reqSeq.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && memberId) {
      setDetail(null);
      load(memberId, yearMonth);
    } else {
      // 시트 닫힘·멤버 없음 — in-flight 응답 무효화(닫은 뒤 늦은 응답이 state 오염 금지).
      reqSeq.current++;
    }
  }, [isOpen, memberId, yearMonth, load]);

  const name = detail?.member.name ?? fallbackName ?? MESSAGES.settlement.detailMemberLabel;
  const totalAmount = detail?.member.totalOutstanding ?? fallbackAmount ?? 0;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={MESSAGES.settlement.detailSheetTitle}>
      {/* 회원 + 총 미납액 */}
      <div className="flex items-center justify-between border-b border-it-line pb-4 dark:border-rink-700">
        <div className="min-w-0">
          <p className="text-[12px] text-it-ink-500 dark:text-wtext-4">
            {MESSAGES.settlement.detailMemberLabel}
          </p>
          <p className="mt-0.5 truncate text-[16px] font-bold text-it-ink-800 dark:text-white">
            {name}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[12px] text-it-ink-500 dark:text-wtext-4">
            {MESSAGES.settlement.detailTotalUnpaid}
          </p>
          <p className="mt-0.5 text-[18px] font-extrabold text-it-red-600 tabular-nums">
            {formatCurrency(totalAmount)}
            <span className="ml-0.5 text-[12px] font-medium">{MESSAGES.settlement.won}</span>
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10" role="status" aria-live="polite">
          <Icon name="progress_activity" className="animate-spin text-2xl text-it-blue-500" aria-hidden="true" />
        </div>
      ) : hasError ? (
        <div className="py-10 text-center">
          <p className="text-[14px] text-it-ink-500 dark:text-wtext-4">
            {MESSAGES.director2.unpaidDetailFailed}
          </p>
          {memberId && (
            <button
              type="button"
              onClick={() => load(memberId, yearMonth)}
              className="mt-3 text-[13px] font-bold text-it-blue-600"
            >
              {MESSAGES.settlement.detailRetry}
            </button>
          )}
        </div>
      ) : (
        <>
          {/* 보호자 연락처 */}
          <section className="py-4">
            <h3 className="mb-2.5 text-[13px] font-bold text-it-ink-700 dark:text-wtext-4">
              {MESSAGES.settlement.detailParentsTitle}
            </h3>
            {detail && detail.parents.length > 0 ? (
              <ul className="space-y-2">
                {detail.parents.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-w-lg bg-it-fill px-3.5 py-3 dark:bg-rink-700/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[14.5px] font-bold text-it-ink-800 dark:text-white">
                        {p.name}
                      </p>
                      <p className="text-[12.5px] text-it-ink-500 tabular-nums dark:text-wtext-4">
                        {p.phone ?? MESSAGES.settlement.detailNoPhone}
                      </p>
                    </div>
                    {p.phone && (
                      <div className="flex shrink-0 gap-1.5">
                        <a
                          href={`tel:${p.phone}`}
                          aria-label={MESSAGES.settlement.detailCallAria(p.name)}
                          className="flex size-9 items-center justify-center rounded-w-pill bg-it-blue-500 text-white active:brightness-95"
                        >
                          <Icon name="call" className="text-[18px]" aria-hidden="true" />
                        </a>
                        <a
                          href={`sms:${p.phone}`}
                          aria-label={MESSAGES.settlement.detailSmsAria(p.name)}
                          className="flex size-9 items-center justify-center rounded-w-pill border-[1.5px] border-it-line-strong text-it-blue-600 active:brightness-95 dark:border-rink-700 dark:text-wtext-4"
                        >
                          <Icon name="chat_bubble" className="text-[17px]" aria-hidden="true" />
                        </a>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-it-ink-500 dark:text-wtext-4">
                {MESSAGES.settlement.detailNoParents}
              </p>
            )}
          </section>

          {/* 미납 내역 — source(수업/대회)별 */}
          <section className="border-t border-it-line py-4 dark:border-rink-700">
            <h3 className="mb-2.5 text-[13px] font-bold text-it-ink-700 dark:text-wtext-4">
              {MESSAGES.settlement.detailUnpaidTitle}
            </h3>
            <ul className="space-y-2.5">
              {detail?.details.map((d, i) => (
                <li key={`${d.sourceType}-${d.sourceId}-${i}`} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={
                          d.sourceType === 'TOURNAMENT'
                            ? 'inline-flex items-center rounded-w-sm bg-sun-100 px-1.5 py-0.5 text-[10.5px] font-bold text-it-ink-800 dark:bg-sun-500/15 dark:text-sun-500'
                            : 'inline-flex items-center rounded-w-sm bg-it-blue-50 px-1.5 py-0.5 text-[10.5px] font-bold text-it-blue-600 dark:bg-it-blue-900/30 dark:text-it-blue-300'
                        }
                      >
                        {d.sourceType === 'TOURNAMENT'
                          ? MESSAGES.settlement.sourceTournament
                          : MESSAGES.settlement.sourceClass}
                      </span>
                      <p className="truncate text-[14px] font-semibold text-it-ink-800 dark:text-white">
                        {d.sourceName}
                      </p>
                    </div>
                    <p className="mt-0.5 text-[12px] text-it-ink-500 dark:text-wtext-4">
                      {detailLineSubtitle(d)}
                    </p>
                  </div>
                  <p className="shrink-0 text-[14px] font-bold text-it-red-600 tabular-nums">
                    {formatCurrency(d.amount)}
                    <span className="ml-0.5 text-[11.5px] font-medium">{MESSAGES.settlement.won}</span>
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </BottomSheet>
  );
}

export default UnpaidDetailSheet;
