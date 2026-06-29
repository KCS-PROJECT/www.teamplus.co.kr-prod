'use client';

import { useCallback, useEffect, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import {
  getDirectorUnpaidMemberDetail,
  type DirectorUnpaidMemberDetail,
} from '@/services/payment';

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('ko-KR').format(n);
}

interface UnpaidDetailSheetProps {
  isOpen: boolean;
  /** 상세를 조회할 미납 회원(자녀) ID. null 이면 시트 비활성. */
  memberId: string | null;
  /** 목록에서 이미 아는 기본 정보 — 조회 전 헤더 즉시 표시용 */
  fallbackName?: string;
  fallbackAmount?: number;
  onClose: () => void;
}

/**
 * UnpaidDetailSheet — 미수금 회원 상세 바텀시트.
 * 보호자 연락처(전화걸기/문자) + 미납 내역(선불/후불)을 표시한다.
 */
export function UnpaidDetailSheet({
  isOpen,
  memberId,
  fallbackName,
  fallbackAmount,
  onClose,
}: UnpaidDetailSheetProps) {
  const [detail, setDetail] = useState<DirectorUnpaidMemberDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const load = useCallback(async (id: string) => {
    setIsLoading(true);
    setHasError(false);
    try {
      const res = await getDirectorUnpaidMemberDetail(id);
      if (res.success && res.data) {
        setDetail(res.data);
      } else {
        setHasError(true);
      }
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && memberId) {
      setDetail(null);
      load(memberId);
    }
  }, [isOpen, memberId, load]);

  const name = detail?.member.name ?? fallbackName ?? '회원';
  const totalAmount = detail?.member.totalAmount ?? fallbackAmount ?? 0;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="미수금 상세">
      {/* 회원 + 총 미납액 */}
      <div className="flex items-center justify-between border-b border-it-line pb-4 dark:border-rink-700">
        <div className="min-w-0">
          <p className="text-[12px] text-it-ink-500 dark:text-wtext-4">회원</p>
          <p className="mt-0.5 truncate text-[16px] font-bold text-it-ink-800 dark:text-white">
            {name}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[12px] text-it-ink-500 dark:text-wtext-4">총 미납액</p>
          <p className="mt-0.5 text-[18px] font-extrabold text-it-red-600 tabular-nums">
            {formatCurrency(totalAmount)}
            <span className="ml-0.5 text-[12px] font-medium">원</span>
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
              onClick={() => load(memberId)}
              className="mt-3 text-[13px] font-bold text-it-blue-600"
            >
              다시 시도
            </button>
          )}
        </div>
      ) : (
        <>
          {/* 보호자 연락처 */}
          <section className="py-4">
            <h3 className="mb-2.5 text-[13px] font-bold text-it-ink-700 dark:text-wtext-4">
              보호자 연락처
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
                        {p.phone ?? '연락처 없음'}
                      </p>
                    </div>
                    {p.phone && (
                      <div className="flex shrink-0 gap-1.5">
                        <a
                          href={`tel:${p.phone}`}
                          aria-label={`${p.name} 전화 걸기`}
                          className="flex size-9 items-center justify-center rounded-w-pill bg-it-blue-500 text-white active:brightness-95"
                        >
                          <Icon name="call" className="text-[18px]" aria-hidden="true" />
                        </a>
                        <a
                          href={`sms:${p.phone}`}
                          aria-label={`${p.name} 문자 보내기`}
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
                연결된 보호자가 없습니다.
              </p>
            )}
          </section>

          {/* 미납 내역 */}
          <section className="border-t border-it-line py-4 dark:border-rink-700">
            <h3 className="mb-2.5 text-[13px] font-bold text-it-ink-700 dark:text-wtext-4">
              미납 내역
            </h3>
            <ul className="space-y-2.5">
              {detail?.details.map((d, i) => (
                <li key={`${d.className}-${i}`} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-it-ink-800 dark:text-white">
                      {d.className}
                    </p>
                    <p className="mt-0.5 text-[12px] text-it-ink-500 dark:text-wtext-4">
                      {d.type === 'POSTPAID'
                        ? `후결제${d.yearMonth ? ` · ${d.yearMonth}` : ''}${
                            typeof d.attendanceCount === 'number'
                              ? ` · 출석 ${d.attendanceCount}회`
                              : ''
                          }`
                        : '선결제'}
                    </p>
                  </div>
                  <p className="shrink-0 text-[14px] font-bold text-it-red-600 tabular-nums">
                    {formatCurrency(d.amount)}
                    <span className="ml-0.5 text-[11.5px] font-medium">원</span>
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
