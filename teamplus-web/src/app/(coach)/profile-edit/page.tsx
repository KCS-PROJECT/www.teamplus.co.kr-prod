'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { useToast } from '@/components/ui/Toast';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { resolveImageSrc } from '@/lib/image-url';
import { api } from '@/services/api-client';

const GlobalMenu = dynamic(() => import('@/components/layout/GlobalMenu').then(mod => ({ default: mod.GlobalMenu })), { ssr: false });

// ─── 코치 프로필 수정 페이지 ────────────────────────────
// 디자인 참조: docs/디자인/04_코치/코치_상세_프로필_4/screen.png
// API: GET/PUT /api/v1/coach-profile, GET /auth/profile

interface FormErrors {
  firstName?: string;
  lastName?: string;
}

export default function CoachProfileEditPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [coachClub, setCoachClub] = useState<{ name: string; location: string } | null>(null);

  // 변경 감지 (초기값 저장)
  const [initialValues, setInitialValues] = useState({ firstName: '', lastName: '' });
  const isDirty = firstName !== initialValues.firstName || lastName !== initialValues.lastName;

  usePageReady(!isDataLoading);

  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle: '프로필 수정',
    showBottomNav: false,
    isDataLoaded: !isDataLoading,
    showBackButton: true,
  });

  // 프로필 데이터 로드
  useEffect(() => {

    const loadProfile = async () => {
      setIsDataLoading(true);
      try {
        const [authRes, coachRes] = await Promise.all([
          api.get<{ email: string; phone?: string; profileImage?: string }>('/auth/profile'),
          api.get<{ firstName: string; lastName: string; club?: { clubName: string; location: string } }>('/coach-profile'),
        ]);

        if (authRes.success && authRes.data) {
          setEmail(authRes.data.email ?? '');
          setPhone(authRes.data.phone ?? '');
          if (authRes.data.profileImage) {
            setAvatarPreview(authRes.data.profileImage);
          }
        }

        if (coachRes.success && coachRes.data) {
          const fn = coachRes.data.firstName ?? '';
          const ln = coachRes.data.lastName ?? '';
          setFirstName(fn);
          setLastName(ln);
          setInitialValues({ firstName: fn, lastName: ln });
          if (coachRes.data.club?.clubName) {
            setCoachClub({
              name: coachRes.data.club.clubName,
              location: coachRes.data.club.location ?? '',
            });
          }
        }
      } catch {
        // 로드 실패 시 빈 폼으로 시작
      } finally {
        setIsDataLoading(false);
      }
    };

    loadProfile();
  }, []);

  const validate = useCallback((): boolean => {
    const errors: FormErrors = {};
    if (!lastName.trim()) errors.lastName = '성을 입력해주세요';
    else if (lastName.trim().length > 20) errors.lastName = '성은 20자 이하로 입력해주세요';
    if (!firstName.trim()) errors.firstName = '이름을 입력해주세요';
    else if (firstName.trim().length > 20) errors.firstName = '이름은 20자 이하로 입력해주세요';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [firstName, lastName]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error(MESSAGES.profile.fileSizeOver5MB);
      return;
    }
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!validate() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const response = await api.put('/coach-profile', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      if (response.success) {
        toast.success(MESSAGES.save.success);
        router.back();
      } else {
        toast.error(response.error?.message ?? MESSAGES.save.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isDataLoading) {
    return null;
  }

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="프로필 수정" />

      {/* 본문 — 키보드 활성 시 입력/버튼 가림 방지 (pb-keyboard-safe-32) */}
      <main className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck px-5 pt-6 pb-keyboard-safe-32 scroll-keyboard-safe">
        {/* 프로필 이미지 */}
        <div className="flex flex-col items-center mb-6">
          <div className="relative">
            <div className="w-24 h-24 rounded-w-pill overflow-hidden bg-it-line dark:bg-rink-700 ring-4 ring-it-surface dark:ring-rink-800 shadow-sh-1">
              {resolveImageSrc(avatarPreview) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img loading="lazy" decoding="async" src={resolveImageSrc(avatarPreview)} alt="프로필 사진" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Icon name="person" className="text-5xl text-it-ink-400 dark:text-rink-300" aria-hidden="true" />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 w-9 h-9 rounded-w-pill bg-it-blue-500 flex items-center justify-center shadow-sh-1 hover:bg-it-blue-600 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/50 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900 ring-2 ring-it-surface dark:ring-rink-900"
              aria-label="프로필 사진 변경"
            >
              <Icon name="camera_alt" className="text-white text-[16px]" aria-hidden="true" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
              aria-hidden="true"
            />
          </div>
          <p className="mt-3 text-card-meta text-it-ink-500 dark:text-rink-300">사진을 탭해서 변경할 수 있어요</p>
        </div>

        {/* 소속 팀 (읽기 전용) */}
        {coachClub && (
          <div className="mb-6 p-4 bg-it-blue-50 dark:bg-it-blue-900/30 rounded-w-md border-[1.5px] border-it-blue-100 dark:border-it-blue-800">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="shrink-0 inline-flex w-10 h-10 items-center justify-center rounded-w-md bg-it-blue-500/10 dark:bg-it-blue-500/20 text-it-blue-500 dark:text-it-blue-300"
              >
                <Icon name="sports_hockey" className="text-[22px]" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-card-meta font-bold text-it-blue-500/80 dark:text-it-blue-300/80 uppercase tracking-wider mb-0.5">소속 팀</p>
                <p className="text-card-body font-semibold text-it-ink-800 dark:text-white truncate">{coachClub.name}</p>
                {coachClub.location && (
                  <p className="text-card-meta text-it-ink-500 dark:text-rink-300 truncate">{coachClub.location}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Section: 기본 정보 */}
        <h2 className="text-card-meta font-bold text-it-ink-500 dark:text-rink-300 uppercase tracking-wider mb-3">
          기본 정보
        </h2>

        {/* 입력 필드 */}
        <div className="flex flex-col gap-5">
          {/* 성 */}
          <div>
            <label htmlFor="lastName" className="block text-card-body font-semibold text-it-ink-800 dark:text-rink-100 mb-2">
              성 <span className="text-it-red-500">*</span>
            </label>
            <input
              id="lastName"
              type="text"
              value={lastName}
              onChange={(e) => { setLastName(e.target.value); setFormErrors((p) => ({ ...p, lastName: undefined })); }}
              className={cn(
                'w-full h-12 px-4 bg-it-fill dark:bg-rink-800 border-[1.5px] rounded-w-md text-[15px] font-medium text-it-ink-800 dark:text-white placeholder:text-it-ink-400 focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500 transition-colors motion-reduce:transition-none',
                formErrors.lastName ? 'border-it-red-400 dark:border-it-red-500' : 'border-it-line-strong dark:border-rink-700'
              )}
              placeholder={MESSAGES.placeholders.enterFirstName}
              required
              aria-required="true"
              aria-invalid={!!formErrors.lastName}
              autoComplete="family-name"
            />
            {formErrors.lastName && (
              <p className="mt-1.5 text-card-meta text-it-red-500" role="alert">{formErrors.lastName}</p>
            )}
          </div>

          {/* 이름 */}
          <div>
            <label htmlFor="firstName" className="block text-card-body font-semibold text-it-ink-800 dark:text-rink-100 mb-2">
              이름 <span className="text-it-red-500">*</span>
            </label>
            <input
              id="firstName"
              type="text"
              value={firstName}
              onChange={(e) => { setFirstName(e.target.value); setFormErrors((p) => ({ ...p, firstName: undefined })); }}
              className={cn(
                'w-full h-12 px-4 bg-it-fill dark:bg-rink-800 border-[1.5px] rounded-w-md text-[15px] font-medium text-it-ink-800 dark:text-white placeholder:text-it-ink-400 focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500 transition-colors motion-reduce:transition-none',
                formErrors.firstName ? 'border-it-red-400 dark:border-it-red-500' : 'border-it-line-strong dark:border-rink-700'
              )}
              placeholder={MESSAGES.placeholders.enterLastName}
              required
              aria-required="true"
              aria-invalid={!!formErrors.firstName}
              autoComplete="given-name"
            />
            {formErrors.firstName && (
              <p className="mt-1.5 text-card-meta text-it-red-500" role="alert">{formErrors.firstName}</p>
            )}
          </div>

        </div>

        {/* Section: 연락처 (읽기 전용) */}
        {(phone || email) && (
          <>
            <h2 className="text-card-meta font-bold text-it-ink-500 dark:text-rink-300 uppercase tracking-wider mt-8 mb-3">
              연락처
            </h2>
            <div className="flex flex-col gap-5">
              {phone && (
                <div>
                  <label htmlFor="phone" className="block text-card-body font-semibold text-it-ink-800 dark:text-rink-100 mb-2">
                    휴대폰 번호
                  </label>
                  <div className="relative">
                    <input
                      id="phone"
                      type="tel"
                      value={phone}
                      readOnly
                      className="w-full h-12 px-4 pr-10 bg-it-canvas dark:bg-rink-800/50 border-[1.5px] border-it-line dark:border-rink-700 rounded-w-md text-[15px] font-medium text-it-ink-500 dark:text-rink-300 cursor-not-allowed tabular-nums"
                      aria-readonly="true"
                    />
                    <Icon
                      name="lock"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-it-ink-400 dark:text-rink-300 text-card-title pointer-events-none"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="mt-1.5 text-card-meta text-it-ink-500 dark:text-rink-300 flex items-center gap-1">
                    <Icon name="info" className="text-[14px]" aria-hidden="true" />
                    휴대폰 번호 변경은 고객센터로 문의해주세요.
                  </p>
                </div>
              )}

              {email && (
                <div>
                  <label htmlFor="email" className="block text-card-body font-semibold text-it-ink-800 dark:text-rink-100 mb-2">
                    아이디
                  </label>
                  <div className="relative">
                    <input
                      id="email"
                      type="email"
                      value={email}
                      readOnly
                      className="w-full h-12 px-4 pr-10 bg-it-canvas dark:bg-rink-800/50 border-[1.5px] border-it-line dark:border-rink-700 rounded-w-md text-[15px] font-medium text-it-ink-500 dark:text-rink-300 cursor-not-allowed"
                      aria-readonly="true"
                    />
                    <Icon
                      name="lock"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-it-ink-400 dark:text-rink-300 text-card-title pointer-events-none"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="mt-1.5 text-card-meta text-it-ink-500 dark:text-rink-300 flex items-center gap-1">
                    <Icon name="info" className="text-[14px]" aria-hidden="true" />
                    아이디는 변경할 수 없습니다.
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* 하단 수정/취소 버튼 — ICETIMES 폼 패턴 (outline + primary) */}
        <div className="mt-8 mb-6 flex gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={isSubmitting}
            className="flex-1 h-12 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 text-card-body font-bold text-it-ink-800 dark:text-rink-100 hover:bg-it-fill dark:hover:bg-rink-700 transition-colors active:brightness-95 motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
            aria-label="수정 취소"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isDirty || isSubmitting}
            className={cn(
              'flex-[1.5] h-12 rounded-w-md text-card-body font-bold transition-colors active:brightness-95 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900',
              isDirty && !isSubmitting
                ? 'bg-it-blue-500 hover:bg-it-blue-600 text-white'
                : 'bg-it-fill dark:bg-rink-800 text-it-ink-400 dark:text-rink-300 cursor-not-allowed'
            )}
            aria-disabled={!isDirty || isSubmitting}
            aria-label="프로필 수정하기"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-w-pill animate-spin motion-reduce:animate-none" aria-hidden="true" />
                {MESSAGES.common.saving}
              </span>
            ) : (
              MESSAGES.common.edit
            )}
          </button>
        </div>
      </main>

      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </MobileContainer>
  );
}
