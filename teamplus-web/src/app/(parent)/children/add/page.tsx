'use client';

// NOTE(Phase 3, 설계서 §3.4): CHILD UserType 폐기 시 로그인 정보 섹션 제거 예정
// NOTE(Phase B/C, 설계서 §4.5): 팀 코드(teamCode) 백엔드 연동 완료.
// NOTE(옵션 A, PARENT_TEAM_REGISTRATION_SPEC.md §2 #14):
//  자녀 등록 시 팀 코드 입력 불필요 — 학부모 TeamMember(PARENT) 팀 자동 매핑.
//  팀 코드 필드는 readonly 학부모 팀명 표시로 변경 + onBlur 실시간 검증 로직 제거.

import { useState, useMemo, useId, useEffect, useRef, type ReactNode } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { DatePickerModal, formatDateLabel } from '@/components/ui/DatePickerModal';
import {
  uploadFile,
  UploadValidationError,
  UploadNetworkError,
} from '@/services/upload.service';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useNavigation, NavLink } from '@/components/ui/NavLink';
import { useToast } from '@/components/ui/Toast';
import { useChildren } from '@/hooks/useChildren';
import { getServerToday } from '@/services/server-time';
import { TeamPickerSheet, type TeamPickerSelection } from '@/components/team/TeamPickerSheet';
import { MESSAGES } from '@/lib/messages';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { calculateKoreanAge, cn } from '@/lib/utils';
import { resolveImageSrc } from '@/lib/image-url';
import { isNativeApp } from '@/lib/environment';
import { upload as nativeUpload } from '@/services/native-bridge';
import dynamic from 'next/dynamic';
const GlobalMenu = dynamic(() => import('@/components/layout/GlobalMenu').then(mod => ({ default: mod.GlobalMenu })), { ssr: false });

const MAX_CHILDREN = 10;
const MIN_AGE = 3;
const MAX_AGE = 18;
const CHILD_TEEN_BOUNDARY = 10;

// 나이 계산은 @/lib/utils 의 calculateKoreanAge 로 통합 (중복 제거)

// ========== 폼 상태 ==========

interface FormData {
  lastName: string;
  firstName: string;
  birthDate: string;
  gender: string;
  /** 업로드한 자녀 사진 URL (/uploads/avatar/...). 미선택 시 빈 문자열. */
  imageUrl: string;
}

interface FormErrors {
  lastName?: string;
  firstName?: string;
  birthDate?: string;
}

const GENDER_OPTIONS = [
  { value: 'M', label: '남' },
  { value: 'F', label: '여' },
];

const initialFormData: FormData = {
  lastName: '',
  firstName: '',
  birthDate: '',
  gender: '',
  imageUrl: '',
};

// CHILD_TEEN_BOUNDARY 는 유효성 검사 등 다른 곳에서 활용 가능하도록 상수 유지.
void CHILD_TEEN_BOUNDARY;

// ========== 메인 컴포넌트 ==========

export default function AddChildPage() {
  const { back, navigate } = useNavigation();
  const { toast } = useToast();
  const birthDateId = useId();
  // [2차 사이클 / 2026-05-13] 이중 헤더 방지 — Web `<PageAppBar />` 단독 렌더.
  useNativeUI({ showStatusBar: true, showAppBar: false, showBottomNav: false });
  const { children, addChild } = useChildren();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // L-10/L-11 법정대리인 동의 (Apple 5.1.4 / Google Families / 개인정보보호법 §22조의2)
  // 자녀 등록 시 학부모가 법정대리인 자격으로 자녀 개인정보 처리에 동의해야 함.
  // 동의 없이는 등록 차단. 향후 ChildConsent 모델 추가 시 백엔드에도 기록.
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [childPrivacyConsent, setChildPrivacyConsent] = useState(false);
  const [consentError, setConsentError] = useState('');

  // [Phase 1] 자녀가 가입할 팀을 자녀별로 선택 (무소속 허용).
  //  - 팀 미선택 시 팀 없이 등록되며, 나중에 가입할 수 있다.
  const [selectedTeam, setSelectedTeam] = useState<{ id: string; name: string } | null>(null);
  const [isTeamPickerOpen, setIsTeamPickerOpen] = useState(false);

  usePageReady(true);

  // 서버 시각 prefetch — 사용자가 생년월일 칸 클릭하기 전에 캐시 채우기.
  // DatePickerModal이 열릴 때 클라이언트 fallback 없이 즉시 서버 기준 표시.
  useEffect(() => {
    void getServerToday();
  }, []);

  const age = useMemo(() => calculateKoreanAge(formData.birthDate), [formData.birthDate]);

  const isAtLimit = children.length >= MAX_CHILDREN;

  // 필드 업데이트
  const updateField = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  // 자녀 사진 업로드 — POST /api/v1/files/upload (AVATAR 카테고리, 최대 10MB)
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // input 재선택 가능하게 reset (동일 파일 다시 선택 시도)
    if (e.target) e.target.value = '';
    if (!file) return;
    setIsUploadingImage(true);
    try {
      const result = await uploadFile(file, { category: 'AVATAR', refType: 'player_profile' });
      updateField('imageUrl', result.url);
    } catch (err) {
      if (err instanceof UploadValidationError) {
        toast.error(err.message);
      } else if (err instanceof UploadNetworkError) {
        toast.error(err.message);
      } else {
        toast.error(MESSAGES.error.network);
      }
    } finally {
      setIsUploadingImage(false);
    }
  };

  /**
   * 아바타 버튼 클릭 → 사진첩 진입 (iOS / Android 공통)
   *
   * Native(Flutter WebView) 환경:
   *   1) `upload.pickImage({ source: 'gallery' })` → image_picker plugin 으로 **갤러리만** 즉시 진입
   *      (시스템 액션시트 우회 — iOS/Android 동일)
   *   2) Native 가 임시 로컬 경로 반환 → `upload.uploadToServer({ localPath, category: 'AVATAR' })`
   *      Flutter 측이 multipart 전송 → 백엔드 응답 url 반환
   *   3) `formData.imageUrl` 에 반영
   *
   * Web(브라우저) 환경:
   *   - `fileInputRef.current?.click()` → 표준 file picker (브라우저 기본 액션시트)
   *
   * 사용자 취소(CANCELLED) / 권한 거부(PERMISSION_DENIED) 처리:
   *   - 취소는 silent. 권한 거부는 toast 안내.
   */
  const handleAvatarClick = async () => {
    if (isSubmitting || isUploadingImage) return;

    // Web 브라우저 환경 → 표준 file input
    if (!isNativeApp() || !nativeUpload.isAvailable()) {
      fileInputRef.current?.click();
      return;
    }

    // Flutter Native 환경 → 갤러리 직접 호출 + Native 업로드
    setIsUploadingImage(true);
    try {
      const pick = await nativeUpload.pickImage({
        source: 'gallery',
        quality: 85,
      });
      if (!pick.path) {
        throw new Error('이미지 경로 누락');
      }
      const uploaded = await nativeUpload.uploadToServer({
        localPath: pick.path,
        category: 'AVATAR',
        originalName: pick.name,
        refType: 'player_profile',
      });
      updateField('imageUrl', uploaded.url);
    } catch (err) {
      const message = (err as Error)?.message ?? '';
      // 사용자 취소 — silent
      if (/CANCELLED|cancel/i.test(message)) return;
      // 권한 거부 — 안내
      if (/PERMISSION/i.test(message)) {
        toast.error(MESSAGES.child.photoPermission);
        return;
      }
      toast.error(MESSAGES.error.network);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleImageRemove = () => {
    updateField('imageUrl', '');
  };

  // 유효성 검사
  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.lastName.trim()) {
      newErrors.lastName = '성을 입력해주세요.';
    } else if (formData.lastName.trim().length > 10) {
      newErrors.lastName = '성은 최대 10자까지 입력 가능합니다.';
    }

    if (!formData.firstName.trim()) {
      newErrors.firstName = '이름을 입력해주세요.';
    } else if (formData.firstName.trim().length > 20) {
      newErrors.firstName = '이름은 최대 20자까지 입력 가능합니다.';
    }

    if (!formData.birthDate) {
      newErrors.birthDate = '생년월일을 선택해주세요.';
    } else if (age !== null) {
      if (age < MIN_AGE || age > MAX_AGE) {
        newErrors.birthDate = `${MIN_AGE}세~${MAX_AGE}세 범위만 등록 가능합니다.`;
      }
    }

    // 옵션 A: 팀 코드 입력 검증 제거 — 학부모 본인 팀(TeamMember PARENT, approved)으로
    //  자동 매핑되므로 사용자가 입력할 항목이 없음 (PARENT_TEAM_REGISTRATION_SPEC.md §2 #14).

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 제출
  const handleSubmit = async () => {
    if (!validate()) return;
    if (isAtLimit) {
      toast.error(`자녀는 최대 ${MAX_CHILDREN}명까지 등록할 수 있습니다.`);
      return;
    }

    // L-10/L-11 법정대리인 동의 검증 — 개인정보보호법 §22조의2 의무 사항
    if (!guardianConsent || !childPrivacyConsent) {
      setConsentError('법정대리인 동의와 자녀 개인정보 처리방침 동의는 필수입니다.');
      toast.error(MESSAGES.child.guardianConsent);
      return;
    }
    setConsentError('');

    setIsSubmitting(true);
    try {
      // [Phase 1] 선택한 팀이 있으면 teamId 전송 — 미선택 시 팀 미소속으로 등록.
      const result = await addChild({
        lastName: formData.lastName.trim(),
        firstName: formData.firstName.trim(),
        birthDate: formData.birthDate,
        gender: formData.gender || undefined,
        ...(formData.imageUrl && { imageUrl: formData.imageUrl }),
        ...(selectedTeam && { teamId: selectedTeam.id }),
      });

      if (result.success) {
        toast.success(MESSAGES.save.success);
        navigate('/children');
      } else {
        toast.error(result.error ?? MESSAGES.error.general);
      }
    } catch {
      toast.error(MESSAGES.error.general);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitDisabled =
    isSubmitting || isAtLimit || !guardianConsent || !childPrivacyConsent;

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="선수 등록" forceNative />

      {/* [ICETIMES flat] main = 회색 캔버스 · 콘텐츠는 full-bleed 흰 섹션(RefCard)을
          8px 회색 갭(gap-2)으로 쌓는다. 좌우 패딩은 섹션 내부(px-5)가 담당. */}
      <div className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="pt-2 pb-[110px] flex flex-col gap-2"
        >
          {/* ─── Card 1: 기본 정보 ─────────────────────────────────────── */}
          <RefCard
            icon={
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="6" r="2.6" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M3 14c.8-2.6 2.8-3.6 5-3.6s4.2 1 5 3.6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            }
            title="기본 정보"
          >
            {/* Avatar slot — ref: 80×80 rounded-full bg ice50 border 2px dashed ice200 + 26×26 +badge.
                [2026-05-16] 사진 업로드 기능 추가 — 클릭 시 file picker, 업로드 후 미리보기. */}
            <div className="flex justify-center mb-4">
              <div className="relative">
                <button
                  type="button"
                  onClick={handleAvatarClick}
                  disabled={isSubmitting || isUploadingImage}
                  aria-label={
                    formData.imageUrl ? '자녀 사진 변경' : '자녀 사진 추가'
                  }
                  className={cn(
                    'w-20 h-20 rounded-full grid place-items-center overflow-hidden transition-opacity',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40',
                    formData.imageUrl
                      ? 'bg-it-surface dark:bg-rink-800 border border-it-line-strong dark:border-rink-700'
                      : 'bg-it-blue-50 dark:bg-it-blue-500/15 border-2 border-dashed border-it-blue-200 dark:border-it-blue-500/40',
                    (isSubmitting || isUploadingImage) && 'opacity-60 cursor-not-allowed',
                  )}
                >
                  {resolveImageSrc(formData.imageUrl) ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={resolveImageSrc(formData.imageUrl)}
                      alt="자녀 사진 미리보기"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
                      <circle cx="18" cy="14" r="5" className="fill-it-blue-300 dark:fill-it-blue-400" />
                      <path d="M6 30c2-5 6-7 12-7s10 2 12 7" className="fill-it-blue-300 dark:fill-it-blue-400" />
                    </svg>
                  )}
                </button>
                {/* + 배지 / 업로드 중 스피너 */}
                {isUploadingImage ? (
                  <div
                    className="absolute -right-0.5 -bottom-0.5 w-[26px] h-[26px] rounded-full bg-it-blue-500 text-white grid place-items-center border-[3px] border-white dark:border-rink-800"
                    aria-label="업로드 중"
                    role="status"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="animate-spin">
                      <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="6 4" strokeLinecap="round" />
                    </svg>
                  </div>
                ) : (
                  <div
                    className="absolute -right-0.5 -bottom-0.5 w-[26px] h-[26px] rounded-full bg-it-blue-500 text-white grid place-items-center text-base font-bold border-[3px] border-white dark:border-rink-800 pointer-events-none"
                    aria-hidden="true"
                  >
                    +
                  </div>
                )}
                {/* 삭제 버튼 — 이미 사진이 있을 때만 노출 */}
                {formData.imageUrl && !isUploadingImage && (
                  <button
                    type="button"
                    onClick={handleImageRemove}
                    disabled={isSubmitting}
                    aria-label="자녀 사진 제거"
                    className="absolute -left-1 -top-1 w-6 h-6 rounded-full bg-it-ink-500 dark:bg-rink-700 text-white grid place-items-center border-[2px] border-white dark:border-rink-800 hover:bg-it-ink-800 dark:hover:bg-rink-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                      <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageSelect}
                  className="hidden"
                  aria-hidden="true"
                  tabIndex={-1}
                />
              </div>
            </div>

            {/* 성 / 이름 — ref: grid 1fr 1fr gap 10 */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <RefLabel required>성</RefLabel>
                <RefInput
                  value={formData.lastName}
                  onChange={(v) => updateField('lastName', v)}
                  placeholder="홍"
                  maxLength={10}
                  disabled={isSubmitting}
                  error={!!errors.lastName}
                  aria-label="성"
                />
                {errors.lastName && <RefError>{errors.lastName}</RefError>}
              </div>
              <div>
                <RefLabel required>이름</RefLabel>
                <RefInput
                  value={formData.firstName}
                  onChange={(v) => updateField('firstName', v)}
                  placeholder="길동"
                  maxLength={20}
                  disabled={isSubmitting}
                  error={!!errors.firstName}
                  aria-label="이름"
                />
                {errors.firstName && <RefError>{errors.firstName}</RefError>}
              </div>
            </div>

            {/* 생년월일 — ref: mt 14 / placeholder "연도. 월. 일." / 캘린더 trail icon
                [2026-05-16] native input[type=date] 제거 — 이중 아이콘 회귀 + 브라우저 UI 불일치 해결.
                클릭 시 가운데 모달 팝업 (BirthDatePickerModal). */}
            <div className="mt-3.5">
              <RefLabel required>생년월일</RefLabel>
              <button
                id={birthDateId}
                type="button"
                onClick={() => setIsDatePickerOpen(true)}
                disabled={isSubmitting}
                aria-required="true"
                aria-invalid={!!errors.birthDate}
                aria-label="생년월일 선택"
                aria-haspopup="dialog"
                aria-expanded={isDatePickerOpen}
                className={cn(
                  'w-full h-[46px] px-3.5 rounded-w-md bg-it-fill dark:bg-rink-900 border-[1.5px] flex items-center gap-2.5 text-left',
                  errors.birthDate
                    ? 'border-it-red-500'
                    : 'border-it-line-strong dark:border-rink-700',
                  isSubmitting && 'opacity-60',
                  'transition-colors hover:border-it-blue-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/30',
                )}
              >
                <span
                  className={cn(
                    'flex-1 text-card-body tracking-[-0.01em]',
                    formData.birthDate
                      ? 'text-it-ink-900 dark:text-white font-bold'
                      : 'text-it-ink-400 dark:text-wtext-4/80 font-medium',
                  )}
                >
                  {formData.birthDate ? formatDateLabel(formData.birthDate) : '연도. 월. 일.'}
                </span>
                {/* ref trail: 16×16 캘린더 svg */}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="text-it-ink-400 dark:text-wtext-4 shrink-0">
                  <rect x="2" y="3" width="12" height="11" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M2 6h12M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
              {errors.birthDate && <RefError>{errors.birthDate}</RefError>}
              {age !== null && !errors.birthDate && (
                <p className="mt-1.5 text-card-meta font-semibold text-it-ink-500 dark:text-wtext-4 font-num tabular-nums">
                  만 {age}세
                </p>
              )}
            </div>

            {/* 성별 — ref: mt 14 / 2-col grid / 46 height button / active bg ice50 border ice500 color ice700 */}
            <div className="mt-3.5">
              <RefLabel>성별</RefLabel>
              <div className="grid grid-cols-2 gap-2.5">
                {GENDER_OPTIONS.map((opt) => {
                  const on = formData.gender === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => updateField('gender', on ? '' : opt.value)}
                      disabled={isSubmitting}
                      className={cn(
                        'h-[46px] rounded-w-md text-card-body font-extrabold tracking-[-0.02em] transition-colors motion-reduce:transition-none',
                        on
                          ? 'bg-it-blue-50 dark:bg-it-blue-500/15 border-[1.5px] border-it-blue-500 text-it-blue-600 dark:text-it-blue-300'
                          : 'bg-it-fill dark:bg-rink-900 border-[1.5px] border-it-line-strong dark:border-rink-700 text-it-ink-800 dark:text-wtext-4',
                        isSubmitting && 'opacity-60 cursor-not-allowed',
                      )}
                      aria-pressed={on}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </RefCard>

          {/* ─── Card 2: 팀 정보 ────────────────────────────────────────── */}
          <RefCard
            icon={
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="5" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.4" />
                <circle cx="11" cy="6.5" r="1.8" stroke="currentColor" strokeWidth="1.4" />
                <path
                  d="M2 13c.5-2 1.8-3 3-3s2.5 1 3 3M9 11c1 0 2 .5 2.5 2"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            }
            title="팀 정보"
            sub={MESSAGES.team.childrenAddTeamSelectHelper}
          >
            <button
              type="button"
              onClick={() => !isSubmitting && setIsTeamPickerOpen(true)}
              disabled={isSubmitting}
              className="w-full flex items-center justify-between gap-2 px-3.5 py-3 rounded-w-md bg-it-fill dark:bg-rink-900 border-[1.5px] border-it-line-strong dark:border-rink-700 text-left transition-colors motion-reduce:transition-none hover:border-it-blue-300 dark:hover:border-it-blue-500/40 disabled:opacity-60"
            >
              <span className="min-w-0">
                <span className="block text-card-meta font-bold text-it-ink-500 dark:text-wtext-4">
                  {MESSAGES.team.childrenAddTeamSelectLabel}
                </span>
                <span
                  className={cn(
                    'mt-1 block truncate',
                    selectedTeam
                      ? 'text-card-title font-extrabold text-it-ink-900 dark:text-white tracking-[-0.02em]'
                      : 'text-card-body font-semibold text-it-ink-500 dark:text-wtext-4',
                  )}
                >
                  {selectedTeam ? selectedTeam.name : MESSAGES.team.childrenAddTeamNoneOption}
                </span>
              </span>
              <span className="shrink-0 inline-flex items-center gap-1 text-card-meta font-bold text-it-blue-600 dark:text-it-blue-300">
                {selectedTeam
                  ? MESSAGES.team.childrenAddTeamChangeAction
                  : MESSAGES.team.childrenAddTeamPickAction}
                <Icon name="chevron_right" className="text-[16px]" aria-hidden="true" />
              </span>
            </button>
            {selectedTeam ? (
              <button
                type="button"
                onClick={() => setSelectedTeam(null)}
                disabled={isSubmitting}
                className="mt-2 inline-flex items-center gap-1 text-card-meta font-semibold text-it-ink-500 dark:text-wtext-4 underline disabled:opacity-60"
              >
                <Icon name="close" className="text-[14px]" aria-hidden="true" />
                {MESSAGES.team.childrenAddTeamClear}
              </button>
            ) : (
              <p className="mt-2 text-card-meta text-it-ink-500 dark:text-wtext-4">
                {MESSAGES.team.childrenAddTeamNoneHint}
              </p>
            )}
          </RefCard>


          {/* ─── Card 4: 법정대리인 동의 ──────────────────────────────── */}
          <RefCard
            icon={
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M8 2l5 2v4c0 3.2-2.4 5.2-5 6-2.6-.8-5-2.8-5-6V4l5-2z"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </svg>
            }
            title="법정대리인 동의"
            badge="*"
            sub="만 14세 미만 자녀의 개인정보 처리를 위해 법정대리인의 동의가 필요합니다."
          >
            <div className="flex flex-col gap-2.5">
              <RefCheckbox
                on={guardianConsent}
                onToggle={() => {
                  setGuardianConsent((v) => !v);
                  setConsentError('');
                }}
                disabled={isSubmitting}
                label="본인은 자녀의 법정대리인(부모 또는 후견인)임을 확인하며, 자녀의 개인정보 수집·이용에 동의합니다."
                sub="개인정보보호법 §22조의2에 따른 만 14세 미만 아동의 법정대리인 동의입니다."
              />
              <RefCheckbox
                on={childPrivacyConsent}
                onToggle={() => {
                  setChildPrivacyConsent((v) => !v);
                  setConsentError('');
                }}
                disabled={isSubmitting}
                label="자녀(만 14세 미만) 개인정보 처리방침에 동의합니다."
                sub="수집 항목: 자녀의 성명·생년월일·성별·출석기록 등"
                link={
                  <NavLink
                    href="/terms#terms-fallback-child_privacy"
                    className="text-card-meta font-extrabold text-it-ink-800 dark:text-wtext-4 underline whitespace-nowrap leading-tight"
                  >
                    자세히<br />보기
                  </NavLink>
                }
              />
            </div>

            {consentError && (
              <p className="mt-2 text-card-meta text-it-red-500 dark:text-it-red-300 inline-flex items-center gap-1.5" role="alert">
                <Icon name="error" className="text-[14px]" aria-hidden="true" />
                {consentError}
              </p>
            )}

            {/* 참고 박스 — [ICETIMES] it-fill + 1.5px it-line-strong */}
            <div className="mt-3 px-3.5 py-3 rounded-w-md bg-it-fill dark:bg-rink-900 border-[1.5px] border-it-line-strong dark:border-rink-700 text-card-meta leading-[1.55] font-medium text-it-ink-500 dark:text-wtext-4">
              <span className="font-extrabold text-it-ink-800 dark:text-wtext-4">참고:</span>{' '}
              자녀의 개인정보는 등록한 법정대리인만 조회·수정·삭제할 수 있습니다. 자녀가 만 14세가 되면 본인 동의로 자동 전환됩니다.
            </div>
          </RefCard>

          {/* ─── Bottom action: 등록하기 ────────────────────────────────
              ref: 56 height, rounded 14, bg ice500 color white, 15px font-extrabold -0.02em, mt 4, sh-blue
              (2026-05-15 재검증: ref `borderRadius: 14` 와 정확히 일치하도록 rounded-[14px] 강제. */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitDisabled}
            className={cn(
              'h-14 rounded-w-md mt-1 mx-5 text-card-title font-extrabold tracking-[-0.02em] text-white',
              'transition-all motion-reduce:transition-none',
              submitDisabled
                ? 'bg-it-ink-300 dark:bg-rink-500 cursor-not-allowed'
                : 'bg-it-blue-500 hover:bg-it-blue-600 active:brightness-95 shadow-sh-blue',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40',
            )}
            aria-label="자녀 등록하기"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <Icon name="progress_activity" className="text-[18px] animate-spin motion-reduce:animate-none" aria-hidden="true" />
                등록 중...
              </span>
            ) : (
              '등록하기'
            )}
          </button>
        </form>
      </div>
      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
      <DatePickerModal
        isOpen={isDatePickerOpen}
        value={formData.birthDate}
        maxDate={new Date()}
        ariaLabel="생년월일 선택"
        iceTheme
        onClose={() => setIsDatePickerOpen(false)}
        onSelect={(iso) => updateField('birthDate', iso)}
      />
      <TeamPickerSheet
        isOpen={isTeamPickerOpen}
        iceTheme
        onClose={() => setIsTeamPickerOpen(false)}
        onSelect={(selection: TeamPickerSelection) => {
          setSelectedTeam({ id: selection.id, name: selection.name });
          setIsTeamPickerOpen(false);
        }}
      />
    </MobileContainer>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Subcomponents — ref 1:1 매핑
 * ────────────────────────────────────────────────────────────────────────── */

function RefCard({
  icon,
  title,
  sub,
  badge,
  children,
}: {
  icon: ReactNode;
  title: string;
  sub?: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    /* [ICETIMES flat] 카드 박스(rounded-[18px] border) 제거 → full-bleed 흰 섹션.
       좌우 패딩 px-5 가 섹션 내부 정렬 담당. director-members/create 폼과 동일 언어. */
    <section className="bg-it-surface dark:bg-rink-800 px-5 pt-[18px] pb-4">
      {/* ref 헤더: gap 10 mb 6 / icon box 32×32 rounded 10 bg it-blue-50 */}
      <div className="flex items-center gap-2.5 mb-1.5">
        <div className="w-8 h-8 rounded-[10px] bg-it-blue-50 dark:bg-it-blue-500/15 grid place-items-center shrink-0 text-it-blue-600 dark:text-it-blue-300">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-card-body font-extrabold text-it-ink-900 dark:text-white tracking-[-0.02em]">
              {title}
            </span>
            {badge && (
              <span className="text-card-meta font-extrabold text-it-red-500">{badge}</span>
            )}
          </div>
          {sub && (
            <p className="mt-[3px] text-card-meta font-medium text-it-ink-500 dark:text-wtext-4">
              {sub}
            </p>
          )}
        </div>
      </div>
      {/* ref 본문 mt 12 */}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function RefLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  // [ICETIMES] 라벨 it-ink-800 / 필수표시 it-red
  return (
    <p className="text-card-meta font-bold text-it-ink-800 dark:text-wtext-4 mb-2">
      {children}
      {required && <span className="text-it-red-500 ml-[3px]">*</span>}
    </p>
  );
}

function RefInput({
  type = 'text',
  value,
  onChange,
  placeholder,
  disabled,
  error,
  maxLength,
  isNumFont,
  leadIcon,
  trailButton,
  'aria-label': ariaLabel,
}: {
  type?: 'text' | 'email' | 'password';
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  maxLength?: number;
  isNumFont?: boolean;
  leadIcon?: ReactNode;
  trailButton?: ReactNode;
  'aria-label'?: string;
}) {
  const hasValue = value.length > 0;
  return (
    /* [ICETIMES] 입력 컨테이너 it-fill + 1.5px it-line-strong, 포커스/에러 it-blue/it-red */
    <div
      className={cn(
        'h-[46px] px-3.5 rounded-w-md bg-it-fill dark:bg-rink-900 border-[1.5px] flex items-center gap-2.5',
        error ? 'border-it-red-500' : 'border-it-line-strong dark:border-rink-700',
        disabled && 'opacity-60',
      )}
    >
      {leadIcon}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        aria-label={ariaLabel}
        className={cn(
          'flex-1 bg-transparent outline-none border-0 p-0 w-full min-w-0',
          'text-card-body tracking-[-0.01em]',
          'placeholder:text-it-ink-400 placeholder:font-medium dark:placeholder:text-wtext-4/80',
          hasValue
            ? 'text-it-ink-900 dark:text-white font-bold'
            : 'text-it-ink-900 dark:text-white font-medium',
          isNumFont && hasValue && 'font-num tabular-nums',
        )}
      />
      {trailButton}
    </div>
  );
}

function RefError({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1.5 text-card-meta text-it-red-500 dark:text-it-red-300 inline-flex items-center gap-1.5" role="alert">
      <Icon name="error" className="text-[14px]" aria-hidden="true" />
      {children}
    </p>
  );
}


function RefCheckbox({
  on,
  onToggle,
  disabled,
  label,
  sub,
  link,
}: {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
  label: string;
  sub?: string;
  link?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        'px-3.5 py-3 rounded-w-md bg-it-fill dark:bg-rink-900 border-[1.5px] border-it-line-strong dark:border-rink-700',
        'flex gap-3 text-left transition-colors motion-reduce:transition-none',
        disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
      )}
      aria-pressed={on}
    >
      {/* [ICETIMES] 체크박스 20×20 / on it-blue-500 / off 흰 표면 + 1.5px it-line-strong */}
      <span
        className={cn(
          'w-5 h-5 rounded-[5px] grid place-items-center shrink-0 mt-0.5',
          on
            ? 'bg-it-blue-500'
            : 'bg-it-surface dark:bg-rink-800 border-[1.5px] border-it-line-strong dark:border-rink-700',
        )}
        aria-hidden="true"
      >
        {on && (
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M2 5.5l2 2 5-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="flex-1 min-w-0">
        {/* 라벨: [필수] it-red */}
        <span className="block text-card-meta font-bold text-it-ink-900 dark:text-white leading-[1.5] tracking-[-0.01em]">
          <span className="text-it-red-500">[필수]</span> {label}
        </span>
        {sub && (
          <span className="flex items-end gap-1.5 mt-1">
            <span className="flex-1 text-card-meta text-it-ink-500 dark:text-wtext-4 leading-[1.5]">{sub}</span>
            {link}
          </span>
        )}
      </span>
    </button>
  );
}
