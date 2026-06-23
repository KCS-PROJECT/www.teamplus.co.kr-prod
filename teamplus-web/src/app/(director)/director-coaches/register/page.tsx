'use client';

import { useState, useCallback, type FormEvent, type ChangeEvent } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useNavigation } from '@/components/ui/NavLink';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { api } from '@/services/api-client';
import { checkEmailExists } from '@/services/auth';
import { openShareSheet } from '@/lib/share';
import { MESSAGES } from '@/lib/messages';
import { emitRefresh, REFRESH_KEYS } from '@/lib/refresh-bus';

// 아이디 규칙 — 백엔드 create-coach DTO @Matches 와 동일. 영문 소문자 시작, 영소문자·숫자·_, 4~20자.
const ID_REGEX = /^[a-z][a-z0-9_]{3,19}$/;
const ID_RULE_MESSAGE =
  '아이디는 영문 소문자로 시작하고, 영문 소문자·숫자·언더스코어(_)를 사용해 4~20자로 입력해주세요.';

/** 입력 필드 공통 스타일 — h-12 (48px) 터치 타겟 */
const INPUT_CLASS =
  'w-full h-12 rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-700 px-4 text-card-body text-wtext-1 dark:text-white placeholder:text-wtext-3 dark:placeholder:text-wtext-3 outline-none transition-colors motion-reduce:transition-none focus:border-ice-500 focus:ring-2 focus:ring-ice-500/20';

export default function DirectorCoachRegisterPage() {
  // 인증/권한 체크는 (director)/layout.tsx 에서 단 한 번 수행됨 (중복 호출 금지)
  const { replace, back } = useNavigation();
  const { toast } = useToast();

  usePageReady(true); // 정적 폼 — 마운트 즉시 ready

  // 폼 페이지 입력 중 PTR(Pull-to-Refresh) 발화 차단 (입력값 유실 방지).
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
    pullToRefreshEnabled: false,
  });

  /* ── 폼 상태 ── */
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  // 팀 내 직책 — 코치(기본) | 단장(MANAGER). 단장도 코치와 동일 권한, 표기만 다름.
  const [roleInTeam, setRoleInTeam] = useState<'COACH' | 'MANAGER'>('COACH');
  const [showPassword, setShowPassword] = useState(false);
  // 아이디 중복확인 상태 — 'available' 일 때만 생성 가능.
  const [idStatus, setIdStatus] = useState<'idle' | 'available' | 'duplicate'>('idle');
  const [isCheckingId, setIsCheckingId] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  // 생성 완료 후 자격증명(아이디/비번) — 완료 화면 표시·전달용.
  const [createdCreds, setCreatedCreds] = useState<{ loginId: string; password: string } | null>(null);

  /** 전화번호 자동 포맷 (010-0000-0000) */
  const handlePhoneChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 11);
    let formatted = raw;
    if (raw.length > 3 && raw.length <= 7) {
      formatted = `${raw.slice(0, 3)}-${raw.slice(3)}`;
    } else if (raw.length > 7) {
      formatted = `${raw.slice(0, 3)}-${raw.slice(3, 7)}-${raw.slice(7)}`;
    }
    setPhone(formatted);
  }, []);

  /** 아이디 변경 — 입력이 바뀌면 직전 중복확인 결과를 무효화한다. */
  const handleLoginIdChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setLoginId(e.target.value);
    setIdStatus('idle');
    setErrorMessage('');
  }, []);

  /** 아이디 중복 확인 — 백엔드 checkEmailExists(아이디=계정 식별자) 재사용. */
  const handleCheckId = useCallback(async () => {
    const id = loginId.trim();
    if (!ID_REGEX.test(id)) {
      setErrorMessage(ID_RULE_MESSAGE);
      return;
    }
    setIsCheckingId(true);
    try {
      const res = await checkEmailExists(id);
      if (res.success && res.data?.exists) {
        setIdStatus('duplicate');
        setErrorMessage('이미 사용 중인 아이디입니다.');
      } else if (res.success) {
        setIdStatus('available');
        setErrorMessage('');
      } else {
        setErrorMessage(res.error?.message ?? '중복 확인에 실패했습니다.');
      }
    } catch {
      setErrorMessage('중복 확인에 실패했습니다.');
    } finally {
      setIsCheckingId(false);
    }
  }, [loginId]);

  /** 제출 가능 여부 — 아이디 중복확인(available) 통과를 필수로 강제. */
  const isValid =
    name.trim().length > 0 &&
    phone.replace(/-/g, '').length >= 10 &&
    ID_REGEX.test(loginId.trim()) &&
    idStatus === 'available' &&
    password.length >= 8;

  /** 폼 제출 — 코치 계정 생성. */
  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (isSubmitting) return;
      // 중복확인 미통과 시 생성 차단 (사용자 요구: 아이디 중복체크 후 생성).
      if (idStatus !== 'available') {
        setErrorMessage('아이디 중복 확인이 필요합니다.');
        return;
      }
      if (!isValid) return;

      setIsSubmitting(true);
      setErrorMessage('');
      try {
        const payload = {
          name: name.trim(),
          phone: phone.replace(/-/g, ''),
          loginId: loginId.trim(),
          password,
          roleInTeam,
        };
        const res = await api.post('/admin/coaches', payload);

        if (res.success) {
          // 목록(감독·관리자 화면) 캐시 무효화.
          emitRefresh(REFRESH_KEYS.COACHES);
          emitRefresh(['admin', 'coaches']);
          // 완료 화면으로 전환 — 아이디/비번 전달.
          setCreatedCreds({ loginId: loginId.trim(), password });
        } else {
          const msg = res.error?.message || MESSAGES.save.error;
          setErrorMessage(msg);
          // 서버측 아이디 중복(409) → 중복 상태로 갱신해 재확인 유도.
          if (msg.includes('아이디')) setIdStatus('duplicate');
        }
      } catch {
        setErrorMessage(MESSAGES.save.error);
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting, idStatus, isValid, name, phone, loginId, password, roleInTeam],
  );

  /** 아이디·비밀번호 클립보드 복사. */
  const handleCopy = useCallback(async () => {
    if (!createdCreds) return;
    const text = MESSAGES.coach.created.shareText(createdCreds.loginId, createdCreds.password);
    try {
      await navigator.clipboard.writeText(text);
      toast.success(MESSAGES.coach.created.copied);
    } catch {
      toast.error(MESSAGES.error.general);
    }
  }, [createdCreds, toast]);

  /** 카카오 등 공유 시트로 아이디·비밀번호 전달. */
  const handleShare = useCallback(() => {
    if (!createdCreds) return;
    openShareSheet({
      title: MESSAGES.coach.created.title,
      text: MESSAGES.coach.created.shareText(createdCreds.loginId, createdCreds.password),
    });
  }, [createdCreds]);

  /* ──────────────────────────────────────────────
   * 완료 화면 — 생성된 아이디/비밀번호 전달.
   * ────────────────────────────────────────────── */
  if (createdCreds) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar
          title="코치 등록 완료"
          onBack={() => replace('/director-coaches')}
          forceNative
        />
        <main className="flex-1 overflow-y-auto hide-scrollbar" role="main" aria-label="코치 등록 완료">
          <div className="px-6 pt-8 pb-4 flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-w-pill bg-ice-500/10 dark:bg-ice-500/20">
              <Icon name="check_circle" className="text-4xl text-ice-500" aria-hidden="true" />
            </div>
            <h2 className="mt-4 text-2xl font-bold text-wtext-1 dark:text-white">
              {MESSAGES.coach.created.title}
            </h2>
            <p className="mt-2 text-card-body text-wtext-3 dark:text-rink-300">
              {MESSAGES.coach.created.guide}
            </p>
          </div>

          {/* 자격증명 카드 */}
          <div className="mx-6 mb-4 rounded-2xl bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 p-5 shadow-sm">
            <div className="flex items-center justify-between py-2">
              <span className="text-card-meta font-bold text-wtext-3 dark:text-rink-300">
                {MESSAGES.coach.created.idLabel}
              </span>
              <span className="text-card-title font-bold text-wtext-1 dark:text-white tabular-nums break-all">
                {createdCreds.loginId}
              </span>
            </div>
            <div className="h-px bg-wline-2 dark:bg-rink-700 my-1" />
            <div className="flex items-center justify-between py-2">
              <span className="text-card-meta font-bold text-wtext-3 dark:text-rink-300">
                {MESSAGES.coach.created.pwLabel}
              </span>
              <span className="text-card-title font-bold text-wtext-1 dark:text-white tabular-nums break-all">
                {createdCreds.password}
              </span>
            </div>
          </div>

          {/* 비밀번호 변경 안내 */}
          <div className="mx-6 mb-6 flex items-start gap-2.5 rounded-xl bg-wline-2/60 dark:bg-rink-700/40 p-4">
            <Icon name="info" className="text-wtext-3 dark:text-rink-300 text-xl shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-card-meta text-wtext-2 dark:text-rink-200 leading-relaxed">
              {MESSAGES.coach.created.changePwNotice}
            </p>
          </div>

          {/* 전달 버튼 */}
          <div className="mx-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={handleShare}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-ice-500 py-3.5 text-card-emphasis font-bold text-white shadow-sm transition-colors motion-reduce:transition-none hover:bg-ice-700 active:brightness-95"
            >
              <Icon name="share" className="text-[20px]" aria-hidden="true" />
              <span>{MESSAGES.coach.created.share}</span>
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 py-3.5 text-card-emphasis font-bold text-wtext-2 dark:text-rink-100 transition-colors motion-reduce:transition-none hover:bg-wbg dark:hover:bg-rink-700 active:brightness-95"
            >
              <Icon name="content_copy" className="text-[20px]" aria-hidden="true" />
              <span>{MESSAGES.coach.created.copy}</span>
            </button>
            <button
              type="button"
              onClick={() => replace('/director-coaches')}
              className="flex min-h-[48px] items-center justify-center rounded-xl py-3.5 text-card-emphasis font-bold text-wtext-3 dark:text-rink-300 transition-colors motion-reduce:transition-none hover:bg-wbg dark:hover:bg-rink-800 active:brightness-95"
            >
              {MESSAGES.coach.created.goList}
            </button>
          </div>

          <div className="h-24" aria-hidden="true" />
        </main>
      </MobileContainer>
    );
  }

  /* ──────────────────────────────────────────────
   * 등록 폼
   * ────────────────────────────────────────────── */
  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="코치 등록" onBack={back} forceNative />

      <main className="flex-1 overflow-y-auto hide-scrollbar" role="main" aria-label="코치 등록">
        {/* 타이틀 영역 */}
        <div className="px-6 pt-6 pb-4">
          <h2 className="text-2xl font-bold text-wtext-1 dark:text-white">코치 등록</h2>
          <p className="mt-1 text-card-body text-wtext-3 dark:text-rink-300">
            {MESSAGES.coach.registerDescription}
          </p>
        </div>

        {/* 에러 배너 */}
        {errorMessage && (
          <div className="mx-6 mb-4 flex items-center gap-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 p-4" role="alert">
            <Icon name="error" className="text-red-500 dark:text-red-400 text-xl shrink-0" aria-hidden="true" />
            <p className="text-card-body text-red-600 dark:text-red-400">{errorMessage}</p>
          </div>
        )}

        {/* 폼 카드 */}
        <form onSubmit={handleSubmit} className="mx-6 mb-8">
          <div className="rounded-2xl bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 p-6 shadow-sm">

            {/* 직책 — 코치 / 단장. 단장도 코치와 동일 권한, 표기만 다름. */}
            <div className="mb-5">
              <label className="mb-2 block text-card-body font-bold text-wtext-1 dark:text-white">
                직책 <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="직책 선택">
                {([['COACH', '코치'], ['MANAGER', '단장']] as const).map(([value, label]) => {
                  const selected = roleInTeam === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRoleInTeam(value)}
                      aria-pressed={selected}
                      className={`min-h-[48px] rounded-xl border text-card-emphasis font-bold transition-colors motion-reduce:transition-none ${
                        selected
                          ? 'border-ice-500 bg-ice-500/5 dark:bg-ice-500/10 text-ice-500'
                          : 'border-wline dark:border-rink-700 bg-white dark:bg-rink-700 text-wtext-2 dark:text-rink-100 hover:bg-wbg dark:hover:bg-rink-700'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-card-meta text-wtext-3 dark:text-rink-300">
                단장도 코치와 동일하게 팀을 관리할 수 있습니다.
              </p>
            </div>

            {/* 이름 */}
            <div className="mb-5">
              <label htmlFor="coach-name" className="mb-2 block text-card-body font-bold text-wtext-1 dark:text-white">
                이름 <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <input
                id="coach-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={MESSAGES.placeholders.enterFullName}
                className={INPUT_CLASS}
                autoComplete="name"
                required
                aria-required="true"
              />
            </div>

            {/* 연락처 */}
            <div className="mb-5">
              <label htmlFor="coach-phone" className="mb-2 block text-card-body font-bold text-wtext-1 dark:text-white">
                연락처 <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <input
                id="coach-phone"
                type="tel"
                value={phone}
                onChange={handlePhoneChange}
                placeholder="010-0000-0000 형식으로 입력해주세요"
                className={INPUT_CLASS}
                inputMode="numeric"
                autoComplete="tel"
                required
                aria-required="true"
              />
            </div>

            {/* 아이디 + 중복확인 */}
            <div className="mb-5">
              <label htmlFor="coach-login-id" className="mb-2 block text-card-body font-bold text-wtext-1 dark:text-white">
                아이디 <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  id="coach-login-id"
                  type="text"
                  value={loginId}
                  onChange={handleLoginIdChange}
                  placeholder="영문 소문자 시작, 4~20자"
                  className={`${INPUT_CLASS} flex-1 min-w-0`}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  aria-required="true"
                />
                <button
                  type="button"
                  onClick={handleCheckId}
                  disabled={isCheckingId || loginId.trim().length === 0}
                  className="shrink-0 min-h-[48px] px-4 rounded-xl border border-ice-500 bg-ice-500/5 dark:bg-ice-500/10 text-card-emphasis font-bold text-ice-500 transition-colors motion-reduce:transition-none hover:bg-ice-500/10 active:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCheckingId ? '확인 중' : '중복확인'}
                </button>
              </div>
              {idStatus === 'available' && (
                <p className="mt-1.5 flex items-center gap-1 text-card-meta font-bold text-ice-500">
                  <Icon name="check_circle" className="text-base" aria-hidden="true" />
                  사용 가능한 아이디입니다.
                </p>
              )}
            </div>

            {/* 비밀번호 */}
            <div>
              <label htmlFor="coach-password" className="mb-2 block text-card-body font-bold text-wtext-1 dark:text-white">
                비밀번호 <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <div className="relative">
                <input
                  id="coach-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8자 이상 입력해주세요"
                  className={`${INPUT_CLASS} pr-12`}
                  autoComplete="new-password"
                  required
                  aria-required="true"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 flex size-8 items-center justify-center rounded-lg text-wtext-3 dark:text-rink-300 hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none"
                  aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                >
                  <Icon name={showPassword ? 'visibility_off' : 'visibility'} className="text-xl" aria-hidden="true" />
                </button>
              </div>
              <p className="mt-1.5 text-card-meta text-wtext-3 dark:text-rink-300">
                이 아이디와 비밀번호는 등록 후 코치에게 전달됩니다.
              </p>
            </div>
          </div>

          {/* 액션 버튼 — 취소 / 등록하기 */}
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => back()}
              disabled={isSubmitting}
              className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 py-3.5 text-card-emphasis font-bold text-wtext-2 dark:text-rink-100 transition-colors motion-reduce:transition-none hover:bg-wbg dark:hover:bg-rink-700 active:brightness-95 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!isValid || isSubmitting}
              className="flex min-h-[48px] flex-[2] items-center justify-center gap-2 rounded-xl bg-ice-500 py-3.5 text-card-emphasis font-bold text-white shadow-sm transition-colors motion-reduce:transition-none hover:bg-ice-700 active:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Icon name="person_add" className="text-[20px]" aria-hidden="true" />
              <span>{isSubmitting ? MESSAGES.common.processing : '등록하기'}</span>
            </button>
          </div>
        </form>

        {/* BottomNav 여백 */}
        <div className="h-32" aria-hidden="true" />
      </main>
    </MobileContainer>
  );
}
