/**
 * LoginFormExample — RHF + Zod 폼 마이그레이션 참조 구현 (2026-05-14)
 *
 * 본 컴포넌트는 실제 `/login` 페이지 교체용이 아니라 **패턴 참조 구현**.
 * 패키지(`react-hook-form`, `zod`, `@hookform/resolvers`) 설치 후 `npm install`
 * 완료되면 동일한 구조로 `app/(auth)/login/page.tsx` 의 로그인 폼을 교체한다.
 *
 * 핵심 패턴:
 *  1. `useForm<LoginInput>({ resolver: zodResolver(loginSchema) })`
 *  2. `register('email')` 로 input ↔ form state 자동 연결
 *  3. `formState.errors.email?.message` 로 검증 메시지 표시
 *  4. `handleSubmit(onSubmit)` 로 submit 핸들러 — onSubmit 인자는 검증 통과한 타입 안전 값
 *  5. `formState.isSubmitting` 으로 버튼 disable + loading 표시
 *
 * 백엔드 DTO 와 정합성 — `teamplus-backend/src/auth/dto/login.dto.ts` 와 동일한 규칙.
 */

"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "../schemas";

interface Props {
  onSubmit: (data: LoginInput) => Promise<void>;
}

export function LoginFormExample({ onSubmit }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-wtext-1"
        >
          이메일
        </label>
        <input
          {...register("email")}
          id="email"
          type="email"
          autoComplete="email"
          className="mt-1 w-full rounded-w-md border border-wline px-3 py-2"
        />
        {errors.email && (
          <p className="mt-1 text-sm text-flame-500">{errors.email.message}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-wtext-1"
        >
          비밀번호
        </label>
        <input
          {...register("password")}
          id="password"
          type="password"
          autoComplete="current-password"
          className="mt-1 w-full rounded-w-md border border-wline px-3 py-2"
        />
        {errors.password && (
          <p className="mt-1 text-sm text-flame-500">
            {errors.password.message}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-w-md bg-ice-500 py-2 text-white font-bold disabled:opacity-60"
      >
        {isSubmitting ? "로그인 중…" : "로그인"}
      </button>
    </form>
  );
}
