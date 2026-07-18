# TEAMPLUS Admin 에러 문서

> **프로젝트**: teamplus-admin (Next.js 14)
> **최종 업데이트**: 2026-07-18 (ADMIN-022 추가)
> **총 이슈**: 22개 (실측 `## ADMIN-N` 기준, ADMIN-001~022 · ADMIN-SEC-001은 별도 prefix라 카운트 제외)

---

## 📊 이슈 현황

| 심각도       | 개수 | 상태                                        |
| ------------ | ---- | ------------------------------------------- |
| 🔴 Critical  | 4    | 일부 해결 (ADMIN-019 XSS 3건 fix 완료 포함) |
| 🟠 High      | 7    | 일부 해결 (ADMIN-021·022 fix 완료 포함)     |
| 🟡 Medium    | 4    | 미해결                                      |
| 🟢 Low       | 2    | 미해결                                      |
| 🔵 Info/참고 | 6    | 문서화 완료                                 |

---

---

        [Admin] 작성 2026.07.18. 18:56:32

---

### ADMIN-022: prod Jenkins 배포 실패 — ESLint error 32건 + 잠복 타입 에러 2건

| 항목            | 내용                                                                                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **파일**        | `src/app/api/log/route.ts` · `src/app/dashboard/{app/feedback,attendance/statistics,matches,tournaments}/page.tsx` · `src/app/dashboard/shop/products/{new,[id]/edit}/page.tsx` · `src/components/shop/ProductDetailTab.tsx` · `src/lib/server-log/server-logger.ts` · `src/lib/activity-collector.ts` (총 10개) |
| **오류 메시지** | Jenkins `Admin - Install & Build (prod)` 스테이지: `Failed to compile.` — `@typescript-eslint/no-unused-vars` 29건 + `@typescript-eslint/no-explicit-any` 2건 (route.ts). lint 수정 후 잠복 타입 에러 표면화: `activity-collector.ts(71): 'ts' is specified more than once` (TS2783) · `server-logger.ts(123): Spread types may only be created from object types` (TS2698) |
| **원인 분석**   | ① admin `.eslintrc.json`은 `no-unused-vars`를 **error**로 강제 (web은 warning) — dev 환경에서는 `next dev`만 사용해 lint가 빌드 게이트로 동작하지 않아 미사용 import/변수가 누적. PR #45 머지로 prod Jenkins가 `next build`를 실행하며 최초 표면화. ② lint 실패가 "Linting and checking validity of types" 단계를 조기 중단시켜 **타입 에러 2건이 가려져 있었음** — lint만 고치면 다음 빌드에서 재실패하는 구조. ③ `server-logger.ts`의 TS2698은 web 버전(`...(sanitize(payload) as Record<string, unknown>)`)에는 이미 수정돼 있던 것이 admin 복사본에만 남은 부분 동기화 드리프트. |
| **심각도**      | 🟠 High (prod 배포 전면 차단)                                                                                                                                                                     |
| **상태**        | ✅ 수정 완료 (2026-07-18) — dev·prod 저장소 양쪽 반영, 로컬 `npm run build` 통과 확인                                                                                                             |

**잘못된 코드 예시**:

```typescript
// route.ts — any 캐스트
serverLogger.access((ev.level as any) ?? "info", ...);

// activity-collector.ts — spread가 뒤에 있어 기본값이 무의미 (TS2783)
const enriched: ActivityEvent = {
  ts: event.ts ?? new Date().toISOString(),
  ...event,
};

// server-logger.ts — unknown 반환값 spread (TS2698)
const entry = { level, ..., ...sanitize(payload) };
```

**올바른 코드 예시**:

```typescript
// route.ts — file-path.util의 LogLevel 타입 import
import type { LogLevel } from "@/lib/server-log/file-path.util";
serverLogger.access((ev.level as LogLevel) ?? "info", ...);

// activity-collector.ts — spread 먼저, 기본값 보강 나중 (의도대로 동작)
const enriched: ActivityEvent = {
  ...event,
  ts: event.ts ?? new Date().toISOString(),
};

// server-logger.ts — web 버전과 동일한 캐스트
const entry = { level, ..., ...(sanitize(payload) as Record<string, unknown>) };
```

**예방 가이드**:

1. admin 파일 작업 후 `npx next lint` 실행 — admin은 web과 달리 unused-vars가 **error**라 빌드가 차단됨
2. prod 반영(운영반영) 전 로컬에서 `npm run build` 1회 실행 — lint 게이트 + 타입 체크를 Jenkins 이전에 통과 확인
3. lint 실패 로그를 볼 때는 **타입 체크가 아직 실행되지 않았음**을 인지 — lint 수정 후 반드시 재빌드로 잠복 타입 에러 확인
4. web ↔ admin 간 복사된 파일(`server-log/*`, `activity-collector.ts`)은 수정 시 양쪽 동기화 여부 확인 ([prod-sync-drift-playbook 참조](../../Guides/CLAUDE_STATUS.md))

        [Admin] 작성 2026.05.18. 23:30:00

---

### ADMIN-021: 공지사항 등록 시 400 "입력값 검증에 실패했습니다"

| 항목            | 내용                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **파일**        | **(주)** `teamplus-admin/src/app/dashboard/app/notices/page.tsx` (`NoticeManagementPage`) — 실제 라우팅 페이지<br>**(부)** `teamplus-admin/src/app/dashboard/notices/page.tsx` (`NoticesPage`) — 별도 라우트, 동일 패턴 동시 수정<br>**(백엔드)** `teamplus-backend/src/notices/dto/create-notice.dto.ts` |
| **오류 메시지** | `[Admin API] ✗ POST /notices 400 입력값 검증에 실패했습니다.` · `[NoticeManagementPage] 공지사항 등록 실패: AxiosError` (page.tsx:165)                                                              |
| **원인 분석**   | 어드민 등록 폼의 클라이언트 검증이 **빈값(`!newNotice.title.trim() \|\| !newNotice.content.trim()`)만** 확인하고, 백엔드 `CreateNoticeDto`의 `@MinLength(2)` (title) / `@MinLength(10)` (content) 규칙을 누락하여 짧은 입력값이 그대로 전송 → 백엔드 ValidationPipe가 400 반환. 또한 `startDate`/`endDate` 가 `<input type="date">` 의 `YYYY-MM-DD` 형식으로 전송되는데 일부 `@IsDateString()` 구현은 full ISO 8601 만 허용 → 잠재적 검증 실패. catch 블록이 서버 응답의 `errors[].message` 또는 `message` 필드를 추출하지 않아 "공지사항 등록에 실패했습니다." 일반 메시지만 노출되어 사용자가 원인 파악 불가. |
| **심각도**      | 🟠 High (기능 차단 · 사용자가 원인 파악 불가)                                                                                                                                                     |
| **상태**        | ✅ 수정 완료 (2026-05-18) — 주 파일/부 파일 양쪽 모두 적용                                                                                                                                          |

**주의 — 라우트 이중화 (`/dashboard/app/notices` vs `/dashboard/notices`)**: 어드민에 동일 도메인 라우트가 두 개 존재. **실제 호출 컴포넌트는 `NoticeManagementPage` (`dashboard/app/notices/page.tsx`)** 이며 콘솔 식별자로 구분 가능. 추후 정리 권장.

**잘못된 코드 예시** (`page.tsx:220-224`):

```tsx
const handleAddNotice = async () => {
  if (!formData.title || !formData.content) {
    setActionMsg({ type: 'error', text: '제목과 내용을 입력해주세요.' });
    return;
  }
  // ... POST /notices
};

// catch
} catch (error) {
  console.error('[NoticesPage] 공지 저장 실패:', error);
  setActionMsg({ type: 'error', text: '저장에 실패했습니다. 다시 시도해주세요.' });
}
```

**올바른 코드 예시**:

```tsx
const handleAddNotice = async () => {
  const title = formData.title.trim();
  const content = formData.content.trim();

  if (title.length < 2) { setActionMsg({ type: 'error', text: '제목은 2자 이상 입력해주세요.' }); return; }
  if (title.length > 200) { setActionMsg({ type: 'error', text: '제목은 200자 이하로 입력해주세요.' }); return; }
  if (content.length < 10) { setActionMsg({ type: 'error', text: '내용은 10자 이상 입력해주세요.' }); return; }
  if (content.length > 10000) { setActionMsg({ type: 'error', text: '내용은 10,000자 이하로 입력해주세요.' }); return; }
  // ... POST /notices
};

// 서버 검증 메시지 추출 헬퍼
const extractServerErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error !== 'object' || error === null || !('response' in error)) return fallback;
  const respData = (error as { response?: { data?: { message?: string; errors?: Array<{ field?: string; message?: string }> } } }).response?.data;
  const firstFieldError = respData?.errors?.find((e) => e?.message)?.message;
  if (firstFieldError) return firstFieldError;
  if (respData?.message) return respData.message;
  return fallback;
};

// catch
} catch (error) {
  setActionMsg({ type: 'error', text: extractServerErrorMessage(error, '저장에 실패했습니다. 다시 시도해주세요.') });
}
```

**백엔드 검증 규칙 참조** (`teamplus-backend/src/notices/dto/create-notice.dto.ts`):

| 필드      | 검증                                              |
| --------- | ------------------------------------------------- |
| `title`   | `@IsString()` · `@MinLength(2)` · `@MaxLength(200)`   |
| `content` | `@IsString()` · `@MinLength(10)` · `@MaxLength(10000)` |
| `type`    | `@IsEnum(NoticeType)` 옵션 — `general\|important\|maintenance\|event` |

**ValidationPipe 글로벌 설정** (`main.ts`): `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true` — DTO에 없는 필드 포함 시도 400.

**예방 가이드**:

1. 클라이언트 폼 검증은 백엔드 DTO 데코레이터(`@MinLength`, `@MaxLength`, `@IsEnum`, `@IsDateString`)와 **동기화 필수**.
2. 입력 필드에 `maxLength` 속성 + 글자수 카운터(`{value.length} / N자`) 노출 권장 — 사용자 경험 개선.
3. catch 블록은 axios error의 `response.data.errors`/`message`를 우선 추출하여 사용자에게 구체적 사유 표시.
4. DTO 변경 시 어드민/웹 양쪽 클라이언트 검증도 함께 업데이트하는 PR 체크리스트 반영.

---

---

        [Admin] 작성 2026.03.06. 22:35:30

---

### ADMIN-016: 앱 설정 저장 시 빈 이메일 값이 DTO 검증에서 400 발생

| 항목            | 내용                                                                                                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **파일**        | `teamplus-backend/src/app-management/dto/update-app-settings.dto.ts`, `teamplus-admin/src/app/dashboard/app/settings/page.tsx`                                                          |
| **오류 메시지** | `PATCH /api/v1/app/settings 400 Bad Request`                                                                                                                                            |
| **원인 분석**   | 관리자 설정 화면에서 `supportEmail`을 비워 두면 프론트는 빈 문자열 `""`을 전송하지만, 백엔드 DTO의 `@IsOptional() @IsEmail()`은 빈 문자열을 "없음"으로 처리하지 않아 검증 실패가 발생함 |
| **상태**        | ✅ 수정 완료                                                                                                                                                                            |

**잘못된 코드 예시**:

```ts
@IsOptional()
@IsEmail()
supportEmail?: string;
```

**올바른 코드 예시**:

```ts
const emptyStringToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

@IsOptional()
@Transform(emptyStringToUndefined)
@IsEmail()
supportEmail?: string;
```

**예방 가이드**:

1. `@IsOptional()` 필드에 사용자 입력 문자열이 들어오면 `""` 처리 규칙을 먼저 정의합니다.
2. 이메일, URL, 전화번호처럼 형식 검증이 붙은 선택 필드는 DTO 레벨에서 `Transform`으로 정규화합니다.
3. 관리자 폼은 API 응답의 `null`과 사용자 입력의 `""`를 저장 전후 모두 일관되게 정규화합니다.

---

---

        [Admin] 작성 2026.03.06. 19:05:00

---

### ADMIN-015: 공지사항 관리 진입 시 세션 만료로 로그인 페이지 이동

| 항목            | 내용                                                                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **파일**        | `teamplus-admin/src/services/api-client.ts`, `teamplus-admin/src/app/dashboard/app/notices/page.tsx`                                                       |
| **오류 메시지** | `401 Unauthorized` 이후 `/login?redirect=...`로 강제 이동                                                                                                  |
| **원인 분석**   | 백엔드 `POST /auth/refresh`는 refresh token rotation으로 새 `refreshToken`을 반환하지만, 프론트가 기존 refreshToken만 재저장하여 다음 갱신 시 401이 발생함 |
| **상태**        | ✅ 수정 완료                                                                                                                                               |

**잘못된 코드 예시**:

```ts
const refreshToken = getRefreshToken();
const response = await axios.post("/auth/refresh", { refreshToken });
const accessToken =
  response.data?.data?.accessToken || response.data?.accessToken;
setTokens(accessToken, refreshToken); // 회전된 refreshToken 미반영
```

**올바른 코드 예시**:

```ts
const currentRefreshToken = getRefreshToken();
const response = await axios.post("/auth/refresh", {
  refreshToken: currentRefreshToken,
});
const accessToken =
  responseData?.data?.accessToken || responseData?.accessToken;
const nextRefreshToken =
  responseData?.data?.refreshToken ||
  responseData?.refreshToken ||
  currentRefreshToken;
setTokens(accessToken, nextRefreshToken);
```

**예방 가이드**:

1. 토큰 재발급 API에서 `refreshToken` 회전 여부를 사양으로 명시하고 클라이언트 저장 로직을 테스트에 포함합니다.
2. `401 -> refresh -> retry` 시나리오를 E2E/통합 테스트로 추가합니다.
3. 페이지별 API 응답 파싱 시 배열/객체 래퍼를 모두 방어적으로 처리합니다.

---

## 🔴 Critical Issues

### ADMIN-001: XSS 취약점 (dangerouslySetInnerHTML)

| 항목     | 내용                                             |
| -------- | ------------------------------------------------ |
| **파일** | 다수 컴포넌트                                    |
| **문제** | `dangerouslySetInnerHTML` 사용으로 XSS 공격 가능 |
| **영향** | 사용자 세션 탈취, 악성 스크립트 실행             |
| **상태** | ⬜ 미해결                                        |

**문제 코드**:

```tsx
<div dangerouslySetInnerHTML={{ __html: userContent }} />
```

**해결 방안**:

```tsx
// 1. DOMPurify로 HTML 정화
import DOMPurify from "dompurify";

const sanitizedContent = DOMPurify.sanitize(userContent, {
  ALLOWED_TAGS: ["b", "i", "em", "strong", "a", "p", "br"],
  ALLOWED_ATTR: ["href", "target"],
});

<div dangerouslySetInnerHTML={{ __html: sanitizedContent }} />;

// 2. 또는 React 컴포넌트로 변환
import { marked } from "marked";
import parse from "html-react-parser";

const htmlContent = marked(userContent);
const sanitized = DOMPurify.sanitize(htmlContent);
return <>{parse(sanitized)}</>;
```

---

### ADMIN-002: JWT localStorage 저장

| 항목     | 내용                                |
| -------- | ----------------------------------- |
| **파일** | `src/lib/auth.ts`                   |
| **문제** | JWT 토큰을 localStorage에 직접 저장 |
| **영향** | XSS 공격 시 토큰 탈취 가능          |
| **상태** | ⬜ 미해결                           |

**문제 코드**:

```typescript
localStorage.setItem("admin_token", token);
```

**해결 방안**:

```typescript
// 1. httpOnly 쿠키 사용 (서버 측 설정)
// API Route에서 쿠키 설정
import { cookies } from "next/headers";

export async function POST(req: Request) {
  const { token } = await authenticateAdmin();

  cookies().set("admin_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 8, // 8시간 (관리자 세션)
    path: "/",
  });

  return Response.json({ success: true });
}

// 2. 메모리 저장 + httpOnly refresh 토큰 조합
class AuthService {
  private accessToken: string | null = null;

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  getAccessToken() {
    return this.accessToken;
  }

  async refreshAccessToken() {
    // httpOnly 쿠키의 refresh 토큰으로 갱신
    const response = await fetch("/api/auth/refresh", {
      credentials: "include",
    });
    const { accessToken } = await response.json();
    this.accessToken = accessToken;
  }
}
```

---

### ADMIN-003: 직접 localStorage 접근

| 항목     | 내용                                    |
| -------- | --------------------------------------- |
| **파일** | 다수                                    |
| **문제** | 보안 래퍼 없이 직접 localStorage 접근   |
| **영향** | 보안 정책 우회, 일관성 없는 저장소 사용 |
| **상태** | ⬜ 미해결                               |

**해결 방안**:

```typescript
// src/lib/secure-storage.ts
import CryptoJS from "crypto-js";

const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_STORAGE_KEY!;

export const secureStorage = {
  setItem(key: string, value: unknown) {
    const stringValue = JSON.stringify(value);
    const encrypted = CryptoJS.AES.encrypt(
      stringValue,
      ENCRYPTION_KEY,
    ).toString();
    localStorage.setItem(key, encrypted);
  },

  getItem<T>(key: string): T | null {
    const encrypted = localStorage.getItem(key);
    if (!encrypted) return null;

    try {
      const bytes = CryptoJS.AES.decrypt(encrypted, ENCRYPTION_KEY);
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      return JSON.parse(decrypted) as T;
    } catch {
      localStorage.removeItem(key);
      return null;
    }
  },

  removeItem(key: string) {
    localStorage.removeItem(key);
  },

  clear() {
    localStorage.clear();
  },
};
```

---

## 🟠 High Priority Issues

### ADMIN-004: API 통합 미완료

| 항목     | 내용                            |
| -------- | ------------------------------- |
| **파일** | `src/services/`                 |
| **문제** | 일부 API 엔드포인트가 Mock 상태 |
| **영향** | 관리 기능 미동작                |
| **상태** | ⬜ 미해결                       |

**미구현 API 목록**:
| 기능 | 엔드포인트 | 상태 |
|------|-----------|------|
| 클럽 통계 | GET /api/admin/clubs/stats | Mock |
| 결제 내역 | GET /api/admin/payments | Mock |
| 사용자 관리 | PATCH /api/admin/users/:id | Mock |
| 시스템 설정 | PUT /api/admin/settings | Mock |

---

### ADMIN-005: 타입 안전성 부족

| 항목     | 내용                                 |
| -------- | ------------------------------------ |
| **파일** | 다수                                 |
| **문제** | `any` 타입 과다 사용, 타입 가드 부재 |
| **영향** | 런타임 오류 가능성                   |
| **상태** | ⬜ 미해결                            |

**해결 방안**:

```typescript
// 타입 가드 구현
function isUser(obj: unknown): obj is User {
  return (
    typeof obj === "object" && obj !== null && "id" in obj && "email" in obj
  );
}

// Zod 스키마 검증
import { z } from "zod";

const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["admin", "superadmin"]),
});

type User = z.infer<typeof UserSchema>;

function parseUser(data: unknown): User {
  return UserSchema.parse(data);
}
```

---

### ADMIN-006: Null 체크 누락

| 항목     | 내용                                     |
| -------- | ---------------------------------------- |
| **파일** | 다수                                     |
| **문제** | optional chaining 미사용, null 체크 누락 |
| **영향** | "Cannot read property of undefined" 오류 |
| **상태** | ⬜ 미해결                                |

**문제 코드**:

```typescript
const userName = user.profile.name; // user 또는 profile이 null일 수 있음
```

**해결 방안**:

```typescript
const userName = user?.profile?.name ?? "Unknown";
```

---

### ADMIN-007: 인라인 스크립트 보안

| 항목     | 내용                                      |
| -------- | ----------------------------------------- |
| **파일** | HTML/JSX                                  |
| **문제** | 인라인 스크립트에 민감한 코드 포함 가능성 |
| **영향** | CSP 정책 위반, 보안 취약점                |
| **상태** | ⬜ 미해결                                 |

**해결 방안**:

```typescript
// 인라인 스크립트 대신 외부 파일 사용
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "script-src 'self'; object-src 'none';",
          },
        ],
      },
    ];
  },
};
```

---

## 🟡 Medium Priority Issues

### ADMIN-008: Error Boundary 미구현

| 항목     | 내용                        |
| -------- | --------------------------- |
| **파일** | `src/app/`                  |
| **문제** | 전역 에러 바운더리 부재     |
| **영향** | 에러 발생 시 전체 앱 크래시 |
| **상태** | ⬜ 미해결                   |

**해결 방안**:

```tsx
// src/app/error.tsx
"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sentry로 에러 전송
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h2 className="text-xl font-bold mb-4">오류가 발생했습니다</h2>
      <p className="text-gray-600 mb-4">{error.message}</p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-blue-600 text-white rounded"
      >
        다시 시도
      </button>
    </div>
  );
}
```

---

### ADMIN-009: 토큰 갱신 Race Condition

| 항목     | 내용                        |
| -------- | --------------------------- |
| **파일** | `src/lib/auth.ts`           |
| **문제** | 동시 요청 시 토큰 갱신 충돌 |
| **영향** | 인증 오류, 중복 갱신 요청   |
| **상태** | ⬜ 미해결                   |

**해결 방안**:

```typescript
class TokenManager {
  private refreshPromise: Promise<string> | null = null;

  async getValidToken(): Promise<string> {
    const token = this.getAccessToken();

    if (!this.isTokenExpired(token)) {
      return token;
    }

    // 이미 갱신 중이면 기존 Promise 재사용
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.refreshToken().finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  private async refreshToken(): Promise<string> {
    const response = await fetch("/api/auth/refresh", {
      credentials: "include",
    });
    const { accessToken } = await response.json();
    this.setAccessToken(accessToken);
    return accessToken;
  }
}
```

---

### ADMIN-010: 입력 유효성 검증 부재

| 항목     | 내용                                 |
| -------- | ------------------------------------ |
| **파일** | 폼 컴포넌트                          |
| **문제** | 클라이언트 측 유효성 검증 미흡       |
| **영향** | 잘못된 데이터 전송, 사용자 경험 저하 |
| **상태** | ⬜ 미해결                            |

**해결 방안**:

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const ClubSchema = z.object({
  name: z.string().min(2, "클럽명은 2자 이상이어야 합니다"),
  email: z.string().email("올바른 이메일 형식이 아닙니다"),
  phone: z
    .string()
    .regex(/^01[0-9]-\d{3,4}-\d{4}$/, "올바른 전화번호 형식이 아닙니다"),
});

function ClubForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(ClubSchema),
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register("name")} />
      {errors.name && (
        <span className="text-red-500">{errors.name.message}</span>
      )}
      {/* ... */}
    </form>
  );
}
```

---

## 🟢 Low Priority Issues

### ADMIN-011: 의존성 업데이트 필요

| 항목     | 내용                             |
| -------- | -------------------------------- |
| **파일** | `package.json`                   |
| **문제** | 일부 의존성이 outdated 상태      |
| **영향** | 보안 패치 누락, 신규 기능 미사용 |
| **상태** | ⬜ 미해결                        |

**해결 방안**:

```bash
# 업데이트 가능한 패키지 확인
npm outdated

# 안전한 마이너/패치 업데이트
npm update

# 메이저 버전 업데이트 (주의 필요)
npx npm-check-updates -u
npm install
```

---

---

        admin 작성 2026.03.05. 14:30:00

---

### ADMIN-012: localhost:3001 포트 오용으로 API 호출 실패

| 항목     | 내용                                                                            |
| -------- | ------------------------------------------------------------------------------- |
| **파일** | `src/app/dashboard/shop/products/new/page.tsx:30`                               |
| **문제** | 백엔드 포트가 4001인데 일부 페이지에서 fallback URL로 `localhost:3001` 하드코딩 |
| **영향** | 환경변수 미설정 시 API 호출 실패 (404 또는 연결 거부)                           |
| **상태** | ✅ 해결됨 (2026-03-05)                                                          |

**에러 메시지**:

```
Error: connect ECONNREFUSED 127.0.0.1:3001
GET http://localhost:3001/api/v1/shop/products 404 (Not Found)
```

**원인 분석**:

- 백엔드는 포트 `4001`에서 실행
- 일부 파일에서 `NEXT_PUBLIC_API_URL` 환경변수가 없을 때 `localhost:3001`을 fallback 사용
- `NEXT_PUBLIC_API_URL`이 설정된 경우에는 정상 동작하지만 누락 시 버그 발생

**🔴 잘못된 코드 예시**:

```typescript
// ❌ 포트 오류
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
```

**🟢 올바른 코드 예시**:

```typescript
// ✅ 실제 백엔드 포트 4001 사용
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001";
```

**📌 예방 가이드라인**:

1. fallback URL에 항상 포트 **4001** 사용 (3001은 3000대 포트 충돌 흔한 오류)
2. `teamplus-admin/.env.local` 파일에 `NEXT_PUBLIC_API_URL=http://localhost:4001/api/v1` 명시
3. CLAUDE.md의 "Admin API URL 3001 오용" 주의사항 숙지

---

### ADMIN-013: menus/admin 컨트롤러 api/v1 prefix 누락으로 404

| 항목     | 내용                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------- |
| **파일** | `teamplus-backend/src/menus/menus.controller.ts`, `teamplus-backend/src/admin/admin.controller.ts` |
| **문제** | 두 컨트롤러가 `api/v1/` prefix 없이 정의되어 프론트 호출 시 404 발생                               |
| **영향** | 어드민 메뉴 관리(`/menus`), 어드민 유저 관리(`/admin/users`) 전체 동작 불가                        |
| **상태** | ✅ 해결됨 (2026-03-05)                                                                             |

**에러 메시지**:

```
GET /api/v1/menus 404 Not Found
GET /api/v1/admin/users 404 Not Found
```

**원인 분석**:

- `main.ts`에 `app.setGlobalPrefix('api/v1')`가 없음 → 컨트롤러 prefix가 직접 URL이 됨
- `teamplus-admin` `api-client.ts`의 baseURL: `http://localhost:4001/api/v1`
- 프론트가 `/menus` 호출 → 실제 URL: `http://localhost:4001/api/v1/menus`
- 백엔드 `@Controller('menus')` → 응답 경로: `http://localhost:4001/menus` → **불일치**

**🔴 잘못된 코드 예시**:

```typescript
// menus.controller.ts
@Controller("menus") // ❌ api/v1 prefix 누락
export class MenusController {}

// admin.controller.ts
@Controller("admin") // ❌ api/v1 prefix 누락
export class AdminController {}
```

**🟢 올바른 코드 예시**:

```typescript
// menus.controller.ts
@Controller("api/v1/menus") // ✅ 다른 컨트롤러와 일관성 유지
export class MenusController {}

// admin.controller.ts
@Controller("api/v1/admin") // ✅ baseURL과 일치
export class AdminController {}
```

**📌 예방 가이드라인**:

1. 모든 NestJS 컨트롤러는 `@Controller('api/v1/[모듈명]')` 형식으로 통일
2. `main.ts`에 `app.setGlobalPrefix('api/v1')` 추가를 고려하면 컨트롤러에서 prefix 제거 가능
3. 신규 컨트롤러 생성 시 다른 컨트롤러 prefix 패턴 확인 필수

---

---

        [ADMIN] 작성 2026.03.05. 14:06:30

---

### ADMIN-014: NextChunkModuleMissing — dev 서버 `.next` 청크 불일치로 `Cannot find module './8948.js'`

| 항목     | 내용                                                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **파일** | `teamplus-admin/.next/server/webpack-runtime.js` (런타임 산출물), `teamplus-admin/package.json`, `teamplus-admin/next.config.js` |
| **문제** | dev/build가 동일 `.next`를 공유하면서 아티팩트가 혼합되어 청크 로딩 시 `./8948.js`, `./1682.js` 등을 찾지 못함                   |
| **영향** | `/dashboard/members` 등 페이지 렌더링 중 500 에러 발생                                                                           |
| **상태** | ✅ 해결됨 (2026-03-05, dev 산출물 분리 + 캐시 초기화 스크립트 적용)                                                              |

**에러 메시지**:

```text
Error: Cannot find module './8948.js'
Require stack:
- .../.next/server/webpack-runtime.js
- .../.next/server/app/_not-found/page.js
```

**원인 분석**:

- `next dev` 실행 중 `.next` 디렉토리에 이전 청크 참조가 남아 런타임 청크 매핑이 깨짐
- 일부 페이지는 `./8948.js`(루트 청크)를 참조하지만 실제 파일은 `./chunks/8948.js`에만 존재해 `MODULE_NOT_FOUND` 발생

**🔴 잘못된 코드 예시**:

```json
{
  "scripts": {
    "dev": "next dev -p 4000",
    "build": "next build"
  }
}
```

**🟢 올바른 코드 예시**:

```json
{
  "scripts": {
    "dev": "rm -rf .next-dev && next dev -p 4000",
    "build": "rm -rf .next && next build"
  }
}
```

```javascript
// next.config.js
const isDevelopment = process.env.NODE_ENV !== "production";

module.exports = {
  distDir: isDevelopment ? ".next-dev" : ".next",
};
```

**📌 예방 가이드라인**:

1. dev/prod 산출 경로를 분리(`.next-dev`, `.next`)해 동시 실행 시 충돌 차단
2. `Cannot find module './<chunk>.js'` 발생 시 1순위로 `.next` 캐시 손상 여부 확인
3. 실행 중 dev 서버가 있을 때는 빌드 방식(dev/start) 혼용을 피하고, 변경 후 서버를 재시작해 동일 모드 유지

---

---

        [ADMIN] 작성 2026.03.06. 00:00:00

---

### ADMIN-SEC-001: 미들웨어 JWT 파싱 에러 시 인증 우회 취약점 (수정 완료)

| 항목       | 내용                                                                           |
| ---------- | ------------------------------------------------------------------------------ |
| **파일**   | `teamplus-admin/src/middleware.ts` (55-59줄)                                   |
| **심각도** | 🔴 Critical                                                                    |
| **문제**   | JWT 파싱 예외 발생 시 catch 블록에서 `isValid: true`를 반환하여 인증 우회 가능 |
| **영향**   | 유효하지 않은 토큰으로 `/dashboard/*` 보호 라우트 접근 가능                    |
| **상태**   | ✅ 수정 완료 (2026-03-06)                                                      |

**에러 발생 시나리오**:

```
악성 사용자가 조작된 JWT 토큰 전송
→ jwt.verify() 또는 JSON.parse() 예외 발생
→ catch 블록에서 isValid: true 반환 (버그)
→ 미들웨어 통과 → 보호 라우트 접근 허용
```

**🔴 잘못된 코드 예시**:

```typescript
// src/middleware.ts (55-59줄)
try {
  // JWT 파싱 로직
  return { isValid: true, isExpired: false };
} catch (error) {
  return { isValid: true, isExpired: false }; // ❌ 예외 시에도 true 반환 — 인증 우회
}
```

**🟢 올바른 코드 예시**:

```typescript
try {
  // JWT 파싱 로직
  return { isValid: true, isExpired: false };
} catch (error) {
  return { isValid: false, isExpired: false, reason: "parse_error" }; // ✅ 예외 시 false 반환
}
```

**📌 예방 가이드라인**:

1. 미들웨어 catch 블록은 항상 `isValid: false`를 반환해야 함
2. 예외를 인증 성공으로 처리하는 로직은 즉각 수정
3. Edge Runtime 미들웨어 코드 변경 시 인증 우회 시나리오 테스트 필수

---

---

        [Admin] 작성 2026.04.07. 11:30:00

---

### ADMIN-017: ModalHeader 컴포넌트에 `children`으로 제목 전달 시 TypeScript 빌드 실패 (+ 런타임 제목 표시 버그)

| 항목            | 내용                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **파일**        | `src/app/dashboard/common-codes/page.tsx` (2곳: line 595, 662), `src/app/dashboard/tms/page.tsx` (1곳: line 777)                                                                                                                                                                                                                                                                                |
| **오류 메시지** | `Type error: Property 'title' is missing in type '{ children: string; }' but required in type 'ModalHeaderProps'.`                                                                                                                                                                                                                                                                              |
| **원인 분석**   | `ModalHeader` 컴포넌트(`src/components/ui/modal.tsx`)는 `title: string` 을 **필수 prop**으로 요구하고 `children`을 받지 않는데, 일부 페이지에서 `<ModalHeader>제목</ModalHeader>` 형태(children)로 잘못 사용함. TypeScript 빌드가 차단될 뿐 아니라, 타입 체크를 우회하더라도 **런타임에서 제목이 표시되지 않는 UI 버그**까지 함께 유발 (ModalHeader 내부 `<h2>{title}</h2>`가 빈 태그로 렌더됨) |
| **상태**        | ✅ 수정 완료                                                                                                                                                                                                                                                                                                                                                                                    |

**🔴 잘못된 코드 예시**:

```tsx
<Modal isOpen={isGroupModalOpen} onClose={() => setIsGroupModalOpen(false)}>
  <ModalHeader>
    {editingGroup ? "코드 그룹 수정" : "코드 그룹 추가"}
  </ModalHeader>
  {/* ❌ children으로 전달 — TypeScript 에러 + 런타임 제목 안 보임 */}
</Modal>
```

**🟢 올바른 코드 예시**:

```tsx
<Modal isOpen={isGroupModalOpen} onClose={() => setIsGroupModalOpen(false)}>
  <ModalHeader title={editingGroup ? "코드 그룹 수정" : "코드 그룹 추가"} />
  {/* ✅ title prop + self-closing */}
</Modal>
```

**아이콘과 설명도 지원**:

```tsx
<ModalHeader title="배너 삭제" icon={AlertCircle} />
<ModalHeader title="상세 정보" description="배너 노출 기간 및 우선순위" icon={Info} />
```

**예방 가이드라인**:

1. **컴포넌트 API 확인 습관**: `ModalHeader`, `ConfirmModal` 등 공용 컴포넌트 사용 전 `interface XxxProps` 정의를 반드시 확인
2. **`{children}`을 받지 않는 컴포넌트**: TEAMPLUS admin의 `ModalHeader`는 `<h2>{title}</h2>` 내부 렌더링 구조상 children을 받지 않음. 자식 JSX가 필요하면 `ModalBody`를 사용
3. **빌드 타임 검증**: `npm run build` 로 admin 빌드를 정기 실행. 이 버그는 aed94d7 시점부터 존재했으나 빌드가 실행되지 않아 장기간 발견되지 못함
4. **유사 패턴 검색**: 신규 모달 추가 시 `grep -rn "<ModalHeader>" src/` 로 children 방식 사용이 없는지 확인

---

### ADMIN-018: ConfirmModal 컴포넌트에 `message` prop 전달 (올바른 prop은 `description`)

| 항목            | 내용                                                                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **파일**        | `src/app/dashboard/common-codes/page.tsx` (line 771), `src/app/dashboard/tms/page.tsx` (line 970)                                                                                                                        |
| **오류 메시지** | `Type error: Property 'message' does not exist on type 'IntrinsicAttributes & ConfirmModalProps'.`                                                                                                                       |
| **원인 분석**   | `ConfirmModal` 컴포넌트의 실제 prop 이름은 `description: string` 이지만, 일부 페이지에서 `message={...}` 로 잘못 전달함. TypeScript 빌드가 차단되며, 타입 체크를 우회하더라도 **런타임에서 설명 텍스트가 표시되지 않음** |
| **상태**        | ✅ 수정 완료                                                                                                                                                                                                             |

**🔴 잘못된 코드 예시**:

```tsx
<ConfirmModal
  isOpen={!!deleteTarget}
  onClose={() => setDeleteTarget(null)}
  onConfirm={handleDelete}
  title="삭제 확인"
  message={`"${deleteTarget?.name}"을(를) 삭제하시겠습니까?`}
  {/* ❌ message는 ConfirmModalProps에 없는 prop */}
  confirmText="삭제하기"
  variant="danger"
/>
```

**🟢 올바른 코드 예시**:

```tsx
<ConfirmModal
  isOpen={!!deleteTarget}
  onClose={() => setDeleteTarget(null)}
  onConfirm={handleDelete}
  title="삭제 확인"
  description={`"${deleteTarget?.name}"을(를) 삭제하시겠습니까?`}
  {/* ✅ description 사용 */}
  confirmText="삭제하기"
  variant="danger"
/>
```

**`ConfirmModalProps` 전체 스펙** (`src/components/ui/modal.tsx`):

```ts
interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string; // ← 본문 텍스트 (message 아님)
  variant?: "danger" | "warning" | "info" | "success";
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  size?: ModalSize;
}
```

**예방 가이드라인**:

1. **`message` ≠ `description`**: `LoadingSpinner` 는 `message` prop을 받지만 `ConfirmModal` 은 `description`. 비슷해 보이는 prop 이름이라도 컴포넌트별로 확인
2. **공용 컴포넌트 문서화**: `src/components/ui/modal.tsx` 에 JSDoc 주석으로 각 prop 설명이 이미 있음. 사용 전 해당 주석 참고
3. **유사 패턴 검색**: 신규 확인 모달 추가 시 `grep -rn "message=" src/app/dashboard/ | grep -i "ConfirmModal"` 로 오용 여부 확인

---

---

        admin 작성 2026.04.11. 23:30:00 (하네스 정합성 동기화)

---

### ADMIN-019: Shop 상품 리치텍스트 렌더링 3개 페이지 XSS 취약점 (DOMPurify 미적용)

**발견일**: 2026-04-11
**커밋**: `3cd8dbd` — `fix(security): Admin XSS 취약점 3건 + menus 전체 조회 엔드포인트 권한 보강`
**심각도**: 🔴 High

**문제**:
어드민 쇼핑몰 상품 관리 3개 페이지에서 `dangerouslySetInnerHTML={{ __html: product.description }}`을 DOMPurify 없이 사용하여 저장 XSS 공격이 가능한 상태였음. 사용자가 입력한 상품 설명에 `<script>`, `<img onerror>`, `javascript:` 등이 포함될 경우 어드민 화면에서 임의 스크립트 실행.

**영향 파일**:

1. `teamplus-admin/src/app/dashboard/shop/products/new/page.tsx:983`
2. `teamplus-admin/src/app/dashboard/shop/products/[id]/edit/page.tsx:770`
3. `teamplus-admin/src/app/dashboard/shop/products/[id]/page.tsx:453`

**잘못된 코드**:

```tsx
<div
  className="prose max-w-none"
  dangerouslySetInnerHTML={{ __html: product.description }}
/>
```

**올바른 코드 (수정 후)**:

```tsx
import DOMPurify from "dompurify";

const sanitized = DOMPurify.sanitize(product.description, {
  ALLOWED_TAGS: [
    "p",
    "br",
    "strong",
    "em",
    "ul",
    "ol",
    "li",
    "a",
    "h2",
    "h3",
    "img",
  ],
  ALLOWED_ATTR: ["href", "title", "src", "alt"],
  ALLOWED_URI_REGEXP:
    /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
});

<div
  className="prose max-w-none"
  dangerouslySetInnerHTML={{ __html: sanitized }}
/>;
```

**원인 분석**:

- teamplus-admin은 이미 `dompurify ^3.3.3`을 의존성에 포함하고 있으나 리치에디터(`ReactQuill`) 출력 렌더링 지점 3곳에서만 누락
- 코드 리뷰 시 "에디터 출력은 신뢰할 수 있다"는 잘못된 가정
- 공용 `SafeHtml` 컴포넌트가 존재하지 않아 파일별로 각자 DOMPurify를 호출해야 했음

**예방 가이드라인**:

1. **`dangerouslySetInnerHTML` 사용 시 DOMPurify 필수** — 예외 없음. 사용자 입력 여부와 무관하게 적용
2. **공용 `SafeHtml` 컴포넌트 제안** — `teamplus-admin/src/components/ui/SafeHtml.tsx`를 만들어 모든 리치 텍스트 렌더링 시 래핑 (후속 작업)
3. **CI grep 게이트** — `rg "dangerouslySetInnerHTML" --type tsx | grep -v DOMPurify` 가 0건임을 빌드 단계에서 검증 (후속 작업)
4. **ReactQuill output sanitize** — ReactQuill `value` 저장 시점에도 서버 측에서 `sanitize-html`로 한 번 더 정화 (이중 방어)

**관련 보안 강화 (같은 커밋)**:

- `GET /api/v1/menus`(전체 메뉴 조회) 엔드포인트 권한 강화 — 기존 @Roles 없음 → `@Roles('ADMIN')` 추가

---

### ADMIN-020: 세션 유휴 타임아웃 동작 (참조)

**발견일**: 2026-04-11 (문서화 누락 식별)

**설명**: `teamplus-admin/src/hooks/useIdleTimer.ts` 가 실제로 존재하며 관리자 세션 유휴 타임아웃을 구현하고 있음. 30분 비활동 시 자동 로그아웃 + 로그인 페이지 리다이렉트. 보안상 올바른 구현이나 **사용자 경험 측면에서 5분 전 경고 모달 부재** — 후속 개선 대상.

---

## 📝 변경 이력

| 날짜       | 버전  | 변경 내용                                                                                                                                                                       |
| ---------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-18 | 1.7.0 | **ADMIN-022 prod Jenkins 배포 실패** (ESLint no-unused-vars 29건 + no-explicit-any 2건 + 잠복 타입 에러 TS2783·TS2698) — 10개 파일 수정, dev·prod 양쪽 반영                     |
| 2026-05-18 | 1.6.0 | ADMIN-021 공지사항 등록 400 검증 실패 추가                                                                                                                                      |
| 2026-04-11 | 1.5.0 | **ADMIN-019 Shop 상품 XSS 3건** (DOMPurify 미적용, shop/products/new · edit · detail), **ADMIN-020 세션 유휴 타임아웃** 문서화 추가 (하네스 정합성 동기화, 커밋 `3cd8dbd` 반영) |
| 2026-04-07 | 1.4.0 | ADMIN-017 ModalHeader children 오사용, ADMIN-018 ConfirmModal message prop 오사용 추가 (kty 브랜치 정리 작업 중 발견 및 수정)                                                   |
| 2026-03-06 | 1.3.0 | ADMIN-SEC-001 추가 (미들웨어 JWT 파싱 에러 시 인증 우회 취약점, 수정 완료)                                                                                                      |
| 2026-03-05 | 1.2.0 | ADMIN-014 추가 (Next.js dev 청크 누락 `Cannot find module './8948.js'` 대응)                                                                                                    |
| 2026-03-05 | 1.1.0 | ADMIN-012 포트 오용, ADMIN-013 prefix 누락 추가 (모두 해결됨)                                                                                                                   |
| 2026-01-19 | 1.0.0 | 초기 문서 작성                                                                                                                                                                  |

---

## 🔗 관련 링크

---

**Last Updated**: 2026-05-14 (실측 SOT 동기화)

- [Error 인덱스](../)
- [Web 에러](../web/web-errors.md)
- [Backend 에러](../backend/backend-errors.md)
- [App 에러](../app/app-errors.md)


---

**SOT v9.4 동기화 확인 (2026-05-23)** — 본 문서는 현재 실측 환경에서 유효: Backend **72 module·152 model·81 controller·773 routes** / Web **245 pages·71 hooks·352 컴포넌트·MESSAGES 200** / Admin **86 pages·38 컴포넌트** / App **211 dart·29 features·16 Bridge** / **Home 13 pages 신규 인지**. 디자인 위반 0 유지(헤더 blur 예외 1건).
