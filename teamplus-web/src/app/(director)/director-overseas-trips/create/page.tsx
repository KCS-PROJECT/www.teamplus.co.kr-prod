'use client';

/**
 * /director-overseas-trips/create — 신규 해외 원정 등록
 *
 * API: POST /api/v1/overseas-trips
 *  - CreateOverseasTripDto 기반 (clubId, title, country, city, startDate, endDate,
 *                                registrationDeadline, maxParticipants, ...)
 *  - clubId 는 감독이 관리하는 팀 자동 조회 (GET /teams/managed/list)
 */

import { useCallback, useEffect, useId, useState } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';

const INPUT_BASE =
  'w-full h-12 px-4 bg-white dark:bg-rink-800 border border-wline dark:border-rink-700 rounded-xl text-card-body text-wtext-1 dark:text-white placeholder:text-wtext-3 focus:outline-none focus:border-ice-500 focus:ring-2 focus:ring-ice-500/20 transition-colors motion-reduce:transition-none';
const LABEL_BASE =
  'block text-card-body font-semibold text-wtext-2 dark:text-rink-100 mb-2';

export default function CreateOverseasTripPage() {
  const { navigate } = useNavigation();

  usePageReady(true);

  // [수정 2026-05-13 D17] 폼 페이지 입력 중 PTR 발화 차단 — Phase 3-D 신규 옵션 활용.
  //   AppBar 는 Web `<PageAppBar forceNative />` 단독 사용 (showAppBar:false).
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
    pullToRefreshEnabled: false,
  });

  const titleId = useId();
  const countryId = useId();
  const cityId = useId();
  const descriptionId = useId();
  const startDateId = useId();
  const endDateId = useId();
  const deadlineId = useId();
  const maxParticipantsId = useId();
  const ageGroupId = useId();
  const estimatedCostId = useId();
  const depositAmountId = useId();
  const contactPhoneId = useId();
  const contactEmailId = useId();

  // 감독이 관리하는 첫 번째 팀 자동 선택
  const [clubId, setClubId] = useState<string>('');
  const [clubName, setClubName] = useState<string>('');

  const [title, setTitle] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [registrationDeadline, setRegistrationDeadline] = useState('');
  const [maxParticipants, setMaxParticipants] = useState('25');
  const [ageGroup, setAgeGroup] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<Array<{ id: string; clubName: string }>>('/teams/managed/list');
        if (res.success && res.data?.[0]) {
          setClubId(res.data[0].id);
          setClubName(res.data[0].clubName ?? '');
        }
      } catch {
        // 무시 — 제출 시 clubId 누락 에러로 안내
      }
    })();
  }, []);

  const handleCancel = useCallback(() => {
    navigate('/director-overseas-trips');
  }, [navigate]);

  const handleSubmit = useCallback(async () => {
    setErrorMsg('');

    if (!clubId) {
      setErrorMsg('관리 중인 팀 정보를 불러올 수 없습니다.');
      return;
    }
    if (!title.trim()) {
      setErrorMsg('원정 이름을 입력해주세요.');
      return;
    }
    if (!country.trim()) {
      setErrorMsg('국가를 입력해주세요.');
      return;
    }
    if (!city.trim()) {
      setErrorMsg('도시를 입력해주세요.');
      return;
    }
    if (!startDate || !endDate) {
      setErrorMsg('원정 시작/종료일을 입력해주세요.');
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setErrorMsg('종료일은 시작일보다 빠를 수 없습니다.');
      return;
    }
    if (!registrationDeadline) {
      setErrorMsg('참가 등록 마감일을 입력해주세요.');
      return;
    }
    if (new Date(registrationDeadline) > new Date(startDate)) {
      setErrorMsg('등록 마감일은 원정 시작일 이전이어야 합니다.');
      return;
    }
    const maxPart = parseInt(maxParticipants, 10);
    if (!Number.isFinite(maxPart) || maxPart < 1) {
      setErrorMsg('최대 참가 인원을 올바르게 입력해주세요.');
      return;
    }

    // Date → ISO
    const toIso = (date: string) => new Date(`${date}T00:00:00`).toISOString();

    setIsSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        clubId,
        title: title.trim(),
        country: country.trim(),
        city: city.trim(),
        startDate: toIso(startDate),
        endDate: toIso(endDate),
        registrationDeadline: toIso(registrationDeadline),
        maxParticipants: maxPart,
      };
      if (description.trim()) body.description = description.trim();
      if (ageGroup.trim()) body.ageGroup = ageGroup.trim();
      if (estimatedCost.trim()) body.estimatedCost = estimatedCost.trim();
      if (depositAmount.trim()) body.depositAmount = depositAmount.trim();
      if (contactPhone.trim()) body.contactPhone = contactPhone.trim();
      if (contactEmail.trim()) body.contactEmail = contactEmail.trim();

      const response = await api.post('/overseas-trips', body);
      if (response.success) {
        navigate('/director-overseas-trips');
      } else {
        setErrorMsg(response.error?.message ?? MESSAGES.error.general);
      }
    } catch {
      setErrorMsg(MESSAGES.error.network);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    clubId,
    title,
    country,
    city,
    description,
    startDate,
    endDate,
    registrationDeadline,
    maxParticipants,
    ageGroup,
    estimatedCost,
    depositAmount,
    contactPhone,
    contactEmail,
    navigate,
  ]);

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="원정 등록" showBack forceNative />

      <main className="flex-1 overflow-y-auto px-5 pt-5 pb-8 space-y-6" role="main" aria-label="해외 원정 등록">
        {/* 소속 팀 안내 */}
        {clubName && (
          <div className="flex items-center gap-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 px-3.5 py-2.5">
            <Icon name="sports_hockey" className="text-ice-500 dark:text-blue-300 text-card-title shrink-0" aria-hidden="true" />
            <p className="text-card-meta text-ice-500 dark:text-blue-300">
              <span className="font-semibold">{clubName}</span> 소속으로 등록됩니다.
            </p>
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl"
          >
            <Icon name="error" className="text-red-500 text-card-title shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-card-body text-red-700 dark:text-red-300 leading-relaxed">{errorMsg}</p>
          </div>
        )}

        {/* 기본 정보 */}
        <section className="space-y-5">
          <div>
            <label htmlFor={titleId} className={LABEL_BASE}>
              원정 이름 <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <input
              id={titleId}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 2026 동계 일본 원정"
              maxLength={200}
              required
              aria-required="true"
              className={INPUT_BASE}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={countryId} className={LABEL_BASE}>
                국가 <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <input
                id={countryId}
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="예: 일본"
                maxLength={100}
                required
                aria-required="true"
                className={INPUT_BASE}
              />
            </div>
            <div>
              <label htmlFor={cityId} className={LABEL_BASE}>
                도시 <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <input
                id={cityId}
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="예: 삿포로"
                maxLength={100}
                required
                aria-required="true"
                className={INPUT_BASE}
              />
            </div>
          </div>

          <div>
            <label htmlFor={descriptionId} className={LABEL_BASE}>
              설명
            </label>
            <textarea
              id={descriptionId}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="원정 목적과 주요 일정 요약"
              rows={3}
              className="w-full px-4 py-3 bg-white dark:bg-rink-800 border border-wline dark:border-rink-700 rounded-xl text-card-body text-wtext-1 dark:text-white placeholder:text-wtext-3 focus:outline-none focus:border-ice-500 focus:ring-2 focus:ring-ice-500/20 resize-none transition-colors motion-reduce:transition-none"
            />
          </div>
        </section>

        {/* 일정
            [수정 2026-05-26 A6] type="date" 의 native chrome(iOS WKWebView intrinsic ~200px+)는
              MobileContainer 셸 폭이 항상 ≤448px(--mobile-shell-max-width 고정)이므로
              2열 분기 시 셀당 ~198px 로 좁아져 시작일/종료일 박스가 겹치는 회귀가
              태블릿을 포함한 모든 디바이스에서 재발 가능했다.
              → 화면 폭과 무관하게 항상 1열 세로 스택으로 통일해 겹침을 원천 차단.
              · grid-cols-1 단일 분기 — 고정 px 미사용(SCREEN_METRICS 규칙 준수).
              · 각 wrapper w-full min-w-0 + input block max-w-full box-border → date native chrome
                intrinsic min-content 가 부모 컨테이너 폭을 침범하는 회귀 차단.
              · 등록 마감일도 별도 row 로 명확히 분리 → 하단 인원/연령 section 과 시각적
                그루핑 혼동(영역 침범) 방지. */}
        <section className="space-y-3" aria-label="원정 일정">
          <div className="grid grid-cols-1 gap-3 min-w-0">
            <div className="w-full min-w-0">
              <label htmlFor={startDateId} className={LABEL_BASE}>
                시작일 <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <input
                id={startDateId}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                aria-required="true"
                className={cn(INPUT_BASE, 'block px-3 min-w-0 max-w-full box-border')}
              />
            </div>
            <div className="w-full min-w-0">
              <label htmlFor={endDateId} className={LABEL_BASE}>
                종료일 <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <input
                id={endDateId}
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                aria-required="true"
                className={cn(INPUT_BASE, 'block px-3 min-w-0 max-w-full box-border')}
              />
            </div>
          </div>
          <div className="w-full min-w-0">
            <label htmlFor={deadlineId} className={LABEL_BASE}>
              등록 마감일 <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <input
              id={deadlineId}
              type="date"
              value={registrationDeadline}
              onChange={(e) => setRegistrationDeadline(e.target.value)}
              required
              aria-required="true"
              className={cn(INPUT_BASE, 'block px-3 min-w-0 max-w-full box-border')}
            />
          </div>
        </section>

        {/* 인원 / 연령
            [수정 2026-05-14 D5] App 좁은 폭에서 input intrinsic 너비가 grid 컬럼을 벗어나
              "참가 연령 영역" 외곽선을 침범하는 회귀 차단 — wrapper min-w-0 + input max-w-full. */}
        <section aria-label="참가 인원 및 연령">
          <div className="grid grid-cols-2 gap-3 min-w-0">
            <div className="min-w-0">
              <label htmlFor={maxParticipantsId} className={LABEL_BASE}>
                최대 인원 <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <input
                id={maxParticipantsId}
                type="number"
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(e.target.value)}
                min={1}
                max={999}
                placeholder="25"
                required
                aria-required="true"
                className={cn(INPUT_BASE, 'min-w-0 max-w-full box-border')}
              />
            </div>
            <div className="min-w-0">
              <label htmlFor={ageGroupId} className={LABEL_BASE}>
                연령대
              </label>
              <input
                id={ageGroupId}
                type="text"
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value)}
                placeholder="예: U-12"
                maxLength={100}
                className={cn(INPUT_BASE, 'min-w-0 max-w-full box-border')}
              />
            </div>
          </div>
        </section>

        {/* 비용 */}
        <section>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={estimatedCostId} className={LABEL_BASE}>
                예상 비용 (원)
              </label>
              <input
                id={estimatedCostId}
                type="number"
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
                min={0}
                inputMode="numeric"
                placeholder="1500000"
                className={cn(INPUT_BASE, 'tabular-nums')}
              />
            </div>
            <div>
              <label htmlFor={depositAmountId} className={LABEL_BASE}>
                예치금 (원)
              </label>
              <input
                id={depositAmountId}
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                min={0}
                inputMode="numeric"
                placeholder="300000"
                className={cn(INPUT_BASE, 'tabular-nums')}
              />
            </div>
          </div>
        </section>

        {/* 연락처 */}
        <section>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={contactPhoneId} className={LABEL_BASE}>
                연락처
              </label>
              <input
                id={contactPhoneId}
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="010-0000-0000"
                maxLength={20}
                className={INPUT_BASE}
              />
            </div>
            <div>
              <label htmlFor={contactEmailId} className={LABEL_BASE}>
                이메일
              </label>
              <input
                id={contactEmailId}
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="overseas@teamplus.com"
                className={INPUT_BASE}
              />
            </div>
          </div>
        </section>

        {/* 하단 액션 */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isSubmitting}
            className="flex-1 h-12 rounded-xl border border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100 text-card-body font-semibold hover:bg-wbg dark:hover:bg-rink-800 disabled:opacity-60 transition-colors motion-reduce:transition-none"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={cn(
              'h-12 rounded-xl text-white text-card-body font-semibold transition-colors motion-reduce:transition-none',
              isSubmitting
                ? 'bg-wtext-4 cursor-not-allowed flex-[1.5]'
                : 'bg-ice-500 hover:bg-ice-700 active:brightness-95 flex-[1.5]',
            )}
          >
            {isSubmitting ? '등록 중...' : '등록하기'}
          </button>
        </div>
      </main>
    </MobileContainer>
  );
}
