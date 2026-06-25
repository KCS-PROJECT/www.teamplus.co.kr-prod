'use client';

import { useState, useCallback, type FormEvent, type ChangeEvent } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useNavigation } from '@/components/ui/NavLink';
import { cn } from '@/lib/utils';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';

// ── 타입 정의 ──

type MemberRole = 'COACH' | 'PARENT' | 'TEEN' | 'CHILD';

const ROLE_OPTIONS: { value: MemberRole; label: string; description: string }[] = [
  { value: 'COACH', label: '코치', description: '수업 진행 및 학생 관리' },
  { value: 'PARENT', label: '학부모', description: '자녀 관리 및 수업 신청' },
  { value: 'TEEN', label: '청소년', description: '직접 수업 참여 (13세 이상)' },
  { value: 'CHILD', label: '아동', description: '수업 참여 (12세 이하)' },
];

/** 입력 필드 공통 스타일 (ICETIMES — it-fill + 1.5px it-line-strong) */
const INPUT_CLASS =
  'w-full rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-800 px-4 py-3 text-[15px] font-medium text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-wtext-3 outline-none transition-colors duration-150 ease-ios motion-reduce:transition-none focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20';

/** 유효성 검증 */
interface FormErrors {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone: string): boolean {
  const raw = phone.replace(/[^0-9]/g, '');
  return raw.length >= 10 && raw.length <= 11;
}

export default function DirectorMemberCreatePage() {
  // 인증/권한 체크는 (director)/layout.tsx 에서 단 한 번 수행됨 (중복 호출 금지)
  useNativeUI({ showStatusBar: true, showBottomNav: true });
  const { navigate, back } = useNavigation();
  const { toast } = useToast();

  usePageReady(true);

  // ── 폼 상태 ──
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<MemberRole | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [showRoleSheet, setShowRoleSheet] = useState(false);

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
    if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
  }, [errors.phone]);

  /** 실시간 유효성 검증 */
  const validateField = useCallback((field: keyof FormErrors, value: string) => {
    const newErrors: FormErrors = { ...errors };

    switch (field) {
      case 'name':
        if (!value.trim()) newErrors.name = '이름을 입력해주세요.';
        else if (value.trim().length < 2) newErrors.name = '이름은 2자 이상 입력해주세요.';
        else delete newErrors.name;
        break;
      case 'email':
        if (!value.trim()) newErrors.email = '이메일을 입력해주세요.';
        else if (!validateEmail(value)) newErrors.email = '올바른 이메일 형식을 입력해주세요.';
        else delete newErrors.email;
        break;
      case 'phone':
        if (!value.trim()) newErrors.phone = '연락처를 입력해주세요.';
        else if (!validatePhone(value)) newErrors.phone = '올바른 전화번호를 입력해주세요.';
        else delete newErrors.phone;
        break;
      case 'role':
        if (!value) newErrors.role = '역할을 선택해주세요.';
        else delete newErrors.role;
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [errors]);

  /** 전체 폼 유효성 검증 */
  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    if (!name.trim()) newErrors.name = '이름을 입력해주세요.';
    else if (name.trim().length < 2) newErrors.name = '이름은 2자 이상 입력해주세요.';

    if (!email.trim()) newErrors.email = '이메일을 입력해주세요.';
    else if (!validateEmail(email)) newErrors.email = '올바른 이메일 형식을 입력해주세요.';

    if (!phone.trim()) newErrors.phone = '연락처를 입력해주세요.';
    else if (!validatePhone(phone)) newErrors.phone = '올바른 전화번호를 입력해주세요.';

    if (!role) newErrors.role = '역할을 선택해주세요.';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, email, phone, role]);

  /** 제출 가능 여부 */
  const isFormValid = name.trim().length >= 2 && validateEmail(email) && validatePhone(phone) && role !== '';

  /** 폼 제출 */
  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!validateForm() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const payload = {
        name: name.trim(),
        email: email.trim(),
        phone: phone.replace(/-/g, ''),
        role,
      };
      const res = await api.post('/members', payload);

      if (res.success) {
        toast.success(MESSAGES.save.success);
        navigate('/director-members');
      } else {
        const msg = res.error?.message || MESSAGES.save.error;
        setErrorMessage(msg);
      }
    } catch {
      setErrorMessage(MESSAGES.save.error);
    } finally {
      setIsSubmitting(false);
    }
  }, [validateForm, isSubmitting, name, email, phone, role, toast, navigate]);

  return (
    <>
      <MobileContainer hasBottomNav>
        <PageAppBar title="회원 등록" onBack={back} forceNative />

        <main className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck" role="main" aria-label="회원 등록">
          {/* 타이틀 영역 — flat 흰 섹션 */}
          <section className="bg-it-surface dark:bg-rink-800 px-5 pt-6 pb-5" aria-label="회원 등록 안내">
            <div className="flex items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-w-md bg-it-blue-50 dark:bg-it-blue-900/30">
                <Icon name="person_add" className="text-[22px] text-it-blue-500" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-[22px] font-extrabold tracking-[-0.01em] text-it-ink-800 dark:text-white">신규 회원 등록</h2>
                <p className="mt-1 text-card-body text-it-ink-500 dark:text-wtext-4">
                  새로운 회원의 정보를 입력해주세요.
                </p>
              </div>
            </div>
          </section>

          {/* flat 섹션 사이 8px 회색 갭 */}
          <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

          {/* 에러 배너 */}
          {errorMessage && (
            <div
              role="alert"
              className="mx-5 mb-2 flex items-start gap-3 rounded-w-md border-[1.5px] border-it-red-500/30 bg-it-red-500/10 p-4"
            >
              <Icon
                name="error"
                className="mt-0.5 shrink-0 text-xl text-it-red-500"
                aria-hidden="true"
              />
              <p className="text-card-body font-medium text-it-red-500">{errorMessage}</p>
            </div>
          )}

          {/* 폼 — flat 흰 섹션 (카드 박스 제거) */}
          <form onSubmit={handleSubmit} noValidate>
            <div className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-6 space-y-6">
              {/* 그룹: 기본 정보 */}
              <div>
                <h3 className="mb-4 flex items-center gap-2 text-card-meta font-bold uppercase tracking-wider text-it-ink-400 dark:text-wtext-4">
                  <Icon name="badge" className="text-[14px]" aria-hidden="true" />
                  기본 정보
                </h3>
                <div className="space-y-4">
                  {/* 이름 */}
                  <div>
                    <label htmlFor="member-name" className="mb-1.5 block text-card-body font-bold text-it-ink-800 dark:text-white">
                      이름 <span className="text-it-red-500" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="member-name"
                      type="text"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (errors.name) validateField('name', e.target.value);
                      }}
                      onBlur={(e) => validateField('name', e.target.value)}
                      placeholder={MESSAGES.placeholders.enterFullName}
                      className={cn(INPUT_CLASS, errors.name && 'border-it-red-500 dark:border-it-red-500 focus:border-it-red-500 focus:ring-it-red-500/20')}
                      autoComplete="name"
                      required
                      aria-required="true"
                      aria-invalid={!!errors.name}
                      aria-describedby={errors.name ? 'name-error' : undefined}
                    />
                    {errors.name && (
                      <p id="name-error" className="mt-1.5 flex items-center gap-1 text-card-meta font-medium text-it-red-500">
                        <Icon name="error" className="text-[14px]" aria-hidden="true" />
                        {errors.name}
                      </p>
                    )}
                  </div>

                  {/* 역할 선택 */}
                  <div>
                    <label className="mb-1.5 block text-card-body font-bold text-it-ink-800 dark:text-white">
                      역할 <span className="text-it-red-500" aria-hidden="true">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowRoleSheet(true)}
                      className={cn(
                        INPUT_CLASS,
                        'flex h-12 items-center justify-between text-left',
                        errors.role && 'border-it-red-500 dark:border-it-red-500',
                      )}
                      aria-expanded={showRoleSheet}
                      aria-haspopup="dialog"
                      aria-describedby={errors.role ? 'role-error' : undefined}
                    >
                      <span className={role ? '' : 'text-it-ink-400 dark:text-wtext-4'}>
                        {role
                          ? ROLE_OPTIONS.find((o) => o.value === role)?.label ?? '역할을 선택하세요'
                          : '역할을 선택하세요'}
                      </span>
                      <Icon name="expand_more" className="text-xl text-it-ink-400 dark:text-wtext-4" aria-hidden="true" />
                    </button>
                    {errors.role && (
                      <p id="role-error" className="mt-1.5 flex items-center gap-1 text-card-meta font-medium text-it-red-500">
                        <Icon name="error" className="text-[14px]" aria-hidden="true" />
                        {errors.role}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* 구분선 */}
              <div className="h-px bg-it-line dark:bg-rink-700" aria-hidden="true" />

              {/* 그룹: 연락처 */}
              <div>
                <h3 className="mb-4 flex items-center gap-2 text-card-meta font-bold uppercase tracking-wider text-it-ink-400 dark:text-wtext-4">
                  <Icon name="contact_mail" className="text-[14px]" aria-hidden="true" />
                  연락처 정보
                </h3>
                <div className="space-y-4">
                  {/* 이메일 */}
                  <div>
                    <label htmlFor="member-email" className="mb-1.5 block text-card-body font-bold text-it-ink-800 dark:text-white">
                      이메일 <span className="text-it-red-500" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="member-email"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (errors.email) validateField('email', e.target.value);
                      }}
                      onBlur={(e) => validateField('email', e.target.value)}
                      placeholder="example@email.com"
                      className={cn(INPUT_CLASS, errors.email && 'border-it-red-500 dark:border-it-red-500 focus:border-it-red-500 focus:ring-it-red-500/20')}
                      autoComplete="email"
                      required
                      aria-required="true"
                      aria-invalid={!!errors.email}
                      aria-describedby={errors.email ? 'email-error' : undefined}
                    />
                    {errors.email && (
                      <p id="email-error" className="mt-1.5 flex items-center gap-1 text-card-meta font-medium text-it-red-500">
                        <Icon name="error" className="text-[14px]" aria-hidden="true" />
                        {errors.email}
                      </p>
                    )}
                  </div>

                  {/* 연락처 */}
                  <div>
                    <label htmlFor="member-phone" className="mb-1.5 block text-card-body font-bold text-it-ink-800 dark:text-white">
                      연락처 <span className="text-it-red-500" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="member-phone"
                      type="tel"
                      value={phone}
                      onChange={handlePhoneChange}
                      onBlur={(e) => validateField('phone', e.target.value)}
                      placeholder="010-0000-0000"
                      className={cn(INPUT_CLASS, errors.phone && 'border-it-red-500 dark:border-it-red-500 focus:border-it-red-500 focus:ring-it-red-500/20')}
                      inputMode="numeric"
                      autoComplete="tel"
                      required
                      aria-required="true"
                      aria-invalid={!!errors.phone}
                      aria-describedby={errors.phone ? 'phone-error' : undefined}
                    />
                    {errors.phone && (
                      <p id="phone-error" className="mt-1.5 flex items-center gap-1 text-card-meta font-medium text-it-red-500">
                        <Icon name="error" className="text-[14px]" aria-hidden="true" />
                        {errors.phone}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 하단 액션 */}
            <div className="mt-2 flex gap-3 px-5 pt-4">
              <button
                type="button"
                onClick={() => back()}
                disabled={isSubmitting}
                className="h-12 flex-1 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 text-card-body font-bold text-it-ink-800 dark:text-white transition-colors motion-reduce:transition-none hover:bg-it-fill dark:hover:bg-rink-700 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={!isFormValid || isSubmitting}
                className="inline-flex h-12 flex-[2] items-center justify-center gap-2 rounded-w-md bg-it-blue-500 text-card-body font-bold text-white transition-colors motion-reduce:transition-none hover:bg-it-blue-600 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="person_add" className="text-[18px]" aria-hidden="true" />
                <span>{isSubmitting ? MESSAGES.common.saving : '등록하기'}</span>
              </button>
            </div>
          </form>

          {/* BottomNav 여백 */}
          <div className="h-32 bg-it-canvas dark:bg-puck" aria-hidden="true" />
        </main>
      </MobileContainer>

      {/* 역할 선택 바텀시트 */}
      {showRoleSheet && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center" role="dialog" aria-modal="true" aria-label="역할 선택">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowRoleSheet(false)}
          />
          <div className="relative w-full max-w-md bg-it-surface dark:bg-rink-800 rounded-t-3xl shadow-md pb-10">
            {/* 핸들 */}
            <div className="flex justify-center pt-4 pb-3">
              <div className="w-12 h-1.5 rounded-w-pill bg-it-line-strong dark:bg-rink-500" />
            </div>
            {/* 헤더 */}
            <div className="flex items-center justify-between px-6 pb-4">
              <h3 className="text-card-title font-bold text-it-ink-800 dark:text-white">역할 선택</h3>
              <button
                onClick={() => setShowRoleSheet(false)}
                className="flex size-9 items-center justify-center rounded-w-pill hover:bg-it-line dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none"
                aria-label="닫기"
              >
                <Icon name="close" className="text-2xl text-it-ink-400 dark:text-wtext-4" aria-hidden="true" />
              </button>
            </div>
            {/* 구분선 */}
            <div className="h-px bg-it-line dark:bg-rink-700 mx-6" />
            {/* 역할 옵션 목록 */}
            <div className="py-2 px-2">
              {ROLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setRole(opt.value);
                    setShowRoleSheet(false);
                    if (errors.role) validateField('role', opt.value);
                  }}
                  className={`flex w-full items-center justify-between px-4 py-4 rounded-w-md text-left transition-colors motion-reduce:transition-none active:bg-it-line dark:active:bg-rink-700 ${
                    role === opt.value
                      ? 'bg-it-blue-50 dark:bg-it-blue-900/30'
                      : 'hover:bg-it-fill dark:hover:bg-rink-700/50'
                  }`}
                >
                  <div className="flex flex-col">
                    <span className={`text-card-title ${
                      role === opt.value
                        ? 'text-it-blue-500 font-bold'
                        : 'text-it-ink-800 dark:text-white font-medium'
                    }`}>
                      {opt.label}
                    </span>
                    <span className="text-card-meta text-it-ink-500 dark:text-wtext-4 mt-0.5">
                      {opt.description}
                    </span>
                  </div>
                  {role === opt.value && (
                    <Icon name="check_circle" className="text-2xl text-it-blue-500 shrink-0" aria-hidden="true" />
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
