/**
 * Zod 스키마 SoT — 폼 검증 (2026-05-14 D-2 도입).
 *
 * `react-hook-form` + `@hookform/resolvers/zod` 와 함께 사용:
 *
 * @example
 *   import { useForm } from 'react-hook-form';
 *   import { zodResolver } from '@hookform/resolvers/zod';
 *   import { loginSchema, type LoginInput } from '@/lib/validation/schemas';
 *
 *   const { register, handleSubmit, formState: { errors } } = useForm<LoginInput>({
 *     resolver: zodResolver(loginSchema),
 *   });
 *
 * 메시지는 `@/lib/messages` 를 SoT 로 활용. 단 zod 스키마는 import 시점에 평가되므로
 * 메시지가 동적인 경우 z.string({ message: () => MESSAGES.xxx }) 패턴 사용.
 */

import { z } from 'zod';

// ────────────────────────────────────────────────
// 공통 primitives
// ────────────────────────────────────────────────

/** 한국 휴대폰 번호 (010-XXXX-XXXX 또는 01012345678). 11자리 숫자만 허용. */
export const phoneSchema = z
  .string({ message: '휴대폰 번호를 입력해주세요.' })
  .min(1, '휴대폰 번호를 입력해주세요.')
  .regex(/^01[0-9]-?\d{3,4}-?\d{4}$/, '올바른 휴대폰 번호 형식이 아닙니다.');

/** 이메일 (RFC 5322 단순 검증). */
export const emailSchema = z
  .string({ message: '이메일을 입력해주세요.' })
  .min(1, '이메일을 입력해주세요.')
  .email('올바른 이메일 형식이 아닙니다.');

/**
 * 비밀번호 정책 — 최소 8자, 영문 + 숫자 + 특수문자 각 1개 이상.
 * 회원가입·비밀번호 변경에 사용. 로그인은 단순 비어있지 않음만 검증 (passwordRequired).
 */
export const passwordSchema = z
  .string()
  .min(8, '비밀번호는 8자 이상이어야 합니다.')
  .regex(/[A-Za-z]/, '비밀번호는 영문을 1자 이상 포함해야 합니다.')
  .regex(/[0-9]/, '비밀번호는 숫자를 1자 이상 포함해야 합니다.')
  .regex(/[^A-Za-z0-9]/, '비밀번호는 특수문자를 1자 이상 포함해야 합니다.');

export const passwordRequiredSchema = z
  .string({ message: '비밀번호를 입력해주세요.' })
  .min(1, '비밀번호를 입력해주세요.');

/** 한국어 이름 — 한글/영문 2-30자. */
export const nameSchema = z
  .string({ message: '이름을 입력해주세요.' })
  .min(2, '이름은 2자 이상이어야 합니다.')
  .max(30, '이름은 30자 이하여야 합니다.');

// ────────────────────────────────────────────────
// 도메인 스키마
// ────────────────────────────────────────────────

/**
 * 로그인 ID — 형식 무검증(비어있지 않음만). 이메일을 일반 ID로 전환하면서
 * 기존 이메일 형식 ID 와 신규 일반 ID 가 모두 로그인 가능해야 하므로 형식을 강제하지 않는다.
 */
export const loginIdSchema = z
  .string({ message: '아이디를 입력해주세요.' })
  .min(1, '아이디를 입력해주세요.');

/** 로그인 — 아이디 + 비밀번호. 비밀번호 정책은 회원가입에서만 검증. */
export const loginSchema = z.object({
  email: loginIdSchema,
  password: passwordRequiredSchema,
});
export type LoginInput = z.infer<typeof loginSchema>;

/** 회원가입 (학부모/코치) — 이메일·비밀번호·이름·휴대폰. 약관 동의 필수. */
export const signupSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    passwordConfirm: passwordRequiredSchema,
    name: nameSchema,
    phone: phoneSchema,
    agreeTerms: z.literal<boolean>(true, {
      message: '필수 약관에 동의해주세요.',
    }),
    agreePrivacy: z.literal<boolean>(true, {
      message: '개인정보 처리방침에 동의해주세요.',
    }),
    agreeMarketing: z.boolean().optional(),
  })
  .refine(
    (data: { password: string; passwordConfirm: string }) =>
      data.password === data.passwordConfirm,
    {
      message: '비밀번호가 일치하지 않습니다.',
      path: ['passwordConfirm'],
    },
  );
export type SignupInput = z.infer<typeof signupSchema>;

/** 결제 체크아웃 — 결제수단 + 약관 동의. PG 토큰화로 카드번호는 서버 미전송. */
export const paymentCheckoutSchema = z.object({
  paymentMethod: z.enum(['CARD', 'KAKAO_PAY', 'NAVER_PAY', 'SAMSUNG_PAY'], {
    message: '결제 수단을 선택해주세요.',
  }),
  agreePurchase: z.literal<boolean>(true, {
    message: '구매조건 확인 및 결제 동의가 필요합니다.',
  }),
  installmentMonths: z
    .number()
    .int()
    .min(0)
    .max(24)
    .optional()
    .default(0),
});
export type PaymentCheckoutInput = z.infer<typeof paymentCheckoutSchema>;

/** 자녀 추가 — 이름·생년월일(YYYY-MM-DD)·성별·관계. */
export const addChildSchema = z.object({
  name: nameSchema,
  birthDate: z
    .string({ message: '생년월일을 선택해주세요.' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식: YYYY-MM-DD'),
  gender: z.enum(['M', 'F'], { message: '성별을 선택해주세요.' }),
  relationship: z.enum(['son', 'daughter', 'other'], {
    message: '관계를 선택해주세요.',
  }),
});
export type AddChildInput = z.infer<typeof addChildSchema>;

/** 비밀번호 재설정. */
export const passwordResetSchema = z
  .object({
    newPassword: passwordSchema,
    newPasswordConfirm: passwordRequiredSchema,
  })
  .refine(
    (d: { newPassword: string; newPasswordConfirm: string }) =>
      d.newPassword === d.newPasswordConfirm,
    {
      message: '비밀번호가 일치하지 않습니다.',
      path: ['newPasswordConfirm'],
    },
  );
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;

/** 피드백 작성. */
export const feedbackSchema = z.object({
  category: z.enum(['bug', 'improvement', 'question', 'other'], {
    message: '카테고리를 선택해주세요.',
  }),
  content: z
    .string({ message: '내용을 입력해주세요.' })
    .min(10, '10자 이상 입력해주세요.')
    .max(2000, '2000자 이하로 입력해주세요.'),
  rating: z.number().int().min(1).max(5).optional(),
});
export type FeedbackInput = z.infer<typeof feedbackSchema>;
