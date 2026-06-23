'use client';

import { useId, useState, type FormEvent } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { useNavigation } from '@/components/ui/NavLink';
import { useToast } from '@/components/ui/Toast';
import { usePageReady } from '@/hooks/usePageReady';
import { MESSAGES } from '@/lib/messages';

type RoleKey = 'PLAYER' | 'PARENT' | 'COACH';

const ROLE_OPTIONS: Array<{
  key: RoleKey;
  label: string;
  icon: string;
  description: string;
}> = [
  {
    key: 'PLAYER',
    label: '선수',
    icon: 'sports_hockey',
    description: '수업 참여',
  },
  {
    key: 'PARENT',
    label: '학부모',
    icon: 'family_restroom',
    description: '자녀 관리',
  },
  {
    key: 'COACH',
    label: '코치',
    icon: 'supervisor_account',
    description: '수업 운영',
  },
];

export default function MemberCreatePage() {
  const { back } = useNavigation();
  const { toast } = useToast();
  const nameId = useId();
  const phoneId = useId();
  const emailId = useId();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<RoleKey>('PLAYER');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; phone?: string; email?: string }>({});

  usePageReady(true);

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!name.trim()) {
      next.name = '이름을 입력해주세요.';
    } else if (name.trim().length < 2) {
      next.name = '이름은 2자 이상 입력해주세요.';
    }
    if (!phone.trim()) {
      next.phone = '연락처를 입력해주세요.';
    } else if (!/^01[0-9]-?\d{3,4}-?\d{4}$/.test(phone.replace(/\s/g, ''))) {
      next.phone = '올바른 전화번호 형식을 입력해주세요.';
    }
    if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      next.email = '올바른 이메일 형식을 입력해주세요.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      // NOTE: 실제 API 연동 시 /admin/users POST 호출 예정.
      // 현재 UI 디자인 개선 단계이므로 기존 기능 로직 범위 유지.
      toast.success(MESSAGES.save.success);
      back();
    } catch {
      toast.error(MESSAGES.save.error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (name || phone || email) {
      const ok = window.confirm(MESSAGES.formCancel.confirmDiscard);
      if (!ok) return;
    }
    back();
  };

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar title="회원 등록" />

      {/* Body */}
      <main className="flex-1 overflow-y-auto bg-wbg dark:bg-rink-900 pb-28 hide-scrollbar">
        <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto p-5 space-y-5" noValidate>
          {/* ─── Hero ──────────────────────────────────── */}
          <section className="pt-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ice-500 mb-1.5">
              New Member
            </p>
            <h2 className="text-2xl font-black tracking-tight text-wtext-1 dark:text-white leading-tight">
              새 회원을 등록해주세요.
            </h2>
            <p className="mt-2 text-card-body text-wtext-3 dark:text-rink-300">
              등록된 정보는 언제든 수정할 수 있습니다.
            </p>
          </section>

          {/* ─── 기본 정보 ───────────────────────────── */}
          <section
            className="rounded-2xl border border-wline-2 dark:border-rink-700 bg-white dark:bg-rink-800 p-5 shadow-sm"
            aria-labelledby="section-basic"
          >
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ice-500/10 text-ice-500">
                <Icon name="person" className="text-card-title" aria-hidden="true" />
              </div>
              <h3
                id="section-basic"
                className="text-card-body font-bold text-wtext-1 dark:text-white"
              >
                기본 정보
              </h3>
            </div>

            <div className="space-y-4">
              {/* 이름 */}
              <div className="space-y-1.5">
                <label
                  htmlFor={nameId}
                  className="block text-card-body font-semibold text-wtext-2 dark:text-rink-100"
                >
                  이름 <span className="text-red-500">*</span>
                </label>
                <input
                  id={nameId}
                  name="name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setErrors((p) => ({ ...p, name: undefined }));
                  }}
                  placeholder="홍길동"
                  required
                  aria-required="true"
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? `${nameId}-err` : undefined}
                  className={`h-12 w-full rounded-xl border bg-white dark:bg-rink-900 px-4 text-card-body text-wtext-1 dark:text-white placeholder-wtext-3 dark:placeholder-rink-300 transition-colors motion-reduce:transition-none focus:outline-none focus:ring-2 focus:ring-ice-500/30 ${
                    errors.name
                      ? 'border-red-300 focus:border-red-500 dark:border-red-700'
                      : 'border-wline dark:border-rink-700 focus:border-ice-500'
                  }`}
                />
                {errors.name && (
                  <p
                    id={`${nameId}-err`}
                    className="flex items-center gap-1 text-card-meta font-medium text-red-600 dark:text-red-400"
                  >
                    <Icon name="error" className="text-[14px]" aria-hidden="true" />
                    {errors.name}
                  </p>
                )}
              </div>

              {/* 연락처 */}
              <div className="space-y-1.5">
                <label
                  htmlFor={phoneId}
                  className="block text-card-body font-semibold text-wtext-2 dark:text-rink-100"
                >
                  연락처 <span className="text-red-500">*</span>
                </label>
                <input
                  id={phoneId}
                  name="tel"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (errors.phone) setErrors((p) => ({ ...p, phone: undefined }));
                  }}
                  placeholder="010-0000-0000"
                  required
                  aria-required="true"
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={errors.phone ? `${phoneId}-err` : undefined}
                  className={`h-12 w-full rounded-xl border bg-white dark:bg-rink-900 px-4 text-card-body text-wtext-1 dark:text-white placeholder-wtext-3 dark:placeholder-rink-300 tabular-nums transition-colors motion-reduce:transition-none focus:outline-none focus:ring-2 focus:ring-ice-500/30 ${
                    errors.phone
                      ? 'border-red-300 focus:border-red-500 dark:border-red-700'
                      : 'border-wline dark:border-rink-700 focus:border-ice-500'
                  }`}
                />
                {errors.phone && (
                  <p
                    id={`${phoneId}-err`}
                    className="flex items-center gap-1 text-card-meta font-medium text-red-600 dark:text-red-400"
                  >
                    <Icon name="error" className="text-[14px]" aria-hidden="true" />
                    {errors.phone}
                  </p>
                )}
              </div>

              {/* 이메일 */}
              <div className="space-y-1.5">
                <label
                  htmlFor={emailId}
                  className="block text-card-body font-semibold text-wtext-2 dark:text-rink-100"
                >
                  이메일 <span className="text-wtext-3 font-normal">(선택)</span>
                </label>
                <input
                  id={emailId}
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
                  }}
                  placeholder="example@teamplus.com"
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? `${emailId}-err` : undefined}
                  className={`h-12 w-full rounded-xl border bg-white dark:bg-rink-900 px-4 text-card-body text-wtext-1 dark:text-white placeholder-wtext-3 dark:placeholder-rink-300 transition-colors motion-reduce:transition-none focus:outline-none focus:ring-2 focus:ring-ice-500/30 ${
                    errors.email
                      ? 'border-red-300 focus:border-red-500 dark:border-red-700'
                      : 'border-wline dark:border-rink-700 focus:border-ice-500'
                  }`}
                />
                {errors.email && (
                  <p
                    id={`${emailId}-err`}
                    className="flex items-center gap-1 text-card-meta font-medium text-red-600 dark:text-red-400"
                  >
                    <Icon name="error" className="text-[14px]" aria-hidden="true" />
                    {errors.email}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* ─── 역할 선택 ───────────────────────────── */}
          <section
            className="rounded-2xl border border-wline-2 dark:border-rink-700 bg-white dark:bg-rink-800 p-5 shadow-sm"
            aria-labelledby="section-role"
          >
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ice-500/10 text-ice-500">
                <Icon name="badge" className="text-card-title" aria-hidden="true" />
              </div>
              <h3
                id="section-role"
                className="text-card-body font-bold text-wtext-1 dark:text-white"
              >
                역할 선택
              </h3>
            </div>

            <div
              role="radiogroup"
              aria-labelledby="section-role"
              className="grid grid-cols-3 gap-2"
            >
              {ROLE_OPTIONS.map((option) => {
                const active = role === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setRole(option.key)}
                    className={`flex min-h-[88px] flex-col items-center justify-center gap-1 rounded-xl border p-3 text-center transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-800 ${
                      active
                        ? 'border-ice-500 bg-ice-500/5 text-ice-500 dark:bg-ice-500/10'
                        : 'border-wline dark:border-rink-700 bg-white dark:bg-rink-900 text-wtext-2 dark:text-rink-100 hover:bg-wbg dark:hover:bg-rink-700 active:brightness-95'
                    }`}
                  >
                    <Icon
                      name={option.icon}
                      className={`text-2xl ${active ? 'text-ice-500' : 'text-wtext-3'}`}
                      aria-hidden="true"
                    />
                    <span className="text-card-body font-bold">{option.label}</span>
                    <span
                      className={`text-[11px] font-medium ${
                        active
                          ? 'text-ice-500/80 dark:text-ice-500'
                          : 'text-wtext-3 dark:text-rink-300'
                      }`}
                    >
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ─── 액션 버튼 ───────────────────────────── */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={handleCancel}
              className="flex-1"
            >
              {MESSAGES.common.cancel}
            </Button>
            <Button
              type="submit"
              size="lg"
              loading={isSubmitting}
              disabled={isSubmitting}
              className="flex-[2]"
            >
              등록하기
            </Button>
          </div>
        </form>
      </main>
    </MobileContainer>
  );
}
