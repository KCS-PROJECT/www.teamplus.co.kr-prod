'use client';

/**
 * MatchEditSheet — 매치 수정 BottomSheet
 *
 * 등록된 매치 카드의 "수정하기" 버튼에서 열린다.
 * - 폼 prefill: 부모가 넘긴 Match (date/time/location/fee)
 * - 저장: PATCH /matches/:id — 프론트 필드를 백엔드 계약(scheduledAt/rinkName/price)으로 매핑
 * - 성공 시 onSaved(updated) 로 부모 목록 갱신.
 */

import { useEffect, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { DatePickerModal, formatDateLabel } from '@/components/ui/DatePickerModal';
import { TimePicker } from '@/components/ui/TimePicker';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import type { Match } from '@/app/(admin)/match-manage/page';

const LEVEL_OPTIONS = ['입문', '초급', '중급', '상급'] as const;

/** 'YYYY.MM.DD' → 'YYYY-MM-DD' */
function toIsoDate(d: string): string {
  return d.replace(/\./g, '-');
}

/** 'YYYY-MM-DD' + 'HH:MM' → ISO datetime (백엔드 scheduledAt) */
function combineDateTime(date: string, time: string): string | null {
  if (!date || !time) return null;
  const dt = new Date(`${date}T${time}:00`);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

export function MatchEditSheet({
  isOpen,
  onClose,
  match,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  match: Match | null;
  onSaved: (updated: Match) => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(''); // 'YYYY-MM-DD'
  const [time, setTime] = useState(''); // 'HH:MM'
  const [location, setLocation] = useState('');
  const [maxParticipants, setMaxParticipants] = useState('');
  const [fee, setFee] = useState('');
  const [level, setLevel] = useState('');
  const [description, setDescription] = useState('');
  const [isDateOpen, setIsDateOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!match) return;
    setTitle(match.title ?? '');
    setDate(match.date ? toIsoDate(match.date) : '');
    setTime(match.time ?? '');
    setLocation(match.location ?? '');
    setMaxParticipants(String(match.maxParticipants ?? ''));
    setFee(String(match.fee ?? ''));
    setLevel(match.level ?? '');
    setDescription(match.description ?? '');
  }, [match]);

  const handleSave = async () => {
    if (!match) return;
    if (!title.trim()) {
      toast.error(MESSAGES.match.titleRequired);
      return;
    }
    setIsSaving(true);
    try {
      const scheduledAt = combineDateTime(date, time);
      const res = await api.patch(`/matches/${match.id}`, {
        title: title.trim(),
        ...(scheduledAt ? { scheduledAt } : {}),
        rinkName: location.trim(),
        maxParticipants: Number(maxParticipants) || match.maxParticipants,
        price: Number(fee) || 0,
        level,
        description: description.trim() || undefined,
      });
      if (res.success) {
        toast.success(MESSAGES.match.updated);
        onSaved({
          ...match,
          title: title.trim(),
          date: date.replace(/-/g, '.'),
          time,
          location: location.trim(),
          maxParticipants: Number(maxParticipants) || match.maxParticipants,
          fee: Number(fee) || 0,
          level,
          description: description.trim() || undefined,
        });
        onClose();
      } else {
        toast.error(res.error?.message ?? MESSAGES.save.error);
      }
    } catch {
      toast.error(MESSAGES.save.error);
    } finally {
      setIsSaving(false);
    }
  };

  const labelCls = 'text-card-body font-medium text-wtext-3 dark:text-rink-300';
  const inputCls =
    'w-full h-12 px-4 rounded-xl border border-wline dark:border-rink-700 focus:border-ice-500 focus:ring-1 focus:ring-ice-500 bg-wbg dark:bg-rink-700 text-card-body';

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="매치 수정"
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 rounded-xl bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 font-bold text-card-emphasis hover:bg-wline dark:hover:bg-rink-500 transition-colors motion-reduce:transition-none active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex-[2] h-12 rounded-xl bg-ice-500 hover:bg-ice-700 text-white font-bold text-card-emphasis shadow-md transition-colors motion-reduce:transition-none active:brightness-95 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500"
          >
            수정하기
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {/* 제목 */}
        <div className="flex flex-col gap-2">
          <span className={labelCls}>매치 제목</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={`${inputCls} placeholder:text-wtext-3`}
            placeholder="예: 주말 오전 친선 경기"
          />
        </div>

        {/* 일자 / 시간 */}
        <div className="flex gap-2">
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <span className={labelCls}>일자</span>
            <button
              type="button"
              onClick={() => setIsDateOpen(true)}
              aria-haspopup="dialog"
              aria-label="매치 일자 선택"
              className="h-12 w-full rounded-[12px] bg-wbg dark:bg-rink-700 border border-wline dark:border-rink-700 px-3 flex items-center gap-2 text-left transition-colors motion-reduce:transition-none hover:border-ice-500 focus-visible:outline-none focus-visible:border-ice-500"
            >
              <Icon name="calendar_today" size={18} className="text-wtext-3 dark:text-rink-300 shrink-0" aria-hidden="true" />
              <span className={`flex-1 min-w-0 text-card-meta font-semibold tabular-nums truncate ${date ? 'text-wtext-1 dark:text-white' : 'text-wtext-3 dark:text-rink-300'}`}>
                {date ? formatDateLabel(date) : 'YYYY.MM.DD'}
              </span>
            </button>
            <DatePickerModal
              isOpen={isDateOpen}
              value={date}
              onClose={() => setIsDateOpen(false)}
              onSelect={(iso) => setDate(iso)}
              ariaLabel="매치 일자 선택"
            />
          </div>
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <span className={labelCls}>시간</span>
            <TimePicker
              value={time}
              onChange={setTime}
              placeholder="시간"
              sheetTitle="시작 시간을 선택해주세요."
              showChevron={false}
              className="px-3 gap-2 bg-wbg dark:bg-rink-700"
            />
          </div>
        </div>

        {/* 구장 */}
        <div className="flex flex-col gap-2">
          <span className={labelCls}>구장</span>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={`${inputCls} placeholder:text-wtext-3`}
            placeholder="링크장 이름"
          />
        </div>

        {/* 인원 / 참가비 */}
        <div className="flex gap-3">
          <div className="flex flex-col gap-2 w-1/3">
            <span className={labelCls}>모집 인원</span>
            <div className="relative flex items-center">
              <input
                type="number"
                min={1}
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(e.target.value)}
                className={`${inputCls} pr-8 text-center font-semibold`}
                aria-label="모집 인원"
              />
              <span className="absolute right-3 text-card-meta text-wtext-3 font-medium">명</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 flex-1">
            <span className={labelCls}>참가비 (1인)</span>
            <div className="relative flex items-center">
              <input
                type="number"
                min={0}
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                className={`${inputCls} pr-8 text-right font-semibold`}
                aria-label="1인당 참가비"
              />
              <span className="absolute right-3 text-card-meta text-wtext-3 font-medium">원</span>
            </div>
          </div>
        </div>

        {/* 실력 레벨 */}
        <div className="flex flex-col gap-2">
          <span className={labelCls}>실력 레벨 제한</span>
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="실력 레벨 선택">
            {LEVEL_OPTIONS.map((lv) => {
              const active = level === lv;
              return (
                <button
                  key={lv}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setLevel(lv)}
                  className={`min-h-11 px-2 py-2 rounded-lg text-card-body font-bold text-center transition-colors motion-reduce:transition-none border active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 ${
                    active
                      ? 'bg-ice-500 text-white shadow-sm border-ice-500'
                      : 'bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 border-transparent hover:bg-wline dark:hover:bg-rink-500'
                  }`}
                >
                  {lv}
                </button>
              );
            })}
          </div>
        </div>

        {/* 안내 사항 */}
        <div className="flex flex-col gap-2">
          <span className={labelCls}>안내 사항 (옵션)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 rounded-xl border border-wline dark:border-rink-700 focus:border-ice-500 focus:ring-1 focus:ring-ice-500 bg-wbg dark:bg-rink-700 text-card-body resize-none placeholder:text-wtext-3"
            placeholder="주차 정보, 준비물 등 참가자에게 알릴 내용을 입력하세요."
          />
        </div>
      </div>
    </BottomSheet>
  );
}

export default MatchEditSheet;
