'use client';

import { useState, useEffect, useCallback, useRef, type FormEvent, type ChangeEvent } from 'react';
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
interface SpecialtyOption {
  value: string;
  label: string;
}

/** 폴백 옵션 (API 실패 시) */
const FALLBACK_SPECIALTY: SpecialtyOption[] = [
  { value: 'ICE_HOCKEY', label: '아이스하키' },
  { value: 'ICE_HOCKEY_FORWARD', label: '포워드 전문' },
  { value: 'ICE_HOCKEY_DEFENSE', label: '디펜스 전문' },
  { value: 'ICE_HOCKEY_GOALIE', label: '골키퍼 전문' },
  { value: 'ICE_HOCKEY_SKATING', label: '스케이팅 전문' },
  { value: 'ICE_HOCKEY_GENERAL', label: '종합 코칭' },
];

/** 입력 필드 공통 스타일 — h-12 (48px) 터치 타겟 */
const INPUT_CLASS =
  'w-full h-12 rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-700 px-4 text-card-body text-wtext-1 dark:text-white placeholder:text-wtext-3 dark:placeholder:text-wtext-3 outline-none transition-colors motion-reduce:transition-none focus:border-ice-500 focus:ring-2 focus:ring-ice-500/20';

/** textarea 전용 (h 제한 없음) */
const TEXTAREA_CLASS =
  'w-full rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-700 px-4 py-3 text-card-body text-wtext-1 dark:text-white placeholder:text-wtext-3 dark:placeholder:text-wtext-3 outline-none transition-colors motion-reduce:transition-none focus:border-ice-500 focus:ring-2 focus:ring-ice-500/20 resize-none';

export default function DirectorCoachEditPage() {
  // 인증/권한 체크는 (director)/layout.tsx 에서 단 한 번 수행됨 (중복 호출 금지)
  const params = useParams();
  const coachId = params?.id as string;
  const { navigate, back } = useNavigation();
  const { toast } = useToast();

  /* ── 전문분야 코드 (DB에서 가져옴) ── */
  const [specialtyOptions, setSpecialtyOptions] = useState<SpecialtyOption[]>(FALLBACK_SPECIALTY);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<Array<{ code: string; name: string }>>('/common-codes?groupCode=COACH_SPECIALTY');
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          setSpecialtyOptions(res.data.map((c) => ({ value: c.code, label: c.name })));
        }
      } catch {
        // 폴백 사용
      }
    })();
  }, []);

  /* ── 폼 상태 ── */
  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [phone, setPhone] = useState('');
  const [career, setCareer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showSpecialtySheet, setShowSpecialtySheet] = useState(false);

  /* ── 프로필 사진 ── */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profilePreview, setProfilePreview] = useState<string | null>(null);

  const handleProfileImageChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setProfilePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

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
        const note = typeof user.note === 'string' ? (() => { try { return JSON.parse(user.note as string); } catch { return {}; } })() : {};

        setName((user.name as string) ?? (`${(user.lastName as string) ?? ''}${(user.firstName as string) ?? ''}`.trim() || ''));
        setSpecialty((d.specialty as string) ?? ((note.specialty as string) ?? ''));
        setCareer((d.career as string) ?? (note.career as string) ?? '');

        const profileImg = (d.avatarUrl as string) ?? (user.avatarUrl as string) ?? null;
        if (profileImg) setProfilePreview(profileImg);

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
  const isValid = name.trim().length > 0 && specialty !== '' && phone.replace(/-/g, '').length >= 10;

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
          specialty,
          phone: phone.replace(/-/g, ''),
          career: career.trim(),
        };
        if (profilePreview && profilePreview.startsWith('data:')) {
          payload.avatarUrl = profilePreview;
        }
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
    [isValid, isSubmitting, coachId, name, specialty, phone, career, profilePreview, navigate, toast],
  );

  // 로딩 상태
  if (isLoading) return null;

  // 로딩 에러
  if (loadError) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title="코치 수정" onBack={back} forceNative />
        <main className="flex-1 flex flex-col items-center justify-center px-6" role="main" aria-label="코치 수정">
          <div className="w-16 h-16 rounded-w-pill bg-wline-2 dark:bg-rink-700 flex items-center justify-center mb-4">
            <Icon name="error_outline" className="text-3xl text-wtext-3 dark:text-rink-300" aria-hidden="true" />
          </div>
          <p className="text-card-body text-wtext-3 dark:text-rink-300 mb-4">{MESSAGES.error.general}</p>
          <button
            type="button"
            onClick={loadCoach}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-ice-500 px-5 py-2.5 text-card-body font-bold text-white shadow-sm hover:bg-ice-700 transition-colors motion-reduce:transition-none active:brightness-95"
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
    <>
    <MobileContainer hasBottomNav>
      <PageAppBar title="코치 수정" onBack={back} forceNative />

      <main className="flex-1 overflow-y-auto hide-scrollbar" role="main" aria-label="코치 수정">
        {/* 타이틀 영역 */}
        <div className="px-6 pt-6 pb-4">
          <h2 className="text-2xl font-bold text-wtext-1 dark:text-white">코치 정보 수정</h2>
          <p className="mt-1 text-card-body text-wtext-3 dark:text-rink-300">
            {MESSAGES.coach.editDescription}
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

            {/* 프로필 사진 영역 */}
            <div className="flex flex-col items-center mb-8">
              <div className="relative">
                <div className="flex h-28 w-28 items-center justify-center rounded-w-pill bg-wline-2 dark:bg-rink-700 overflow-hidden border-4 border-white dark:border-rink-700 shadow-md">
                  {(() => {
                    // [수정 2026-05-23] /uploads/... 상대 경로가 next/image 에서 도메인 미허용으로
                    //  404 가 되던 문제 차단. data: URL 은 그대로 통과, 그 외에는 resolveImageSrc 로
                    //  API_ORIGIN 절대 URL 합성.
                    const previewSrc = profilePreview?.startsWith('data:')
                      ? profilePreview
                      : resolveImageSrc(profilePreview);
                    return previewSrc ? (
                      <Image
                        src={previewSrc}
                        alt="프로필 미리보기"
                        width={112}
                        height={112}
                        className="h-full w-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <Icon
                        name="person"
                        className="text-5xl text-wtext-4 dark:text-rink-300"
                        aria-hidden="true"
                      />
                    );
                  })()}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 flex h-10 w-10 items-center justify-center rounded-w-pill bg-ice-500 text-white shadow-sm hover:bg-ice-700 transition-colors motion-reduce:transition-none active:brightness-95"
                  aria-label="프로필 사진 변경"
                >
                  <Icon name="photo_camera" className="text-card-title" aria-hidden="true" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleProfileImageChange}
                  className="hidden"
                  aria-hidden="true"
                />
              </div>
              <span className="mt-2 text-card-meta text-wtext-3 dark:text-rink-300">프로필 사진 변경</span>
            </div>

            {/* 이름 */}
            <div className="mb-5">
              <label htmlFor="edit-coach-name" className="mb-2 block text-card-body font-bold text-wtext-1 dark:text-white">
                이름 <span className="text-red-500" aria-hidden="true">*</span>
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

            {/* 전문 분야 */}
            <div className="mb-5">
              <label className="mb-2 block text-card-body font-bold text-wtext-1 dark:text-white">
                전문 분야 <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <button
                type="button"
                aria-expanded={showSpecialtySheet}
                aria-haspopup="dialog"
                onClick={() => setShowSpecialtySheet(true)}
                className={`${INPUT_CLASS} text-left flex items-center justify-between`}
              >
                <span className={specialty ? '' : 'text-wtext-3 dark:text-rink-300'}>
                  {specialty
                    ? specialtyOptions.find((o) => o.value === specialty)?.label ?? '분야를 선택하세요'
                    : '분야를 선택하세요'}
                </span>
                <Icon
                  name="expand_more"
                  className="text-xl text-wtext-3 dark:text-rink-300"
                  aria-hidden="true"
                />
              </button>
            </div>

            {/* 연락처 */}
            <div className="mb-5">
              <label htmlFor="edit-coach-phone" className="mb-2 block text-card-body font-bold text-wtext-1 dark:text-white">
                연락처 <span className="text-red-500" aria-hidden="true">*</span>
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

            {/* 주요 약력 및 수상 */}
            <div>
              <label htmlFor="edit-coach-career" className="mb-2 block text-card-body font-bold text-wtext-1 dark:text-white">
                주요 약력 및 수상
              </label>
              <textarea
                id="edit-coach-career"
                value={career}
                onChange={(e) => setCareer(e.target.value)}
                placeholder={MESSAGES.placeholders.enterCoachCareer}
                rows={5}
                className={TEXTAREA_CLASS}
              />
            </div>
          </div>

          {/* 액션 버튼 — 취소 / 저장하기 */}
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
              <Icon name="save" className="text-[20px]" aria-hidden="true" />
              <span>{isSubmitting ? MESSAGES.common.saving : '저장하기'}</span>
            </button>
          </div>
        </form>

        {/* BottomNav 여백 */}
        <div className="h-32" aria-hidden="true" />
      </main>

    </MobileContainer>

    {/* 전문 분야 바텀시트 */}
    {showSpecialtySheet && (
      <div className="fixed inset-0 z-[100] flex items-end justify-center" role="dialog" aria-modal="true" aria-label="전문 분야 선택">
        <div
          className="absolute inset-0 bg-black/50"
          onClick={() => setShowSpecialtySheet(false)}
        />
        <div className="relative w-full max-w-md bg-white dark:bg-rink-800 rounded-t-3xl shadow-md pb-10">
          <div className="flex justify-center pt-4 pb-3">
            <div className="w-12 h-1.5 rounded-w-pill bg-wline dark:bg-rink-500" />
          </div>
          <div className="flex items-center justify-between px-6 pb-4">
            <h3 className="text-card-title font-bold text-wtext-1 dark:text-white">전문 분야 선택</h3>
            <button
              type="button"
              onClick={() => setShowSpecialtySheet(false)}
              className="flex size-11 items-center justify-center rounded-w-pill hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none active:brightness-95"
              aria-label="닫기"
            >
              <Icon name="close" className="text-2xl text-wtext-3 dark:text-rink-300" aria-hidden="true" />
            </button>
          </div>
          <div className="h-px bg-wline-2 dark:bg-rink-700 mx-6" />
          <div className="py-2 px-2">
            {specialtyOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setSpecialty(opt.value);
                  setShowSpecialtySheet(false);
                }}
                className={`flex min-h-[48px] w-full items-center justify-between px-4 py-4 rounded-xl text-left transition-colors motion-reduce:transition-none active:bg-wline-2 dark:active:bg-rink-700 ${
                  specialty === opt.value
                    ? 'bg-blue-50 dark:bg-blue-900/20'
                    : 'hover:bg-wbg dark:hover:bg-rink-700/50'
                }`}
              >
                <span className={`text-card-title ${
                  specialty === opt.value
                    ? 'text-ice-500 font-bold'
                    : 'text-wtext-1 dark:text-white font-medium'
                }`}>
                  {opt.label}
                </span>
                {specialty === opt.value && (
                  <Icon name="check_circle" className="text-2xl text-ice-500" aria-hidden="true" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
