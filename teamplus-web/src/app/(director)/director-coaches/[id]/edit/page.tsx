'use client';

import { useState, useEffect, useCallback, type FormEvent, type ChangeEvent } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useNavigation } from '@/components/ui/NavLink';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { resolveImageSrc } from '@/lib/image-url';

import { usePageReady } from '@/hooks/usePageReady';

/** 입력 필드 공통 스타일 — h-12 (48px) 터치 타겟 · ICETIMES 폼 입력 규격 */
const INPUT_CLASS =
  'w-full h-12 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-700 px-4 text-card-body font-semibold text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-wtext-3 outline-none transition-colors motion-reduce:transition-none focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20';

export default function DirectorCoachEditPage() {
  // 인증/권한 체크는 (director)/layout.tsx 에서 단 한 번 수행됨 (중복 호출 금지)
  const params = useParams();
  const coachId = params?.id as string;
  const { navigate, back } = useNavigation();
  const { toast } = useToast();

  /* ── 폼 상태 ── */
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  /* ── 프로필 사진 (읽기 전용 표시 — 사진 변경은 코치 본인 마이 프로필에서) ── */
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  /* ── 기존 데이터 로딩 ── */
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [loadError, setLoadError] = useState(false);

  const loadCoach = useCallback(async () => {
    if (!coachId) return;
    setIsLoading(true);
    setLoadError(false);
    try {
      // [수정 W2.D 2026-05-18 #1/#4] DIRECTOR(HEAD_COACH) 케이스에서
      //  /admin/users/{id} 가 422 를 반환하던 회귀 차단. 우선 /admin/coaches/{id}
      //  (코치 전용 엔드포인트) 로 시도하고 404 등 미일치 시 /admin/users/{id} 로 폴백.
      //  director-coaches 목록은 team-member 의 user.id 를 사용하므로 두 엔드포인트
      //  모두 동일 ID 로 조회 가능.
      let res = await api.get<Record<string, unknown>>(`/admin/coaches/${coachId}`);
      if (!res.success) {
        // 폴백: /admin/users
        res = await api.get<Record<string, unknown>>(`/admin/users/${coachId}`);
      }
      if (res.success && res.data) {
        const d = res.data;
        const user = (d.user ?? d) as Record<string, unknown>;

        setName((user.name as string) ?? (`${(user.lastName as string) ?? ''}${(user.firstName as string) ?? ''}`.trim() || ''));

        const profileImg = (d.avatarUrl as string) ?? (user.avatarUrl as string) ?? null;
        if (profileImg) setAvatarUrl(profileImg);

        const rawPhone = (d.phone as string) ?? (user.phone as string) ?? '';
        // 전화번호 포맷 적용
        const digits = rawPhone.replace(/[^0-9]/g, '');
        if (digits.length === 11) {
          setPhone(`${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`);
        } else if (digits.length === 10) {
          setPhone(`${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`);
        } else {
          setPhone(rawPhone);
        }
      } else {
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [coachId]);

  useEffect(() => {
    void loadCoach();
  }, [loadCoach]);

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

  /** 제출 가능 여부 */
  const isValid = name.trim().length > 0 && phone.replace(/-/g, '').length >= 10;

  /** 폼 제출 */
  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!isValid || isSubmitting || !coachId) return;

      setIsSubmitting(true);
      setErrorMessage('');

      try {
        const payload: Record<string, string> = {
          name: name.trim(),
          phone: phone.replace(/-/g, ''),
        };
        // [수정 W2.D 2026-05-18 #1/#4] /admin/users/{id} PUT 은 firstName/lastName/phone/age 만
        //  허용 (whitelist + forbidNonWhitelisted 로 422 발생). UpdateCoachDto 와 1:1 매치되는
        //  /admin/coaches/{id} 로 변경. ADMIN/DIRECTOR/ACADEMY_DIRECTOR 모두 허용.
        const res = await api.put(`/admin/coaches/${coachId}`, payload);

        if (res.success) {
          toast.success(MESSAGES.save.success);
          navigate(`/director-coaches/${coachId}`);
        } else {
          setErrorMessage(res.error?.message || MESSAGES.save.error);
        }
      } catch {
        setErrorMessage(MESSAGES.save.error);
      } finally {
        setIsSubmitting(false);
      }
    },
    [isValid, isSubmitting, coachId, name, phone, navigate, toast],
  );

  // 로딩 상태
  if (isLoading) return null;

  // 로딩 에러
  if (loadError) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title="코치 수정" onBack={back} forceNative />
        <main className="flex-1 flex flex-col items-center justify-center px-6 bg-it-canvas dark:bg-puck" role="main" aria-label="코치 수정">
          <div className="w-16 h-16 rounded-w-pill bg-it-line dark:bg-rink-700 flex items-center justify-center mb-4">
            <Icon name="error_outline" className="text-3xl text-it-ink-400 dark:text-rink-300" aria-hidden="true" />
          </div>
          <p className="text-card-body text-it-ink-500 dark:text-rink-300 mb-4">{MESSAGES.error.general}</p>
          <button
            type="button"
            onClick={loadCoach}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-w-md bg-it-blue-500 px-5 py-2.5 text-card-body font-bold text-white hover:bg-it-blue-600 transition-colors motion-reduce:transition-none active:brightness-95"
          >
            <Icon name="refresh" className="text-[18px]" aria-hidden="true" />
            <span>다시 시도하기</span>
          </button>
          <div className="h-32" aria-hidden="true" />
        </main>
      </MobileContainer>
    );
  }

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="코치 수정" onBack={back} forceNative />

      <main className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck" role="main" aria-label="코치 수정">
        {/* 타이틀 영역 — flat 흰 섹션 */}
        <section className="bg-it-surface dark:bg-rink-800 px-6 pt-6 pb-5">
          <h2 className="text-2xl font-bold text-it-ink-800 dark:text-white">코치 정보 수정</h2>
          <p className="mt-1 text-card-body text-it-ink-500 dark:text-rink-300">
            {MESSAGES.coach.editDescription}
          </p>
        </section>

        {/* 에러 배너 */}
        {errorMessage && (
          <div className="mx-5 mt-3 flex items-center gap-3 rounded-w-md bg-it-red-50 dark:bg-it-red-500/15 border-[1.5px] border-it-red-100 dark:border-it-red-500/30 p-4" role="alert">
            <Icon name="error" className="text-it-red-500 dark:text-it-red-300 text-xl shrink-0" aria-hidden="true" />
            <p className="text-card-body text-it-red-600 dark:text-it-red-300">{errorMessage}</p>
          </div>
        )}

        {/* flat 섹션 사이 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 폼 — flat 흰 섹션 (카드 박스 제거) */}
        <form onSubmit={handleSubmit}>
          <section className="bg-it-surface dark:bg-rink-800 px-6 pt-6 pb-7">

            {/* 프로필 사진 영역 (읽기 전용 표시 — 사진 변경은 코치 본인 마이 프로필에서) */}
            <div className="flex flex-col items-center mb-8">
              <div className="flex h-28 w-28 items-center justify-center rounded-w-pill bg-it-fill dark:bg-rink-700 overflow-hidden border-4 border-it-surface dark:border-rink-700">
                {(() => {
                  // /uploads/... 상대 경로는 resolveImageSrc 로 API_ORIGIN 절대 URL 합성.
                  const src = resolveImageSrc(avatarUrl);
                  return src ? (
                    <Image
                      src={src}
                      alt={name ? `${name} 코치` : '코치 프로필 사진'}
                      width={112}
                      height={112}
                      className="h-full w-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <Icon
                      name="person"
                      className="text-5xl text-it-ink-400 dark:text-rink-300"
                      aria-hidden="true"
                    />
                  );
                })()}
              </div>
            </div>

            {/* 이름 */}
            <div className="mb-5">
              <label htmlFor="edit-coach-name" className="mb-2 block text-card-body font-bold text-it-ink-800 dark:text-white">
                이름 <span className="text-it-red-500" aria-hidden="true">*</span>
              </label>
              <input
                id="edit-coach-name"
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
              <label htmlFor="edit-coach-phone" className="mb-2 block text-card-body font-bold text-it-ink-800 dark:text-white">
                연락처 <span className="text-it-red-500" aria-hidden="true">*</span>
              </label>
              <input
                id="edit-coach-phone"
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

          </section>

          {/* 액션 버튼 — 취소 / 저장하기 */}
          <div className="px-5 pt-6 flex gap-3">
            <button
              type="button"
              onClick={() => back()}
              disabled={isSubmitting}
              className="flex min-h-[48px] flex-1 items-center justify-center rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 py-3.5 text-card-emphasis font-bold text-it-ink-600 dark:text-rink-100 transition-colors motion-reduce:transition-none hover:bg-it-fill dark:hover:bg-rink-700 active:brightness-95 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!isValid || isSubmitting}
              className="flex min-h-[48px] flex-[2] items-center justify-center gap-2 rounded-w-md bg-it-blue-500 py-3.5 text-card-emphasis font-bold text-white transition-colors motion-reduce:transition-none hover:bg-it-blue-600 active:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Icon name="save" className="text-[20px]" aria-hidden="true" />
              <span>{isSubmitting ? MESSAGES.common.saving : '저장하기'}</span>
            </button>
          </div>
        </form>

        {/* BottomNav 여백 */}
        <div className="h-32" aria-hidden="true" />
      </main>
    </MobileContainer>
  );
}
