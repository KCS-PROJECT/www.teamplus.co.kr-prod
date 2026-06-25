'use client';

import { useState, useCallback, useId } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import {
  useMyClubId,
  TRAINING_TYPES,
  TRAINING_TYPE_LABELS,
  createTraining,
} from '@/hooks/useTraining';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';

// ─── 공통 input/select 스타일 (ICETIMES — it-fill + 1.5px it-line-strong) ──
const INPUT_BASE =
  'w-full h-12 px-4 bg-it-fill dark:bg-rink-800 border-[1.5px] border-it-line-strong dark:border-rink-700 rounded-w-md text-[15px] font-medium text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-wtext-3 focus:outline-none focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20 transition-colors motion-reduce:transition-none';
const LABEL_BASE =
  'block text-card-body font-semibold text-it-ink-800 dark:text-rink-100 mb-2';

// 훈련 유형 아이콘 매핑
const TYPE_ICON_MAP: Record<string, string> = {
  REGULAR_TRAINING: 'fitness_center',
  GAME: 'sports_hockey',
  FUN: 'emoji_events',
  CAMP: 'hiking',
};

export default function CreateTrainingPage() {
  const { clubId: resolvedClubId } = useMyClubId();
  const { navigate } = useNavigation();

  // @check-usePageReady-audit-B — audit §3 B #2: useMyClubId 는 submit 시에만
  //   필요한 비-blocking fetch. 폼 필드(텍스트 입력)는 clubId 없이 즉시 사용 가능.
  //   audit 권장: "usePageReady(true) 유지". 자동 도구 휴리스틱 C 오탐 회피.
  usePageReady(true);

  // SPEC v2 §3: 모든 화면 status bar + AppBar 네이티브 동기화.
  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle: '훈련 등록',
    showBottomNav: false,
  });

  // ─── Accessibility IDs ────────────────────────────
  const classNameId = useId();
  const descriptionId = useId();
  const instructorNameId = useId();
  const capacityId = useId();
  const ageMinId = useId();
  const ageMaxId = useId();
  const levelRequiredId = useId();
  const startDateId = useId();
  const startTimeId = useId();
  const endTimeId = useId();
  const scheduleDatesId = useId();

  // ─── Form State ───────────────────────────────────
  const [className, setClassName] = useState('');
  const [description, setDescription] = useState('');
  const [trainingType, setTrainingType] = useState<string>('REGULAR_TRAINING');
  const [instructorName, setInstructorName] = useState('');
  const [capacity, setCapacity] = useState('25');
  const [ageMin, setAgeMin] = useState('');
  const [ageMax, setAgeMax] = useState('');
  const [levelRequired, setLevelRequired] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTimeStr, setStartTimeStr] = useState('18:00');
  const [endTimeStr, setEndTimeStr] = useState('20:00');
  const [scheduleDatesStr, setScheduleDatesStr] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const clubId = resolvedClubId ?? '';

  // ─── Cancel ───────────────────────────────────────
  const handleCancel = useCallback(() => {
    navigate('/training-manage');
  }, [navigate]);

  // ─── Submit ───────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    setErrorMsg('');

    // 유효성 검증
    if (!className.trim()) {
      setErrorMsg(MESSAGES.training.nameRequired);
      return;
    }
    if (!trainingType) {
      setErrorMsg(MESSAGES.training.typeRequired);
      return;
    }
    if (!instructorName.trim()) {
      setErrorMsg(MESSAGES.training.coachRequired);
      return;
    }
    if (!capacity || parseInt(capacity, 10) < 1) {
      setErrorMsg(MESSAGES.training.capacityRequired);
      return;
    }
    if (!startDate || !startTimeStr || !endTimeStr) {
      setErrorMsg(MESSAGES.training.timeRequired);
      return;
    }

    const startTime = `${startDate}T${startTimeStr}:00Z`;
    const endTime = `${startDate}T${endTimeStr}:00Z`;

    // 날짜 파싱
    const scheduleDates = scheduleDatesStr
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && /^\d{4}-\d{2}-\d{2}$/.test(s));

    setIsSubmitting(true);

    try {
      const response = await createTraining(clubId, {
        className: className.trim(),
        description: description.trim() || undefined,
        trainingType,
        instructorName: instructorName.trim(),
        capacity: parseInt(capacity, 10),
        ageMin: ageMin ? parseInt(ageMin, 10) : undefined,
        ageMax: ageMax ? parseInt(ageMax, 10) : undefined,
        levelRequired: levelRequired || undefined,
        startTime,
        endTime,
        scheduleDates: scheduleDates.length > 0 ? scheduleDates : undefined,
      });

      if (response.success) {
        navigate('/training-manage');
      } else {
        setErrorMsg(response.error?.message ?? MESSAGES.error.general);
      }
    } catch {
      setErrorMsg(MESSAGES.error.network);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    className, description, trainingType, instructorName, capacity,
    ageMin, ageMax, levelRequired, startDate, startTimeStr, endTimeStr,
    scheduleDatesStr, clubId, navigate,
  ]);

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="훈련 등록" showBack />

      <main className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck px-5 pt-5 pb-keyboard-safe-32 scroll-keyboard-safe space-y-6">
        {/* 에러 메시지 */}
        {errorMsg && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3.5 bg-it-red-50 dark:bg-it-red-700/20 border-[1.5px] border-it-red-200 dark:border-it-red-700 rounded-w-md"
          >
            <Icon name="error" className="text-it-red-500 text-card-title shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-card-body text-it-red-600 dark:text-it-red-300 leading-relaxed">{errorMsg}</p>
          </div>
        )}

        {/* 훈련 유형 선택 */}
        <section>
          <label className={LABEL_BASE}>
            훈련 유형 <span className="text-it-red-500" aria-hidden="true">*</span>
          </label>
          <div
            role="radiogroup"
            aria-label="훈련 유형 선택"
            className="grid grid-cols-3 gap-2.5"
          >
            {TRAINING_TYPES.map((type) => {
              const isSelected = trainingType === type;
              return (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setTrainingType(type)}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1.5 min-h-[76px] p-3 rounded-w-md border-[1.5px] text-card-meta font-semibold transition-colors motion-reduce:transition-none',
                    isSelected
                      ? 'border-it-blue-500 bg-it-blue-50 dark:bg-it-blue-500/10 text-it-blue-500'
                      : 'border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 text-it-ink-600 dark:text-rink-100 hover:border-it-blue-300',
                  )}
                >
                  <Icon
                    name={TYPE_ICON_MAP[type] ?? 'group_add'}
                    className="text-xl"
                    aria-hidden="true"
                  />
                  {TRAINING_TYPE_LABELS[type]}
                </button>
              );
            })}
          </div>
        </section>

        {/* 기본 정보 */}
        <section className="space-y-5">
          <div>
            <label htmlFor={classNameId} className={LABEL_BASE}>
              훈련 이름 <span className="text-it-red-500" aria-hidden="true">*</span>
            </label>
            <input
              id={classNameId}
              type="text"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              placeholder="예: 월요일 정규훈련"
              maxLength={50}
              required
              aria-required="true"
              className={INPUT_BASE}
            />
          </div>

          <div>
            <label htmlFor={descriptionId} className={LABEL_BASE}>
              설명
            </label>
            <textarea
              id={descriptionId}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={MESSAGES.placeholders.enterTrainingIntro}
              maxLength={500}
              rows={3}
              className="w-full px-4 py-3 bg-it-fill dark:bg-rink-800 border-[1.5px] border-it-line-strong dark:border-rink-700 rounded-w-md text-[15px] font-medium text-it-ink-800 dark:text-white placeholder:text-it-ink-400 focus:outline-none focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20 resize-none transition-colors motion-reduce:transition-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={instructorNameId} className={LABEL_BASE}>
                담당 코치 <span className="text-it-red-500" aria-hidden="true">*</span>
              </label>
              <input
                id={instructorNameId}
                type="text"
                value={instructorName}
                onChange={(e) => setInstructorName(e.target.value)}
                placeholder="코치 이름"
                maxLength={30}
                required
                aria-required="true"
                className={INPUT_BASE}
              />
            </div>
            <div>
              <label htmlFor={capacityId} className={LABEL_BASE}>
                최대 인원 <span className="text-it-red-500" aria-hidden="true">*</span>
              </label>
              <input
                id={capacityId}
                type="number"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                min={1}
                max={200}
                placeholder="25"
                required
                aria-required="true"
                className={INPUT_BASE}
              />
            </div>
          </div>
        </section>

        {/* 연령 + 레벨 */}
        <section>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor={ageMinId} className={LABEL_BASE}>
                최소 연령
              </label>
              <input
                id={ageMinId}
                type="number"
                value={ageMin}
                onChange={(e) => setAgeMin(e.target.value)}
                min={0}
                max={100}
                placeholder="0"
                className={INPUT_BASE}
              />
            </div>
            <div>
              <label htmlFor={ageMaxId} className={LABEL_BASE}>
                최대 연령
              </label>
              <input
                id={ageMaxId}
                type="number"
                value={ageMax}
                onChange={(e) => setAgeMax(e.target.value)}
                min={0}
                max={100}
                placeholder="99"
                className={INPUT_BASE}
              />
            </div>
            <div>
              <label htmlFor={levelRequiredId} className={LABEL_BASE}>
                레벨
              </label>
              <select
                id={levelRequiredId}
                value={levelRequired}
                onChange={(e) => setLevelRequired(e.target.value)}
                aria-label="필요 레벨 선택"
                className={INPUT_BASE}
              >
                <option value="">무관</option>
                <option value="beginner">초급</option>
                <option value="intermediate">중급</option>
                <option value="advanced">고급</option>
              </select>
            </div>
          </div>
        </section>

        {/* 날짜 + 시간 */}
        <section>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor={startDateId} className={LABEL_BASE}>
                시작 날짜 <span className="text-it-red-500" aria-hidden="true">*</span>
              </label>
              <input
                id={startDateId}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                aria-required="true"
                aria-label="훈련 시작 날짜 선택"
                className={cn(INPUT_BASE, 'px-3')}
              />
            </div>
            <div>
              <label htmlFor={startTimeId} className={LABEL_BASE}>
                시작 시간 <span className="text-it-red-500" aria-hidden="true">*</span>
              </label>
              <input
                id={startTimeId}
                type="time"
                value={startTimeStr}
                onChange={(e) => setStartTimeStr(e.target.value)}
                required
                aria-required="true"
                aria-label="훈련 시작 시간 선택"
                className={cn(INPUT_BASE, 'px-3')}
              />
            </div>
            <div>
              <label htmlFor={endTimeId} className={LABEL_BASE}>
                종료 시간 <span className="text-it-red-500" aria-hidden="true">*</span>
              </label>
              <input
                id={endTimeId}
                type="time"
                value={endTimeStr}
                onChange={(e) => setEndTimeStr(e.target.value)}
                required
                aria-required="true"
                aria-label="훈련 종료 시간 선택"
                className={cn(INPUT_BASE, 'px-3')}
              />
            </div>
          </div>
        </section>

        {/* 일정 날짜 (일괄 생성) */}
        <section>
          <label htmlFor={scheduleDatesId} className={LABEL_BASE}>
            일괄 일정 생성 <span className="text-card-meta font-normal text-it-ink-500 dark:text-rink-300">(선택)</span>
          </label>
          <input
            id={scheduleDatesId}
            type="text"
            value={scheduleDatesStr}
            onChange={(e) => setScheduleDatesStr(e.target.value)}
            placeholder="2026-04-07, 2026-04-14, 2026-04-21"
            className={INPUT_BASE}
          />
          <p className="flex items-start gap-1.5 text-card-meta text-it-ink-500 dark:text-rink-300 mt-2">
            <Icon name="info" className="text-card-body shrink-0 mt-0.5" aria-hidden="true" />
            <span>쉼표로 구분하여 여러 날짜를 입력하면 일정이 한 번에 생성됩니다. (형식: YYYY-MM-DD)</span>
          </p>
        </section>

        {/* 하단 액션 (body flow 내부 — 고정 X) */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isSubmitting}
            className="flex-1 h-12 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 text-it-ink-800 dark:text-rink-100 text-card-body font-bold hover:bg-it-fill dark:hover:bg-rink-800 disabled:opacity-60 transition-colors motion-reduce:transition-none active:brightness-95"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={cn(
              'h-12 rounded-w-md text-white text-card-body font-bold transition-colors motion-reduce:transition-none',
              isSubmitting
                ? 'bg-it-ink-400 cursor-not-allowed flex-[1.5]'
                : 'bg-it-blue-500 hover:bg-it-blue-600 active:brightness-95 flex-[1.5]',
            )}
          >
            {isSubmitting ? '등록 중...' : '등록하기'}
          </button>
        </div>
      </main>
    </MobileContainer>
  );
}
