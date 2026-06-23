# Validation — Zod + React Hook Form

TEAMPLUS Web 의 폼 검증 SoT. 모든 신규/리팩토링 폼은 다음 패턴을 따른다.

---

## 1. 패키지 의존성

```bash
# 패키지 설치 (이미 package.json 에 등록됨)
npm install
```

추가된 의존성 (`package.json`):

- `react-hook-form ^7.54.0` — 폼 상태 관리
- `zod ^3.24.0` — 스키마 기반 검증
- `@hookform/resolvers ^3.10.0` — RHF ↔ Zod 어댑터

---

## 2. 기본 사용 패턴

```tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@/lib/validation/schemas";

export function LoginForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: LoginInput) => {
    // data.email / data.password 는 검증 통과한 타입 안전 값
    await authService.login(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register("email")} type="email" />
      {errors.email && <p>{errors.email.message}</p>}

      <input {...register("password")} type="password" />
      {errors.password && <p>{errors.password.message}</p>}

      <button type="submit" disabled={isSubmitting}>
        로그인
      </button>
    </form>
  );
}
```

---

## 3. 제공되는 스키마

| 스키마                  | 용도                       | 위치         |
| ----------------------- | -------------------------- | ------------ |
| `loginSchema`           | 로그인 (이메일 + 비밀번호) | `schemas.ts` |
| `signupSchema`          | 회원가입 (학부모/코치)     | `schemas.ts` |
| `paymentCheckoutSchema` | 결제 체크아웃              | `schemas.ts` |
| `addChildSchema`        | 자녀 추가                  | `schemas.ts` |
| `passwordResetSchema`   | 비밀번호 재설정            | `schemas.ts` |
| `feedbackSchema`        | 피드백 작성                | `schemas.ts` |

---

## 4. 공통 primitives

| 이름                     | 검증                              |
| ------------------------ | --------------------------------- |
| `phoneSchema`            | 010-XXXX-XXXX 또는 11자리 숫자    |
| `emailSchema`            | RFC 5322 단순 검증                |
| `passwordSchema`         | 8자+ / 영문+숫자+특수문자 각 1개+ |
| `passwordRequiredSchema` | 비어있지 않음 (로그인용)          |
| `nameSchema`             | 2-30자                            |

---

## 5. 단계적 마이그레이션 계획

### Phase 1 (현재) — 가장 위험도 높은 폼

- [ ] `/login` — 로그인 (브루트포스/SQL injection 방지)
- [ ] `/signup` — 회원가입 (개인정보 입력)
- [ ] `/payment/checkout` — 결제 (금전 거래)

### Phase 2 (1개월)

- [ ] `/children/add`, `/children/[id]/edit` — 자녀 추가/수정
- [ ] `/find-id`, `/find-password` — 비밀번호 재설정
- [ ] `/profile/edit`, `/profile/password` — 프로필 편집
- [ ] `/feedback` — 피드백 작성

### Phase 3 (3개월)

- [ ] 나머지 모든 폼 (코치/관리자 UI 포함)

---

## 6. 백엔드 DTO 와의 정합성

Backend NestJS DTO 는 `class-validator` 사용 (`@IsEmail`, `@MinLength` 등).
Frontend Zod 스키마와 **반드시 동일한 규칙** 적용:

| 필드            | Backend (`@IsX`)                        | Frontend (Zod)                        |
| --------------- | --------------------------------------- | ------------------------------------- |
| email           | `@IsEmail()`                            | `.email()`                            |
| phone           | `@Matches(/^01[0-9]-?\d{3,4}-?\d{4}$/)` | `.regex(/^01[0-9]-?\d{3,4}-?\d{4}$/)` |
| password (신규) | `@MinLength(8)` + 특수 정책             | `.min(8).regex(...)`                  |
| name            | `@MinLength(2) @MaxLength(30)`          | `.min(2).max(30)`                     |

규칙 불일치 시: Backend ValidationPipe 가 400 응답 → 클라이언트 토스트 표시 → UX 저하.
**스키마 변경 시 Backend DTO 도 함께 갱신** 후 PR.

---

## 7. 에러 메시지 정책

- 한국어 존댓말 사용 ("입력해주세요", "올바른 형식이 아닙니다")
- 사용자가 어떻게 수정해야 할지 명확히 안내
- 보안 정보는 노출하지 않음 (예: "이메일이 존재하지 않습니다" → "이메일 또는 비밀번호가 일치하지 않습니다")

---

## 8. 검증

```bash
cd teamplus-web
npx tsc --noEmit   # 타입 안전성 확인
npm test           # zod 스키마 단위 테스트 (별도 PR 에서 추가 예정)
```

---

**Last Updated**: 2026-05-14 (Phase D-2 — RHF/Zod 재도입)
**Related**: `src/lib/messages.ts` (UI 메시지 SoT), `teamplus-backend/src/**/dto/*.dto.ts` (Backend DTO)
